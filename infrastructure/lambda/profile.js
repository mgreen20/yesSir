import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3  = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const USERS_TABLE   = process.env.USERS_TABLE;
const AVATARS_BUCKET = process.env.AVATARS_BUCKET;

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  const method = event.requestContext.http.method;
  const path   = event.requestContext.http.path;
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub;
  const email  = event.requestContext.authorizer?.jwt?.claims?.email;

  if (!userId) return response(401, { error: 'Unauthorized' });

  // GET /profile — fetch current profile
  if (method === 'GET' && path === '/profile') {
    const result = await ddb.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));
    const item = result.Item || {};
    return response(200, {
      userId,
      email,
      screenname: item.screenname || email.split('@')[0],
      avatarUrl:  item.avatarUrl  || null,
    });
  }

  // PUT /profile — update screenname and/or avatarUrl
  if (method === 'PUT' && path === '/profile') {
    const body = JSON.parse(event.body || '{}');
    const { screenname, avatarUrl } = body;

    const existing = (await ddb.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }))).Item || {};

    await ddb.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: {
        ...existing,
        userId,
        email,
        ...(screenname !== undefined && { screenname }),
        ...(avatarUrl  !== undefined && { avatarUrl }),
        updatedAt: Date.now(),
      },
    }));

    return response(200, { ok: true });
  }

  // POST /profile/avatar-upload-url — return a presigned S3 PUT URL
  if (method === 'POST' && path === '/profile/avatar-upload-url') {
    const body = JSON.parse(event.body || '{}');
    const contentType = body.contentType || 'image/jpeg';
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const key = `avatars/${userId}/${Date.now()}.${ext}`;

    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: AVATARS_BUCKET,
        Key: key,
        ContentType: contentType,
        ACL: 'public-read',
      }),
      { expiresIn: 300 },
    );

    const avatarUrl = `https://${AVATARS_BUCKET}.s3.amazonaws.com/${key}`;
    return response(200, { uploadUrl: url, avatarUrl });
  }

  return response(404, { error: 'Not found' });
}
