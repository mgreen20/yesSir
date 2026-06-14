const SUITS = ['♠', '♥', '♦', '♣'];
const NO_TRUMP = 'NT';
const SUIT_NAMES = { '♠': 'Spades', '♥': 'Hearts', '♦': 'Diamonds', '♣': 'Clubs', [NO_TRUMP]: 'No Trump' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = {};
RANKS.forEach((r, i) => RANK_VALUES[r] = i);

export { SUITS, NO_TRUMP, SUIT_NAMES, RANKS, RANK_VALUES };

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  return deck;
}

export function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function dealCards(deck) {
  const hands = [[], [], [], []];
  for (let i = 0; i < 52; i++) {
    hands[i % 4].push(deck[i]);
  }
  hands.forEach(hand => {
    hand.sort((a, b) => {
      const suitDiff = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
      if (suitDiff !== 0) return suitDiff;
      return RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
    });
  });
  return hands;
}

export function getCardValue(card, leadSuit, trumpSuit) {
  if (card.suit === trumpSuit) {
    return 100 + RANK_VALUES[card.rank];
  }
  if (card.suit === leadSuit) {
    return RANK_VALUES[card.rank];
  }
  return -1;
}

export function determineTrickWinner(trick, leadSuit, trumpSuit) {
  let bestIdx = 0;
  let bestValue = getCardValue(trick[0].card, leadSuit, trumpSuit);
  for (let i = 1; i < trick.length; i++) {
    const val = getCardValue(trick[i].card, leadSuit, trumpSuit);
    if (val > bestValue) {
      bestValue = val;
      bestIdx = i;
    }
  }
  return trick[bestIdx].player;
}

export function getPlayableCards(hand, leadSuit) {
  if (!leadSuit) return hand;
  const suited = hand.filter(c => c.suit === leadSuit);
  return suited.length > 0 ? suited : hand;
}

export function calculateScores(bids, tricksTaken) {
  const scores = [];
  for (let i = 0; i < 4; i++) {
    if (bids[i] === tricksTaken[i]) {
      scores.push(bids[i] === 0 ? 10 : bids[i] * 10);
    } else {
      scores.push(0);
    }
  }
  return scores;
}

// Tunable heuristic weights for the trump-pick and bid heuristics. These are
// the "genome" the trainer evolves; everything in aiChooseCard is structural
// (skill gates) and stays fixed. Each skill tier (Novice/Casual/Skilled/
// Expert/Master) has its own learned vector under `trainedWeights.json`.
export const DEFAULT_WEIGHTS = {
  // aiChooseTrump
  suitLengthBonus: 2,
  ntAces: 9,
  ntKings: 5,
  ntQueens: 2,
  ntBalanceBonus: 6,
  ntLongPenalty: 4,
  // aiChooseBid (NT branch). Bumped slightly to bid more aggressively —
  // hand-tuned baseline was too conservative, AI was under-bidding hands.
  bidNtAces: 1.0,
  bidNtKings: 0.5,
  bidNtQueens: 0.2,
  bidNtLongBonus: 0.5,
  // aiChooseBid (trump branch). Side A/K bumped up; trump high cards stay
  // at 1.0 (each is already ~a guaranteed trick).
  bidTrumpHighCard: 1.0,
  bidTrumpAce: 0.85,
  bidTrumpKing: 0.4,
  bidTrumpCountBonus: 0.6,
};

// Per-skill-tier trained weights, populated by `train.js`. Callers pass
// `weightsForSkill(skill)` to the AI functions so each tier has its own
// learned heuristic rather than just a different noise level.
let _trainedWeights = null;
export function setTrainedWeights(weightsByTier) {
  _trainedWeights = weightsByTier;
}
export function weightsForSkill(skill) {
  if (!_trainedWeights) return DEFAULT_WEIGHTS;
  let tier;
  if (skill <= 2) tier = 'novice';
  else if (skill <= 4) tier = 'casual';
  else if (skill <= 6) tier = 'skilled';
  else if (skill <= 8) tier = 'expert';
  else tier = 'master';
  return _trainedWeights[tier] ?? DEFAULT_WEIGHTS;
}

