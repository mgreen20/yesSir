const cdk = require('aws-cdk-lib');
const { YesSirStack } = require('../lib/stack');

const app = new cdk.App();
new YesSirStack(app, 'YesSirStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
