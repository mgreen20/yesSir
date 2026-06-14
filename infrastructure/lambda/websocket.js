import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { handleJoinGame, handleGameAction } from './game.js';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const LOBBIES_TABLE     = process.env.LOBBIES_TABLE;
const GAMES_TABLE       = process.env.GAMES_TABLE;
const WS_ENDPOINT       = process.env.WS_ENDPOINT;

async function send(connectionId, data) {
  const client = new ApiGatewayManagementApiClient({ endpoint: WS_ENDPOINT });
  await client.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: JSON.stringify(data),
  }));
}

async function broadcastToGame(gameId, data, excludeConnectionId) {
  const result = await ddb.send(new ScanCommand({
    TableName: CONNECTIONS_TABLE,
    FilterExpression: 'gameId = :g',
    ExpressionAttributeValues: { ':g': gameId },
  }));
  await Promise.allSettled(
    (result.Items || [])
      .filter(item => item.connectionId !== excludeConnectionId)
      .map(item => send(item.connectionId, data))
  );
}

// ── $connect ─────────────────────────────────────────────────────────────────
export async function connect(event) {
  const connectionId = event.requestContext.connectionId;
  const userId = event.requestContext.authorizer?.userId || 'anonymous';

  await ddb.send(new PutCommand({
    TableName: CONNECTIONS_TABLE,
    Item: {
      connectionId,
      userId,
      ttl: Math.floor(Date.now() / 1000) + 86400, // 24h TTL
    },
  }));

  return { statusCode: 200 };
}

// ── $disconnect ───────────────────────────────────────────────────────────────
export async function disconnect(event) {
  const connectionId = event.requestContext.connectionId;
  await ddb.send(new DeleteCommand({ TableName: CONNECTIONS_TABLE, Key: { connectionId } }));
  return { statusCode: 200 };
}

// ── $default (all game messages) ─────────────────────────────────────────────
export async function message(event) {
  const connectionId = event.requestContext.connectionId;
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400 };
  }

  const { action, payload } = body;

  const wsClient = new ApiGatewayManagementApiClient({ endpoint: process.env.WS_ENDPOINT });

  switch (action) {
    case 'JOIN_GAME':
      await handleJoinGame(connectionId, payload, ddb, wsClient, {
        CONNECTIONS_TABLE: process.env.CONNECTIONS_TABLE,
        GAMES_TABLE: process.env.GAMES_TABLE,
      });
      break;

    case 'GAME_ACTION':
      await handleGameAction(connectionId, payload, ddb, wsClient, {
        CONNECTIONS_TABLE: process.env.CONNECTIONS_TABLE,
        GAMES_TABLE: process.env.GAMES_TABLE,
        WS_ENDPOINT: process.env.WS_ENDPOINT,
      });
      break;

    case 'PLAY_CARD': {
      const { gameId, card } = payload;
      const gameResult = await ddb.send(new GetCommand({ TableName: GAMES_TABLE, Key: { gameId } }));
      if (!gameResult.Item) return { statusCode: 404 };

      // Game state update logic will go here (calls gameLogic)
      const updatedState = gameResult.Item.state; // placeholder

      await ddb.send(new PutCommand({
        TableName: GAMES_TABLE,
        Item: { gameId, state: updatedState },
      }));

      await broadcastToGame(gameId, { type: 'GAME_STATE', state: updatedState }, null);
      break;
    }

    case 'CHOOSE_TRUMP': {
      const { gameId, suit } = payload;
      // Trump selection logic will go here
      await broadcastToGame(gameId, { type: 'TRUMP_CHOSEN', suit }, null);
      break;
    }

    case 'SUBMIT_BID': {
      const { gameId, bid } = payload;
      // Bid logic will go here
      await broadcastToGame(gameId, { type: 'BID_SUBMITTED', connectionId, bid }, null);
      break;
    }

    case 'CHAT_MESSAGE': {
      const { lobbyId, gameId, text } = payload;
      const roomId = gameId || lobbyId;
      if (!roomId || !text) break;
      const connResult = await ddb.send(new ScanCommand({
        TableName: CONNECTIONS_TABLE,
        FilterExpression: 'gameId = :r OR lobbyId = :r',
        ExpressionAttributeValues: { ':r': roomId },
      }));
      const senderConn = await ddb.send(new GetCommand({ TableName: CONNECTIONS_TABLE, Key: { connectionId } }));
      const msg = { type: 'CHAT_MESSAGE', text, from: senderConn.Item?.userId || 'Unknown', sentAt: Date.now() };
      await Promise.allSettled(
        (connResult.Items || []).map(item => send(item.connectionId, msg))
      );
      break;
    }

    default:
      await send(connectionId, { type: 'ERROR', message: `Unknown action: ${action}` });
  }

  return { statusCode: 200 };
}