// skill: 1-10, affects how well the AI evaluates its hand
export function aiChooseTrump(hand, skill = 7, weights = DEFAULT_WEIGHTS) {
  const w = weights;
  const suitStrength = {};
  for (const suit of SUITS) {
    const cards = hand.filter(c => c.suit === suit);
    let strength = cards.reduce((sum, c) => sum + RANK_VALUES[c.rank], 0) + cards.length * w.suitLengthBonus;
    // Low skill: add noise so they sometimes pick wrong suit
    const noise = (10 - skill) * (Math.random() * 6 - 3);
    suitStrength[suit] = strength + noise;
  }
  const bestSuit = SUITS.reduce((best, s) => suitStrength[s] > suitStrength[best] ? s : best, SUITS[0]);

  // No-trump appeal: top cards spread across suits + balanced distribution.
  // Scale tuned to match per-suit `strength` (best suit typically lands 25-45).
  const aces = hand.filter(c => c.rank === 'A').length;
  const kings = hand.filter(c => c.rank === 'K').length;
  const queens = hand.filter(c => c.rank === 'Q').length;
  const longestSuit = Math.max(...SUITS.map(s => hand.filter(c => c.suit === s).length));
  let ntStrength = aces * w.ntAces + kings * w.ntKings + queens * w.ntQueens;
  if (longestSuit <= 4) ntStrength += w.ntBalanceBonus;
  else if (longestSuit >= 6) ntStrength -= (longestSuit - 5) * w.ntLongPenalty;
  ntStrength += (10 - skill) * (Math.random() * 6 - 3);

  return ntStrength > suitStrength[bestSuit] ? NO_TRUMP : bestSuit;
}

// skill affects bid accuracy
export function aiChooseBid(hand, trumpSuit, existingBids, isDealer, skill = 7, weights = DEFAULT_WEIGHTS) {
  const w = weights;
  let estimate = 0;
  if (trumpSuit === NO_TRUMP) {
    for (const card of hand) {
      if (card.rank === 'A') estimate += w.bidNtAces;
      else if (card.rank === 'K') estimate += w.bidNtKings;
      else if (card.rank === 'Q') estimate += w.bidNtQueens;
    }
    // A long side suit can still run tricks once others are void
    for (const suit of SUITS) {
      const count = hand.filter(c => c.suit === suit).length;
      if (count >= 5) estimate += (count - 4) * w.bidNtLongBonus;
    }
  } else {
    // Trump high cards (J+) — roughly guaranteed tricks; full weight.
    for (const card of hand) {
      if (card.suit === trumpSuit && RANK_VALUES[card.rank] >= RANK_VALUES['J']) {
        estimate += w.bidTrumpHighCard;
      }
    }
    // Side-suit A/K, discounted by suit length. The probability of an
    // opponent being void in a suit rises sharply as our hold on that suit
    // grows: with 13-N cards distributed among 3 opponents, voids become
    // common past N=6. A side A in a 9-card suit is much less reliable than
    // the same A in a 3-card suit because someone will trump.
    for (const suit of SUITS) {
      if (suit === trumpSuit) continue;
      const suitCards = hand.filter(c => c.suit === suit);
      if (suitCards.length === 0) continue;
      const len = suitCards.length;
      // Probability the top card actually scores when led first. Even at
      // length 9 (only 4 cards of the suit distributed across 3 opponents),
      // P(no void with armed trump) is ~70%, not ~20%. The previous curve
      // was too aggressive and pushed borderline hands to bid 0.
      let lengthFactor;
      if (len <= 4) lengthFactor = 1.0;
      else if (len === 5) lengthFactor = 0.95;
      else if (len === 6) lengthFactor = 0.85;
      else if (len === 7) lengthFactor = 0.72;
      else if (len === 8) lengthFactor = 0.55;
      else lengthFactor = 0.40;
      for (const card of suitCards) {
        if (card.rank === 'A') estimate += w.bidTrumpAce * lengthFactor;
        else if (card.rank === 'K') estimate += w.bidTrumpKing * lengthFactor;
      }
    }
    // Trump length bonus — many trumps = many trumping opportunities.
    // Even 3 trumps reliably traps ~1 side-suit trick (trump when void),
    // so give a half-credit. 4+ scales linearly as before.
    const trumpCount = hand.filter(c => c.suit === trumpSuit).length;
    if (trumpCount >= 4) estimate += (trumpCount - 3) * w.bidTrumpCountBonus;
    else if (trumpCount === 3) estimate += w.bidTrumpCountBonus * 0.5;
  }

  // Low skill: add random error to estimate
  const maxError = (10 - skill) * 0.35;
  estimate += (Math.random() * 2 - 1) * maxError;

  let bid = Math.round(estimate);
  bid = Math.max(0, Math.min(13, bid));

  if (isDealer) {
    const totalSoFar = existingBids.reduce((s, b) => s + b, 0);
    const forbidden = 13 - totalSoFar;
    if (bid === forbidden) {
      bid = bid > 0 ? bid - 1 : bid + 1;
    }
  }
  return Math.max(0, Math.min(13, bid));
}

