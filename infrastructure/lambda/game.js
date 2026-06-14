import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import {
  createDeck, shuffleDeck, dealCards, getPlayableCards,
  aiChooseTrump, aiChooseBid, aiChooseCard,
  computeHitRates, weightsForSkill, DEFAULT_WEIGHTS, NO_TRUMP,
} from './gameLogic.js';
import { PHASES, initialGameState, gameReducer, leftOfDealer, getNextPlayer } from './gameReducer.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function personalizeState(gameState, seat, players) {
  const { hands, ...rest } = gameState;
  return {
    ...rest,
    myHand: hands[seat],
    opponentCardCounts: hands.map((h, i) => i === seat ? null : h.length),
    playableCards: gameState.phase === PHASES.PLAYING && gameState.currentPlayer === seat
      ? getPlayableCards(
          hands[seat],
          gameState.currentTrick.length === 0 ? null : gameState.leadSuit,
        )
      : [],
    playerNames: players.map(p => p.name),
    playerEmojis: players.map(p => p.emoji || ''),
    playerSkills: players.map(p => p.skill || 0),
    isAI: players.map(p => p.isAI),
    yourSeat: seat,
  };
}

async function broadcastToGame(gameId, players, gameState, ddb, wsClient, env) {
  const conns = await ddb.send(new ScanCommand({
    TableName: env.CONNECTIONS_TABLE,
    FilterExpression: 'gameId = :g',
    ExpressionAttributeValues: { ':g': gameId },
  }));
  await Promise.allSettled((conns.Items || []).map(conn => {
    const player = players.find(p => p.userId === conn.userId && !p.isAI);
    if (!player) return Promise.resolve();
    const state = personalizeState(gameState, player.seat, players);
    return wsClient.send(new PostToConnectionCommand({
      ConnectionId: conn.connectionId,
      Data: JSON.stringify({ type: 'GAME_STATE', state, yourSeat: player.seat }),
    })).catch(() => {}); // ignore stale connections
  }));
}

async function saveGameState(gameId, newState, ddb, env) {
  await ddb.send(new UpdateCommand({
    TableName: env.GAMES_TABLE,
    Key: { gameId },
    UpdateExpression: 'SET gameState = :s',
    ExpressionAttributeValues: { ':s': newState },
  }));
}

// Count how many human players for a game are currently connected.
async function connectedHumanCount(gameId, players, ddb, env) {
  const result = await ddb.send(new ScanCommand({
    TableName: env.CONNECTIONS_TABLE,
    FilterExpression: 'gameId = :g',
    ExpressionAttributeValues: { ':g': gameId },
  }));
  const connectedUserIds = new Set((result.Items || []).map(c => c.userId));
  return players.filter(p => !p.isAI && connectedUserIds.has(p.userId)).length;
}

