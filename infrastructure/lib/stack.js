const cdk = require('aws-cdk-lib');
const cognito = require('aws-cdk-lib/aws-cognito');
const dynamodb = require('aws-cdk-lib/aws-dynamodb');
const lambda = require('aws-cdk-lib/aws-lambda');
const apigateway = require('aws-cdk-lib/aws-apigatewayv2');
const integrations = require('aws-cdk-lib/aws-apigatewayv2-integrations');
const authorizers = require('aws-cdk-lib/aws-apigatewayv2-authorizers');
const s3 = require('aws-cdk-lib/aws-s3');
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const origins = require('aws-cdk-lib/aws-cloudfront-origins');
const s3deploy = require('aws-cdk-lib/aws-s3-deployment');
const { Construct } = require('constructs');
const path = require('path');

class YesSirStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // ── Cognito User Pool (auth) ──────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'yes-sir-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
    });

    // ── DynamoDB Tables ───────────────────────────────────────────────────
    const connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      tableName: 'yes-sir-connections',
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const lobbiesTable = new dynamodb.Table(this, 'LobbiesTable', {
      tableName: 'yes-sir-lobbies',
      partitionKey: { name: 'lobbyId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const gamesTable = new dynamodb.Table(this, 'GamesTable', {
      tableName: 'yes-sir-games',
      partitionKey: { name: 'gameId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'yes-sir-users',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Avatars S3 bucket ─────────────────────────────────────────────────
    const avatarsBucket = new s3.Bucket(this, 'AvatarsBucket', {
      bucketName: `yes-sir-avatars-${this.account}`,
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge: 3000,
      }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ── Lambda environment shared across all handlers ─────────────────────
    const lambdaEnv = {
      CONNECTIONS_TABLE: connectionsTable.tableName,
      LOBBIES_TABLE: lobbiesTable.tableName,
      GAMES_TABLE: gamesTable.tableName,
      USERS_TABLE: usersTable.tableName,
      AVATARS_BUCKET: avatarsBucket.bucketName,
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
    };

    const lambdaDir = path.join(__dirname, '../lambda');

    const mkFn = (id, handler) => new lambda.Function(this, id, {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler,
      environment: lambdaEnv,
      timeout: cdk.Duration.seconds(10),
    });

    // ── Lambda handlers ───────────────────────────────────────────────────
    const connectFn    = mkFn('ConnectFn',    'websocket.connect');
    const disconnectFn = mkFn('DisconnectFn', 'websocket.disconnect');
    const messageFn    = mkFn('MessageFn',    'websocket.message');
    const lobbyFn      = mkFn('LobbyFn',      'lobby.handler');
    const profileFn    = mkFn('ProfileFn',    'profile.handler');

    [connectFn, disconnectFn, messageFn, lobbyFn].forEach(fn => {
      connectionsTable.grantReadWriteData(fn);
      lobbiesTable.grantReadWriteData(fn);
      gamesTable.grantReadWriteData(fn);
    });

    usersTable.grantReadWriteData(profileFn);
    avatarsBucket.grantPut(profileFn);

    // ── WebSocket API ─────────────────────────────────────────────────────
    const wsApi = new apigateway.WebSocketApi(this, 'WsApi', {
      apiName: 'yes-sir-ws',
      connectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('ConnectInt', connectFn),
      },
      disconnectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('DisconnectInt', disconnectFn),
      },
      defaultRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('MessageInt', messageFn),
      },
    });

    const wsStage = new apigateway.WebSocketStage(this, 'WsStage', {
      webSocketApi: wsApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Grant Lambdas permission to post back to connected clients
    const wsArn = `arn:aws:execute-api:${this.region}:${this.account}:${wsApi.apiId}/${wsStage.stageName}/POST/@connections/*`;
    [connectFn, disconnectFn, messageFn].forEach(fn => {
      fn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [wsArn],
      }));
    });

    // Pass the WebSocket callback URL to Lambdas
    [connectFn, disconnectFn, messageFn].forEach(fn => {
      fn.addEnvironment('WS_ENDPOINT', wsStage.callbackUrl);
    });

    // ── HTTP API (lobby REST endpoints) ──────────────────────────────────
    const httpApi = new apigateway.HttpApi(this, 'HttpApi', {
      apiName: 'yes-sir-http',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const cognitoAuthorizer = new authorizers.HttpUserPoolAuthorizer(
      'CognitoAuth', userPool, { userPoolClients: [userPoolClient] }
    );

    httpApi.addRoutes({
      path: '/lobbies',
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('LobbyInt', lobbyFn),
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: '/lobbies/{lobbyId}',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('LobbyGetInt', lobbyFn),
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: '/lobbies/{lobbyId}/start',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('StartInt', lobbyFn),
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: '/lobbies/{lobbyId}/leave',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('LeaveInt', lobbyFn),
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: '/lobbies/{lobbyId}/join',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('JoinInt', lobbyFn),
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: '/profile',
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.PUT],
      integration: new integrations.HttpLambdaIntegration('ProfileInt', profileFn),
      authorizer: cognitoAuthorizer,
    });

    httpApi.addRoutes({
      path: '/profile/avatar-upload-url',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('AvatarUploadInt', profileFn),
      authorizer: cognitoAuthorizer,
    });

    // ── S3 + CloudFront (frontend hosting) ───────────────────────────────
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDist', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId',       { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'WsApiUrl',         { value: wsStage.url });
    new cdk.CfnOutput(this, 'HttpApiUrl',        { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'CloudFrontUrl',    { value: `https://${distribution.distributionDomainName}` });
  }
}

module.exports = { YesSirStack };