const lowest = (cards) => cards.reduce((lo, c) =>
  RANK_VALUES[c.rank] < RANK_VALUES[lo.rank] ? c : lo, cards[0]);
const highest = (cards) => cards.reduce((hi, c) =>
  RANK_VALUES[c.rank] > RANK_VALUES[hi.rank] ? c : hi, cards[0]);

// ─── Monte Carlo lookahead (1 trick) ───────────────────────────────
//
// For Master-tier players (skill >= 9), instead of picking a card purely
// from heuristics, sample several plausible distributions of opponents'
// hidden hands and roll forward the rest of the current trick using the
// same heuristic AI as the recursive player. Pick the play whose expected
// utility (over samples) is highest. Score function rewards taking tricks
// when we need them, ducking when we're at/over bid, AND blocking opponents
// from bid progress or pushing at-bid opponents into overshoot.

function getUnseenCards(myHand, playedTricks, currentTrick) {
  const seen = new Set();
  for (const c of myHand) seen.add(c.id);
  for (const trick of playedTricks) for (const t of trick) seen.add(t.card.id);
  for (const t of currentTrick) seen.add(t.card.id);
  return createDeck().filter(c => !seen.has(c.id));
}

function sampleOpponentHands(unseen, playerIdx, currentTrick, playedTricks, voids) {
  const tricksCompleted = playedTricks.length;
  const remaining = [13 - tricksCompleted, 13 - tricksCompleted, 13 - tricksCompleted, 13 - tricksCompleted];
  for (const t of currentTrick) remaining[t.player]--;
  const oppIdxs = [0, 1, 2, 3].filter(i => i !== playerIdx);
  const hands = {};
  for (const i of oppIdxs) hands[i] = [];

  // Shuffle unseen
  const shuffled = [...unseen];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Greedy assignment respecting void constraints. If no opponent can
  // accept a card (rare — all valid opps are full), fall back to any with
  // capacity (a small inconsistency we accept for sampling speed).
  for (const card of shuffled) {
    const valid = oppIdxs.filter(o =>
      hands[o].length < remaining[o] && (!voids || !voids[o].has(card.suit)));
    if (valid.length > 0) {
      hands[valid[Math.floor(Math.random() * valid.length)]].push(card);
    } else {
      const any = oppIdxs.filter(o => hands[o].length < remaining[o]);
      if (any.length === 0) break;
      hands[any[Math.floor(Math.random() * any.length)]].push(card);
    }
  }
  return hands;
}

// Simulate the rest of the round (all remaining tricks) starting from our
// candidate card. `simHands` is the full 4-player hand state, including our
// own remaining cards after playing the candidate. Returns the final
// tricksTaken array for the round, suitable for scoring with calculateScores.
function simulateRoundFromMove(firstMove, simHands, ctx) {
  let trick = [...ctx.currentTrick, { player: ctx.playerIdx, card: firstMove }];
  let leadSuit = trick[0].card.suit;
  const playedTricks = [...ctx.playedTricks];
  const tricksTaken = [...ctx.tricksTaken];

  // Finish the current trick — players who haven't played yet take their
  // heuristic turn in clockwise order.
  let inTrick = new Set(trick.map(t => t.player));
  let nextP = (ctx.playerIdx + 1) % 4;
  let safety = 0;
  while (trick.length < 4 && safety++ < 8) {
    if (inTrick.has(nextP)) { nextP = (nextP + 1) % 4; continue; }
    const hand = simHands[nextP];
    if (!hand || hand.length === 0) break;
    const card = aiChooseCard(
      hand, trick, ctx.trumpSuit, leadSuit, ctx.skill,
      ctx.bids, tricksTaken, nextP, playedTricks, ctx.hitRates, 0,
    );
    trick.push({ player: nextP, card });
    simHands[nextP] = hand.filter(c => c.id !== card.id);
    inTrick.add(nextP);
    nextP = (nextP + 1) % 4;
  }
  let winner = determineTrickWinner(trick, leadSuit, ctx.trumpSuit);
  tricksTaken[winner]++;
  playedTricks.push(trick);

  // Continue with subsequent tricks until our hand is empty (round is over
  // when any player has no cards, but in a well-formed game all hands empty
  // simultaneously).
  let roundSafety = 0;
  while (simHands[ctx.playerIdx].length > 0 && roundSafety++ < 14) {
    trick = [];
    leadSuit = null;
    let curPlayer = winner;       // last trick's winner leads
    let trickSafety = 0;
    while (trick.length < 4 && trickSafety++ < 8) {
      const hand = simHands[curPlayer];
      if (!hand || hand.length === 0) break;
      const card = aiChooseCard(
        hand, trick, ctx.trumpSuit, leadSuit, ctx.skill,
        ctx.bids, tricksTaken, curPlayer, playedTricks, ctx.hitRates, 0,
      );
      trick.push({ player: curPlayer, card });
      simHands[curPlayer] = hand.filter(c => c.id !== card.id);
      if (leadSuit === null) leadSuit = card.suit;
      curPlayer = (curPlayer + 1) % 4;
    }
    winner = determineTrickWinner(trick, leadSuit, ctx.trumpSuit);
    tricksTaken[winner]++;
    playedTricks.push(trick);
  }

  return tricksTaken;
}