// Run AI turns after a state transition until a human player must act (or
// the game/round ends). Returns the final state after all AI moves.
function runAiTurns(state, players) {
  const playerNames = players.map(p => p.name);
  let safety = 0;

  while (safety++ < 60) {
    if (
      state.phase === PHASES.PRE_DEAL ||
      state.phase === PHASES.ROUND_RESULT ||
      state.phase === PHASES.GAME_OVER
    ) break;

    // Stop at TRICK_RESULT — client displays all 4 cards for 2s then sends ADVANCE_TRICK
    if (state.phase === PHASES.TRICK_RESULT) break;

    if (state.phase === PHASES.CHOOSE_TRUMP) {
      const chooser = state.currentBidder;
      if (!players[chooser].isAI) break;
      const p = players[chooser];
      const hand = state.hands[chooser];
      const weights = weightsForSkill(p.skill);
      const trump = aiChooseTrump(hand, p.skill, weights);
      state = gameReducer(state, { type: 'CHOOSE_TRUMP', trump, chooser, playerNames });
      continue;
    }

    if (state.phase === PHASES.BIDDING) {
      const bidder = state.currentBidder;
      if (!players[bidder].isAI) break;
      const p = players[bidder];
      const hand = state.hands[bidder];
      const weights = weightsForSkill(p.skill);
      const isDealer = state.dealer === bidder;
      const existingBids = state.bids.filter(b => b !== null);
      const bid = aiChooseBid(hand, state.trumpSuit, existingBids, isDealer, p.skill, weights);
      state = gameReducer(state, { type: 'BID', bidder, bid, playerNames });
      continue;
    }

    if (state.phase === PHASES.PLAYING) {
      const currentPlayer = state.currentPlayer;
      if (!players[currentPlayer].isAI) break;
      const p = players[currentPlayer];
      const hand = state.hands[currentPlayer];
      const hitRates = computeHitRates(state.bidHistory, state.tricksTakenHistory);
      const leadSuit = state.currentTrick.length === 0 ? null : state.leadSuit;
      const card = aiChooseCard(
        hand,
        state.currentTrick,
        state.trumpSuit,
        leadSuit,
        p.skill,
        state.bids,
        state.tricksTaken,
        currentPlayer,
        state.playedTricks,
        hitRates,
        0,
      );
      state = gameReducer(state, { type: 'PLAY_CARD', player: currentPlayer, card, playerNames });
      continue;
    }

    break;
  }

  return state;
}

// ── handleJoinGame ────────────────────────────────────────────────────────────

export async function handleJoinGame(connectionId, payload, ddb, wsClient, env) {
  const { gameId, userId, username } = payload;

  // Update connection record to attach game + user identity.
  await ddb.send(new UpdateCommand({
    TableName: env.CONNECTIONS_TABLE,
    Key: { connectionId },
    UpdateExpression: 'SET gameId = :g, userId = :u',
    ExpressionAttributeValues: { ':g': gameId, ':u': userId },
  }));

  // Fetch game.
  const gameResult = await ddb.send(new GetCommand({
    TableName: env.GAMES_TABLE,
    Key: { gameId },
  }));
  if (!gameResult.Item) {
    await wsClient.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify({ type: 'ERROR', message: 'Game not found' }),
    })).catch(() => {});
    return;
  }

  const game = gameResult.Item;
  const players = game.players;
  let state = game.gameState || initialGameState();

  // Find this player's seat.
  const player = players.find(p => p.userId === userId && !p.isAI);
  if (!player) {
    await wsClient.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify({ type: 'ERROR', message: 'Player not in this game' }),
    })).catch(() => {});
    return;
  }

  // Persist initial state if this is the first join (game had no state yet).
  if (!game.gameState) {
    await saveGameState(gameId, state, ddb, env);
  }

  // Send personalized state to the joining player immediately.
  const personalState = personalizeState(state, player.seat, players);
  await wsClient.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: JSON.stringify({ type: 'GAME_STATE', state: personalState, yourSeat: player.seat }),
  })).catch(() => {});

  // If the game is in PRE_DEAL, check whether all human players are now connected.
  if (state.phase === PHASES.PRE_DEAL) {
    const humanPlayers = players.filter(p => !p.isAI);
    const connected = await connectedHumanCount(gameId, players, ddb, env);
    if (connected >= humanPlayers.length) {
      // All humans present — auto-deal.
      const playerNames = players.map(p => p.name);
      const deck = shuffleDeck(createDeck());
      const hands = dealCards(deck);
      const newDealer = (state.dealer + 1) % 4;
      state = gameReducer(state, { type: 'DEAL', hands, newDealer, playerNames });

      // Run AI trump/bid turns if needed.
      state = runAiTurns(state, players);

      await saveGameState(gameId, state, ddb, env);
      await broadcastToGame(gameId, players, state, ddb, wsClient, env);
    }
  }
}

// ── handleGameAction ──────────────────────────────────────────────────────────

