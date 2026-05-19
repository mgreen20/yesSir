import { calculateScores, determineTrickWinner, NO_TRUMP, SUIT_NAMES } from "./gameLogic";

export const PHASES = {
  PRE_DEAL: "PRE_DEAL",
  CHOOSE_TRUMP: "CHOOSE_TRUMP",
  BIDDING: "BIDDING",
  PLAYING: "PLAYING",
  TRICK_RESULT: "TRICK_RESULT",
  ROUND_RESULT: "ROUND_RESULT",
  GAME_OVER: "GAME_OVER",
};

export const getNextPlayer = (p) => (p + 1) % 4;
export const leftOfDealer = (d) => (d + 1) % 4;

function trumpAnnouncement(name, trump) {
  return trump === NO_TRUMP
    ? `${name} chose No Trump. Bidding begins!`
    : `${name} chose ${SUIT_NAMES[trump]} as trump. Bidding begins!`;
}

export function initialGameState() {
  return {
    phase: PHASES.PRE_DEAL,
    dealer: 3,
    hands: [[], [], [], []],
    trumpSuit: null,
    bids: [null, null, null, null],
    currentBidder: null,
    tricksTaken: [0, 0, 0, 0],
    currentTrick: [],
    playedTricks: [],
    currentPlayer: null,
    leadSuit: null,
    trickNumber: 0,
    scores: [0, 0, 0, 0],
    roundScores: [0, 0, 0, 0],
    scoreHistory: [],
    bidHistory: [],
    tricksTakenHistory: [],
    message: 'Click "Deal Cards" to start.',
    roundNumber: 0,
  };
}

// Pure reducer — every state transition lives here. Side effects (sounds,
// shuffling the deck, calling AI functions) stay in the caller; the action's
// payload carries whatever the reducer needs (hands, AI's chosen card,
// playerNames for messages).
export function gameReducer(state, action) {
  switch (action.type) {
    case "DEAL": {
      const { hands, newDealer, playerNames } = action;
      const chooser = leftOfDealer(newDealer);
      return {
        ...initialGameState(),
        dealer: newDealer,
        hands,
        // Preserve cross-round AI memory.
        scores: state.scores,
        scoreHistory: state.scoreHistory,
        bidHistory: state.bidHistory,
        tricksTakenHistory: state.tricksTakenHistory,
        roundNumber: state.roundNumber + 1,
        phase: PHASES.CHOOSE_TRUMP,
        currentBidder: chooser,
        message: `Round ${state.roundNumber + 1}: ${playerNames[newDealer]} deals. ${playerNames[chooser]} chooses trump.`,
      };
    }

    case "CHOOSE_TRUMP": {
      const { trump, chooser, playerNames } = action;
      return {
        ...state,
        trumpSuit: trump,
        phase: PHASES.BIDDING,
        currentBidder: leftOfDealer(state.dealer),
        message: trumpAnnouncement(playerNames[chooser], trump),
      };
    }

    case "BID": {
      const { bidder, bid, playerNames } = action;
      const newBids = [...state.bids];
      newBids[bidder] = bid;
      const allBid = newBids.every((b) => b !== null);
      const nextBidder = getNextPlayer(bidder);
      const leader = leftOfDealer(state.dealer);
      const bidderText = bidder === 0 ? "You bid" : `${playerNames[bidder]} bids`;
      return {
        ...state,
        bids: newBids,
        currentBidder: allBid ? null : nextBidder,
        phase: allBid ? PHASES.PLAYING : PHASES.BIDDING,
        currentPlayer: allBid ? leader : state.currentPlayer,
        trickNumber: allBid ? 1 : 0,
        message: allBid
          ? `All bids in! ${playerNames[leader]} leads.`
          : `${bidderText} ${bid}. ${playerNames[nextBidder]}'s turn to bid.`,
      };
    }

    case "PLAY_CARD": {
      const { player, card, playerNames } = action;
      const newHands = state.hands.map((h, i) =>
        i === player ? h.filter((c) => c.id !== card.id) : h,
      );
      const newTrick = [...state.currentTrick, { player, card }];
      const newLeadSuit = state.currentTrick.length === 0 ? card.suit : state.leadSuit;

      if (newTrick.length === 4) {
        const winner = determineTrickWinner(newTrick, newLeadSuit, state.trumpSuit);
        const newTricksTaken = [...state.tricksTaken];
        newTricksTaken[winner]++;
        return {
          ...state,
          hands: newHands,
          currentTrick: newTrick,
          leadSuit: newLeadSuit,
          tricksTaken: newTricksTaken,
          phase: PHASES.TRICK_RESULT,
          currentPlayer: winner,
          message: `${playerNames[winner]} wins trick ${state.trickNumber}!`,
        };
      }

      const playText = player === 0
        ? `You play ${card.rank}${card.suit}`
        : `${playerNames[player]} plays ${card.rank}${card.suit}`;
      return {
        ...state,
        hands: newHands,
        currentTrick: newTrick,
        leadSuit: newLeadSuit,
        currentPlayer: getNextPlayer(player),
        message: playText,
      };
    }

    case "ADVANCE_TRICK": {
      const { playerNames } = action;
      if (state.trickNumber === 13) {
        const roundScores = calculateScores(state.bids, state.tricksTaken);
        const newScores = state.scores.map((s, i) => s + roundScores[i]);
        const isGameOver = state.roundNumber >= 8;
        return {
          ...state,
          phase: isGameOver ? PHASES.GAME_OVER : PHASES.ROUND_RESULT,
          roundScores,
          scores: newScores,
          scoreHistory: [...state.scoreHistory, roundScores],
          bidHistory: [...state.bidHistory, [...state.bids]],
          tricksTakenHistory: [...state.tricksTakenHistory, [...state.tricksTaken]],
          currentTrick: [],
          message: isGameOver ? "Game over!" : "Round complete! Check the scores.",
        };
      }
      return {
        ...state,
        phase: PHASES.PLAYING,
        playedTricks: [...state.playedTricks, state.currentTrick],
        currentTrick: [],
        leadSuit: null,
        trickNumber: state.trickNumber + 1,
        message: `Trick ${state.trickNumber + 1}: ${playerNames[state.currentPlayer]} leads.`,
      };
    }

    default:
      return state;
  }
}