// Multi-trick MCTS-style evaluation: for each candidate card, run N samples
// of the remaining round and pick the one with highest expected own-score
// minus best opponent's score. The "AlphaZero-lite" approach — determinized
// MC, no UCB tree, simple rollouts using the heuristic AI as opponent model.
function monteCarloPickCard(playable, ctx, samples) {
  if (playable.length === 1) return playable[0];
  const scores = new Array(playable.length).fill(0);

  for (let s = 0; s < samples; s++) {
    const unseen = getUnseenCards(ctx.hand, ctx.playedTricks, ctx.currentTrick);
    const baseHands = sampleOpponentHands(unseen, ctx.playerIdx, ctx.currentTrick, ctx.playedTricks, ctx.voids);

    for (let i = 0; i < playable.length; i++) {
      // Fresh hand state per candidate
      const simHands = {};
      for (const k in baseHands) simHands[k] = [...baseHands[k]];
      simHands[ctx.playerIdx] = ctx.hand.filter(c => c.id !== playable[i].id);

      const finalTricks = simulateRoundFromMove(playable[i], simHands, ctx);
      const finalScores = calculateScores(ctx.bids, finalTricks);
      let bestOpp = 0;
      for (let j = 0; j < 4; j++) {
        if (j === ctx.playerIdx) continue;
        if (finalScores[j] > bestOpp) bestOpp = finalScores[j];
      }
      scores[i] += finalScores[ctx.playerIdx] - bestOpp;
    }
  }

  let bestIdx = 0;
  for (let i = 1; i < playable.length; i++) {
    if (scores[i] > scores[bestIdx]) bestIdx = i;
  }
  return playable[bestIdx];
}

// Filter lead candidates to ones the at-bid opponent likely still holds —
// trump (they must follow if able) OR a suit they haven't been shown void
// in. Leading into the at-bid opp's "live" suits forces them to follow
// with their defense cards instead of dumping junk on us. If we also know
// per-suit play counts, prefer suits the opp has played 2+ of (they're
// running low and more likely forced into a high card). If nothing
// survives the filter, fall back to the original pool.
function targetAtBidOpp(cards, voids, suitCounts, atBidOpp, trumpSuit) {
  if (atBidOpp < 0 || !voids) return cards;
  const targetable = cards.filter(c =>
    c.suit === trumpSuit || !voids[atBidOpp].has(c.suit));
  if (targetable.length === 0) return cards;
  if (suitCounts) {
    const highCommit = targetable.filter(c =>
      c.suit !== trumpSuit && suitCounts[atBidOpp][c.suit] >= 2);
    if (highCommit.length > 0) return highCommit;
  }
  return targetable;
}

// Per-player bid-hit rate over completed rounds. Returns null for any player
// when there's insufficient data (< 3 rounds); callers should default unknown
// opponents to "credible threat" rather than assuming they're weak.
export function computeHitRates(bidHistory, tricksTakenHistory) {
  const rounds = Math.min(bidHistory.length, tricksTakenHistory.length);
  if (rounds < 3) return [null, null, null, null];
  const hits = [0, 0, 0, 0];
  for (let r = 0; r < rounds; r++) {
    for (let p = 0; p < 4; p++) {
      if (bidHistory[r][p] === tricksTakenHistory[r][p]) hits[p]++;
    }
  }
  return hits.map(h => h / rounds);
}

const WEAK_HIT_THRESHOLD = 0.20;
const isWeakOpponent = (hitRates, idx) =>
  hitRates != null && hitRates[idx] != null && hitRates[idx] < WEAK_HIT_THRESHOLD;