export async function handleGameAction(connectionId, payload, ddb, wsClient, env) {
  const { gameId, type: actionType, ...actionData } = payload;

  // Look up the acting user from the connection record.
  const connResult = await ddb.send(new GetCommand({
    TableName: env.CONNECTIONS_TABLE,
    Key: { connectionId },
  }));
  if (!connResult.Item) return;
  const userId = connResult.Item.userId;

  // Fetch game.
  const gameResult = await ddb.send(new GetCommand({
    TableName: env.GAMES_TABLE,
    Key: { gameId },
  }));
  if (!gameResult.Item) return;

  const game = gameResult.Item;
  const players = game.players;
  let state = game.gameState || initialGameState();
  const playerNames = players.map(p => p.name);

  // Find the seat for this user.
  const actingPlayer = players.find(p => p.userId === userId && !p.isAI);
  if (!actingPlayer) return;
  const seat = actingPlayer.seat;

  // ── Validate the action ───────────────────────────────────────────────────

  if (actionType === 'DEAL') {
    if (state.phase !== PHASES.PRE_DEAL && state.phase !== PHASES.ROUND_RESULT) return;
    // Anyone can trigger a deal (e.g. "Deal" or "Next Round" button), no per-seat validation.
  } else if (actionType === 'CHOOSE_TRUMP') {
    if (state.phase !== PHASES.CHOOSE_TRUMP) return;
    if (state.currentBidder !== seat) return;
  } else if (actionType === 'BID') {
    if (state.phase !== PHASES.BIDDING) return;
    if (state.currentBidder !== seat) return;
    // Enforce dealer-bid constraint.
    const { bid } = actionData;
    if (bid == null) return;
    const isDealer = state.dealer === seat;
    if (isDealer) {
      const totalSoFar = state.bids.filter(b => b !== null).reduce((s, b) => s + b, 0);
      if (totalSoFar + bid === 13) return;
    }
  } else if (actionType === 'PLAY_CARD') {
    if (state.phase !== PHASES.PLAYING) return;
    if (state.currentPlayer !== seat) return;
    // Validate the card is in hand and is playable.
    const { card } = actionData;
    if (!card) return;
    const hand = state.hands[seat];
    const cardInHand = hand.find(c => c.id === card.id);
    if (!cardInHand) return;
    const leadSuit = state.currentTrick.length === 0 ? null : state.leadSuit;
    const playable = getPlayableCards(hand, leadSuit);
    if (!playable.find(c => c.id === card.id)) return;
  } else if (actionType === 'ADVANCE_TRICK') {
    if (state.phase !== PHASES.TRICK_RESULT) return;
  } else {
    return; // Unknown action type.
  }

  // ── Build and dispatch the action ────────────────────────────────────────

  let action;

  if (actionType === 'DEAL') {
    const deck = shuffleDeck(createDeck());
    const hands = dealCards(deck);
    const newDealer = (state.dealer + 1) % 4;
    action = { type: 'DEAL', hands, newDealer, playerNames };
  } else if (actionType === 'CHOOSE_TRUMP') {
    action = { type: 'CHOOSE_TRUMP', trump: actionData.trump, chooser: seat, playerNames };
  } else if (actionType === 'BID') {
    action = { type: 'BID', bidder: seat, bid: actionData.bid, playerNames };
  } else if (actionType === 'PLAY_CARD') {
    action = { type: 'PLAY_CARD', player: seat, card: actionData.card, playerNames };
  } else if (actionType === 'ADVANCE_TRICK') {
    action = { type: 'ADVANCE_TRICK', playerNames };
  }

  state = gameReducer(state, action);

  // ── Run AI turns until it's a human's turn or the game is in a waiting phase ─

  state = runAiTurns(state, players);

  // ── Persist and broadcast ─────────────────────────────────────────────────

  await saveGameState(gameId, state, ddb, env);
  await broadcastToGame(gameId, players, state, ddb, wsClient, env);
}
