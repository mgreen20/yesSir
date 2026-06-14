import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const LOBBIES_TABLE = process.env.LOBBIES_TABLE;
const GAMES_TABLE   = process.env.GAMES_TABLE;

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  const method   = event.requestContext.http.method;
  const path     = event.requestContext.http.path;
  const userId   = event.requestContext.authorizer?.jwt?.claims?.sub;
  const username = event.requestContext.authorizer?.jwt?.claims?.email;

  // GET /lobbies — list open + starting lobbies
  if (method === 'GET' && path === '/lobbies') {
    const result = await ddb.send(new ScanCommand({
      TableName: LOBBIES_TABLE,
      FilterExpression: '#s = :open OR #s = :starting',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':open': 'OPEN', ':starting': 'STARTING' },
    }));
    return response(200, { lobbies: result.Items || [] });
  }

  // GET /lobbies/{lobbyId} — get a specific lobby regardless of status
  if (method === 'GET' && path.match(/^\/lobbies\/[^/]+$/)) {
    const lobbyId = path.split('/')[2];
    const result = await ddb.send(new GetCommand({ TableName: LOBBIES_TABLE, Key: { lobbyId } }));
    if (!result.Item) return response(404, { error: 'Lobby not found' });
    return response(200, { lobby: result.Item });
  }

  // POST /lobbies — create a lobby
  if (method === 'POST' && path === '/lobbies') {
    const lobbyId = randomUUID();
    const lobby = {
      lobbyId,
      hostId: userId,
      hostName: username,
      players: [{ userId, username }],
      status: 'OPEN',
      createdAt: Date.now(),
    };
    await ddb.send(new PutCommand({ TableName: LOBBIES_TABLE, Item: lobby }));
    return response(201, { lobby });
  }

  // POST /lobbies/{lobbyId}/join — join a lobby
  if (method === 'POST' && path.endsWith('/join')) {
    const lobbyId = event.pathParameters?.lobbyId;
    const lobbyResult = await ddb.send(new GetCommand({ TableName: LOBBIES_TABLE, Key: { lobbyId } }));
    const lobby = lobbyResult.Item;

    if (!lobby) return response(404, { error: 'Lobby not found' });
    if (lobby.status !== 'OPEN') return response(409, { error: 'Lobby is not open' });
    if (lobby.players.length >= 4) return response(409, { error: 'Lobby is full' });
    if (lobby.players.find(p => p.userId === userId)) return response(409, { error: 'Already in lobby' });

    const rawPlayers = [...lobby.players, { userId, username }];
    // Normalize to the full player shape game.js expects
    const updatedPlayers = rawPlayers.map((p, i) => ({
      seat: i,
      userId: p.userId,
      username: p.username,
      name: (p.username || '').split('@')[0] || p.username,
      isAI: false,
      emoji: p.emoji || '',
      skill: p.skill || 0,
    }));
    const isFull = updatedPlayers.length === 4;

    await ddb.send(new UpdateCommand({
      TableName: LOBBIES_TABLE,
      Key: { lobbyId },
      UpdateExpression: 'SET players = :p, #s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':p': updatedPlayers,
        ':s': isFull ? 'STARTING' : 'OPEN',
      },
    }));

    // If lobby is now full, create the game and store gameId in lobby
    if (isFull) {
      const gameId = randomUUID();
      await Promise.all([
        ddb.send(new PutCommand({
          TableName: GAMES_TABLE,
          Item: { gameId, lobbyId, players: updatedPlayers, createdAt: Date.now() },
        })),
        ddb.send(new UpdateCommand({
          TableName: LOBBIES_TABLE,
          Key: { lobbyId },
          UpdateExpression: 'SET players = :p, #s = :s, gameId = :g',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':p': updatedPlayers, ':s': 'STARTING', ':g': gameId },
        })),
      ]);
      return response(200, { lobby: { ...lobby, players: updatedPlayers, status: 'STARTING', gameId }, gameId });
    }

    return response(200, { lobby: { ...lobby, players: updatedPlayers } });
  }

  // POST /lobbies/{lobbyId}/start — host forces game start (fill-with-AI flow)
  if (method === 'POST' && path.endsWith('/start')) {
    const lobbyId = path.split('/')[2];
    const lobbyResult = await ddb.send(new GetCommand({ TableName: LOBBIES_TABLE, Key: { lobbyId } }));
    const lobby = lobbyResult.Item;
    if (!lobby) return response(404, { error: 'Lobby not found' });
    if (lobby.hostId !== userId) return response(403, { error: 'Only the host can start' });

    // Client sends the full player list including AI bots
    const body = event.body ? JSON.parse(event.body) : {};
    const players = body.players || lobby.players.map((p, i) => ({
      seat: i, userId: p.userId, username: p.username,
      name: (p.username || '').split('@')[0], isAI: false, emoji: '', skill: 0,
    }));

    const gameId = randomUUID();
    await Promise.all([
      ddb.send(new PutCommand({
        TableName: GAMES_TABLE,
        Item: { gameId, lobbyId, players, createdAt: Date.now() },
      })),
      ddb.send(new UpdateCommand({
        TableName: LOBBIES_TABLE,
        Key: { lobbyId },
        UpdateExpression: 'SET #s = :s, gameId = :g',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':s': 'STARTING', ':g': gameId },
      })),
    ]);
    return response(200, { gameId });
  }

  // POST /lobbies/{lobbyId}/leave — remove current user from lobby
  if (method === 'POST' && path.endsWith('/leave')) {
    const lobbyId = path.split('/')[2];
    const lobbyResult = await ddb.send(new GetCommand({ TableName: LOBBIES_TABLE, Key: { lobbyId } }));
    const lobby = lobbyResult.Item;
    if (!lobby) return response(404, { error: 'Lobby not found' });

    const updatedPlayers = lobby.players.filter(p => p.userId !== userId);

    if (updatedPlayers.length === 0) {
      await ddb.send(new DeleteCommand({ TableName: LOBBIES_TABLE, Key: { lobbyId } }));
    } else {
      await ddb.send(new UpdateCommand({
        TableName: LOBBIES_TABLE,
        Key: { lobbyId },
        UpdateExpression: 'SET players = :p',
        ExpressionAttributeValues: { ':p': updatedPlayers },
      }));
    }
    return response(200, { ok: true });
  }

  return response(404, { error: 'Not found' });
}