// Highest rank in a suit that hasn't been played yet (across prior tricks and
// the in-progress trick). Anything not in `played` is either in our hand or
// in an opponent's hand — so if our top card matches this rank, it's safe.
function highestLiveRank(suit, playedTricks, currentTrick) {
  const played = new Set();
  for (const trick of playedTricks) {
    for (const t of trick) if (t.card.suit === suit) played.add(t.card.rank);
  }
  for (const t of currentTrick) {
    if (t.card.suit === suit) played.add(t.card.rank);
  }
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (!played.has(RANKS[i])) return RANKS[i];
  }
  return null;
}

// Per-player set of suits they're known void in. A player is void in a suit
// if they ever renounced (played off-suit when that suit was led).
function detectVoids(playedTricks, currentTrick) {
  const voids = [new Set(), new Set(), new Set(), new Set()];
  const processTrick = (trick) => {
    if (trick.length === 0) return;
    const leadSuit = trick[0].card.suit;
    for (const t of trick) {
      if (t.card.suit !== leadSuit) voids[t.player].add(leadSuit);
    }
  };
  for (const trick of playedTricks) processTrick(trick);
  processTrick(currentTrick);
  return voids;
}

// Per-player count of cards they've played by suit. Lets us estimate which
// suits each opponent is running short in (and is therefore more likely to
// renounce on the next round of that suit). Used for adaptive leading —
// prefer to lead suits where the at-bid opponent likely still has cards
// (forcing them to follow and potentially overshoot).
function detectSuitCounts(playedTricks, currentTrick) {
  const counts = [
    { '♠': 0, '♥': 0, '♦': 0, '♣': 0 },
    { '♠': 0, '♥': 0, '♦': 0, '♣': 0 },
    { '♠': 0, '♥': 0, '♦': 0, '♣': 0 },
    { '♠': 0, '♥': 0, '♦': 0, '♣': 0 },
  ];
  for (const trick of playedTricks) {
    for (const t of trick) counts[t.player][t.card.suit]++;
  }
  for (const t of currentTrick) counts[t.player][t.card.suit]++;
  return counts;
}

// A card is "safe" to play (or lead) if it's guaranteed to win the trick.
// Two checks: (1) no higher rank in the same suit exists outside our hand
// (everything higher is either played or held by us); (2) for non-trump
// cards, no remaining opponent is void+armed — void in this suit but still
// holding trump, which means they could trump us.
function isCardSafe(card, hand, playedTricks, currentTrick, voids, playerIdx, trumpSuit) {
  const played = new Set();
  for (const trick of playedTricks) {
    for (const t of trick) if (t.card.suit === card.suit) played.add(t.card.rank);
  }
  for (const t of currentTrick) {
    if (t.card.suit === card.suit) played.add(t.card.rank);
  }
  const myRanks = new Set(hand.filter(c => c.suit === card.suit).map(c => c.rank));
  const myRankVal = RANK_VALUES[card.rank];
  for (let i = myRankVal + 1; i < RANKS.length; i++) {
    if (!played.has(RANKS[i]) && !myRanks.has(RANKS[i])) return false;
  }
  if (card.suit !== trumpSuit && trumpSuit !== NO_TRUMP && voids) {
    for (let i = 0; i < 4; i++) {
      if (i === playerIdx) continue;
      if (currentTrick.find(t => t.player === i)) continue;
      if (voids[i].has(card.suit) && !voids[i].has(trumpSuit)) return false;
    }
  }
  return true;
}

// skill affects card play quality. bids/tricksTaken arrays + playerIdx let
// skilled players (skill >= 4) protect their own bid; at skill >= 7 also
// refuse to bail out opponents at bid. playedTricks lets skill >= 8 reason
// about which cards are still "live" so trump-flush and top-live leading
// keep working after the literal aces are gone. hitRates (per-player bid-hit
// rate over prior rounds) lets skilled players skip strategic moves against
// opponents who aren't credible threats — those moves cost us our own bid
// while buying nothing against players who'd miss anyway.
export function aiChooseCard(hand, currentTrick, trumpSuit, leadSuit, skill = 7, bids = null, tricksTaken = null, playerIdx = 0, playedTricks = [], hitRates = null, mcSamples = 0) {
  const playable = getPlayableCards(hand, leadSuit);

  // Low skill: chance to play a random card instead of optimal
  const blunderChance = Math.max(0, (7 - skill) * 0.08);
  if (playable.length > 1 && Math.random() < blunderChance) {
    return playable[Math.floor(Math.random() * playable.length)];
  }

  // Monte Carlo lookahead (Master tier with samples enabled): sample
  // plausible opponent hands, roll forward this trick, pick the play with
  // highest expected utility. Recursive calls inside MC use mcSamples=0 to
  // avoid runaway recursion. Heuristic logic below still runs as fallback
  // when MC isn't engaged.
  if (mcSamples > 0 && skill >= 9 && playable.length > 1) {
    const voidsForMc = detectVoids(playedTricks, currentTrick);
    return monteCarloPickCard(playable, {
      hand, currentTrick, trumpSuit, bids, tricksTaken, playerIdx,
      playedTricks, hitRates, skill, voids: voidsForMc,
    }, mcSamples);
  }

  // Bid-awareness: hand.length equals tricks remaining including this one.
  const myBid = bids ? bids[playerIdx] : null;
  const myTaken = tricksTaken ? tricksTaken[playerIdx] : 0;
  const tracksBid = skill >= 4 && myBid !== null;
  const need = tracksBid ? myBid - myTaken : 1;
  const tricksLeft = hand.length;
  const mustDuck = tracksBid && need <= 0;
  const canDuck = tracksBid && need > 0 && need < tricksLeft;
  // Already can't make our bid even winning every remaining trick → blocking is free.
  const cantMakeBid = tracksBid && need > tricksLeft;

  // Card-counting: track which opponents are known void in which suits, from
  // past renounces. Available at skill >= 6 so Skilled/Expert/Master can
  // pick the lowest *safe* winning card; Novice/Casual don't get this.
  const voids = skill >= 6 ? detectVoids(playedTricks, currentTrick) : null;
  const suitCounts = skill >= 7 ? detectSuitCounts(playedTricks, currentTrick) : null;

  // Opponent bid-status detection — used for "lead-to-bust" (force at-bid
  // opponents into overshoot, which also covers the nil-bidder special
  // case at bid=0/taken=0). Gated at skill >= 7. Picks the first credible
  // at-bid opp; in mixed-bid rounds we mostly only care that one exists.
  let atBidOpp = -1;
  if (skill >= 7 && tracksBid) {
    for (let i = 0; i < 4; i++) {
      if (i === playerIdx) continue;
      if (bids[i] == null) continue;
      if (isWeakOpponent(hitRates, i)) continue;
      const oppNeed = bids[i] - tricksTaken[i];
      if (oppNeed <= 0 && bids[i] >= 0) { atBidOpp = i; break; }
    }
  }

  // Round shape — "under-bid" rounds (sum of bids < 13) have extra tricks
  // floating around that nobody wants; everyone's looking to throw off so we
  // should too. "Over-bid" rounds (> 13) are scarce — tricks contested, so
  // we should fight harder before giving any up.
  const totalBids = bids ? bids.reduce((s, b) => s + (b ?? 0), 0) : 13;
  const underBid = tracksBid && totalBids < 13;
  const overBid = tracksBid && totalBids > 13;

  // Round timing — humans front-load their trick-taking because being "in
  // control" late in the round is dangerous: opponents who've made bid will
  // dump high cards on you, and as suits exhaust, low cards start winning
  // unexpected tricks. So when we need a non-trivial share of remaining
  // tricks AND have realistic winners (a K or higher) AND we're in the
  // first half of the round, hunt aggressively (lead high, take winners,
  // trump voids). Otherwise coast — "easier to throw off than to chase
  // books with mediocre cards" applies.
  const earlyRound = tricksLeft >= 8;
  const hasHighCards = hand.some(c => RANK_VALUES[c.rank] >= RANK_VALUES['K']);
  const huntingEarly = canDuck && earlyRound && need >= 2 && hasHighCards;

  // "Comfortable" slack: enough bid room that sluffing is safe. Lower the
  // threshold in under-bid rounds (extra tricks pile up on whoever's still
  // playing), raise it in over-bid rounds (tricks are precious).
  const slackThreshold = underBid ? 2 : overBid ? 4 : 3;
  const comfortableSlack = canDuck && (tricksLeft - need) >= slackThreshold && !huntingEarly;

  // Refuse-to-bail: trick was led by an opponent who's already made their bid
  // (any more tricks bust them). Play loser instead of overcutting if cost
  // is acceptable — either we're already out, or their bid >= ours. Skip
  // against detected-weak opponents: they'd likely miss bid anyway, so the
  // cost of missing our own bid buys nothing.
  let refuseToBail = false;
  if (skill >= 7 && tracksBid && currentTrick.length > 0) {
    const leaderIdx = currentTrick[0].player;
    if (leaderIdx !== playerIdx && bids[leaderIdx] != null && bids[leaderIdx] > 0
        && !isWeakOpponent(hitRates, leaderIdx)) {
      const leaderNeed = bids[leaderIdx] - tricksTaken[leaderIdx];
      if (leaderNeed <= 0 && (cantMakeBid || bids[leaderIdx] >= myBid)) {
        refuseToBail = true;
      }
    }
  }

  // Deny-the-winner: the current highest card on the trick belongs to an
  // opponent who's still BELOW their bid (this trick would be progress
  // toward making it). Override the default coast/sluff so we take or
  // trump and deny them. Mirrors refuseToBail in shape — both gated at
  // skill >= 7, both skipped against detected-weak opponents (they'd
  // probably miss bid anyway, no point spending our slack to deny).
  let denyWinner = false;
  if (skill >= 7 && tracksBid && currentTrick.length > 0) {
    let bestPlayer = -1;
    let bestVal = -1;
    for (const t of currentTrick) {
      const v = getCardValue(t.card, leadSuit, trumpSuit);
      if (v > bestVal) { bestVal = v; bestPlayer = t.player; }
    }
    if (bestPlayer >= 0 && bestPlayer !== playerIdx && bids[bestPlayer] != null
        && !isWeakOpponent(hitRates, bestPlayer)) {
      const oppNeed = bids[bestPlayer] - tricksTaken[bestPlayer];
      if (oppNeed > 0) denyWinner = true;
    }
  }

  if (!leadSuit) {
    const nonTrump = playable.filter(c => c.suit !== trumpSuit);
    const candidates = nonTrump.length > 0 ? nonTrump : playable;

    // Trump-flush (skill >= 8): if our top trump is still the top *live* trump
    // (no higher trump remains outside our hand) and we hold 3+ trumps, lead
    // it to draw opponents' trumps. Naturally repeats across tricks: round 1
    // leads A, round 2 leads K (now top live), etc. Fires before duck checks
    // because flushing protects future side-suit winners even with bid slack.
    if (skill >= 8 && trumpSuit !== NO_TRUMP && !mustDuck && tracksBid && need >= 2) {
      // Skip flush when no opponent is a credible threat — they won't punish
      // our side-suit winners with trumps, so flushing buys nothing.
      const anyCredibleOpponent = hitRates == null
        || [0, 1, 2, 3].some(i => i !== playerIdx && !isWeakOpponent(hitRates, i));
      const myTrumps = playable.filter(c => c.suit === trumpSuit);
      if (anyCredibleOpponent && myTrumps.length >= 4) {
        const topTrump = highest(myTrumps);
        if (topTrump.rank === highestLiveRank(trumpSuit, playedTricks, currentTrick)) {
          return topTrump;
        }
      }
    }

    // Cash side-suit aces early (skill >= 5): non-trump aces lose all value
    // once an opponent voids out and starts trumping. Lead them while the
    // suit is still in play, even when we have bid slack — taking another
    // trick toward our bid is fine, and letting the A rot is worse.
    if (skill >= 5 && !mustDuck && trumpSuit !== NO_TRUMP) {
      const sideAces = nonTrump.filter(c => c.rank === 'A');
      if (sideAces.length > 0) return sideAces[0];
    }

    // Lead-to-bust (skill >= 7): when an opponent is at-bid (already made
    // their books) or a nil-bidder is at 0/0, the worst thing we can do is
    // coast with low leads — they'll happily duck under and stay at-bid.
    // Instead lead aggressively: force them to either overcut (busting
    // their bid) or burn a high card defending.
    if (mustDuck || (canDuck && !huntingEarly && atBidOpp < 0)) {
      return lowest(candidates);
    }

    // Skill >= 8: prefer leading top-live cards (A while it's out, K once A
    // is played, etc.) — guaranteed winners across all suits we hold them in.
    // Prefer ones in non-risky suits — if an opponent is known void in a
    // suit but still has trump, leading that suit risks being trumped.
    // Additional 1-trick lookahead: when an at-bid opponent exists, prefer
    // leading suits THEY still hold (not known void) so they're forced to
    // follow with a defense card — potentially overcutting into a bust.
    if (skill >= 8) {
      const topLive = candidates.filter(c =>
        c.rank === highestLiveRank(c.suit, playedTricks, currentTrick));
      if (topLive.length > 0) {
        const safe = topLive.filter(c =>
          isCardSafe(c, hand, playedTricks, currentTrick, voids, playerIdx, trumpSuit));
        const pool = safe.length > 0 ? safe : topLive;
        return highest(targetAtBidOpp(pool, voids, suitCounts, atBidOpp, trumpSuit));
      }
    }
    return highest(targetAtBidOpp(candidates, voids, suitCounts, atBidOpp, trumpSuit));
  }

  const suited = playable.filter(c => c.suit === leadSuit);
  if (suited.length > 0) {
    const currentBest = currentTrick.reduce((best, t) => {
      const val = getCardValue(t.card, leadSuit, trumpSuit);
      return val > best ? val : best;
    }, -1);
    const winners = suited.filter(c => getCardValue(c, leadSuit, trumpSuit) > currentBest);
    const losers = suited.filter(c => getCardValue(c, leadSuit, trumpSuit) <= currentBest);

    if (mustDuck) {
      if (losers.length > 0) return highest(losers);
      return lowest(winners);
    }
    if (!denyWinner && ((canDuck && !huntingEarly) || refuseToBail) && losers.length > 0) {
      return highest(losers);
    }

    if (winners.length > 0) {
      // Skill >= 6: prefer the lowest SAFE winner (no higher card outside our
      // hand could overtrump us). Skill 6-7 use rank-only safety; skill 8+
      // also factors in known voids.
      if (skill >= 6) {
        const safe = winners.filter(w =>
          isCardSafe(w, hand, playedTricks, currentTrick, voids, playerIdx, trumpSuit));
        if (safe.length > 0) return lowest(safe);
        // No safe winner — a higher card is still outstanding. If we're 4th
        // to play, that doesn't matter for THIS trick (nobody plays after
        // us), so just take it. Otherwise apply "second hand low": don't
        // burn K when A is still out — duck and let someone else spend
        // their A here so our K becomes top-live for next time. Exception:
        // mustWin (no future tricks to save the card for).
        if (currentTrick.length === 3) return lowest(winners);
        const mustWin = tracksBid && need >= tricksLeft;
        if (!mustWin && losers.length > 0) return highest(losers);
        return lowest(winners);
      }
      return winners[Math.floor(Math.random() * winners.length)];
    }
    return lowest(suited);
  }

  // Void in lead suit
  const trumpCards = playable.filter(c => c.suit === trumpSuit);
  const nonTrump = playable.filter(c => c.suit !== trumpSuit);

  // Sluff only when we *definitely* don't want this trick: already at/past
  // bid (mustDuck), refusing to bail out a leader-at-bid, or have plenty of
  // bid room to spare. The denyWinner override flips comfortable-slack and
  // refuse-to-bail back on when an opponent below their bid is currently
  // winning — we trump them to deny bid progress (mustDuck still wins,
  // because trumping there busts our own bid).
  if (mustDuck || ((refuseToBail || comfortableSlack) && !denyWinner)) {
    if (nonTrump.length > 0) return mustDuck ? highest(nonTrump) : lowest(nonTrump);
    return lowest(trumpCards);
  }

  if (trumpCards.length > 0) {
    // Skill >= 6: pick the lowest *safe* winning trump (one with no higher
    // trump still outstanding). Skill < 6 just plays its lowest trump.
    if (skill >= 6) {
      const currentBestVal = currentTrick.reduce((best, t) => {
        const val = getCardValue(t.card, leadSuit, trumpSuit);
        return val > best ? val : best;
      }, -1);
      const winningTrumps = trumpCards.filter(c => getCardValue(c, leadSuit, trumpSuit) > currentBestVal);
      if (winningTrumps.length > 0) {
        const safe = winningTrumps.filter(w =>
          isCardSafe(w, hand, playedTricks, currentTrick, voids, playerIdx, trumpSuit));
        if (safe.length > 0) return lowest(safe);
        // No safe winning trump — a higher trump is still outstanding.
        // Last to play: take it (no one left to overtrump). Otherwise
        // sluff a non-trump and save the higher trump for when it's safe.
        if (currentTrick.length === 3) return lowest(winningTrumps);
        const mustWin = tracksBid && need >= tricksLeft;
        if (!mustWin && nonTrump.length > 0) return lowest(nonTrump);
        return lowest(winningTrumps);
      }
      // Can't beat the current best trump on the trick — don't burn a higher
      // trump for nothing. Discard a non-trump if we have one.
      if (nonTrump.length > 0) return lowest(nonTrump);
    }
    return lowest(trumpCards);
  }

  return lowest(playable);
}
