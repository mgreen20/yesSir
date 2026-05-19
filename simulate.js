import { performance } from 'node:perf_hooks';
import { readFileSync, existsSync } from 'node:fs';
import {
  NO_TRUMP,
  SUIT_NAMES,
  createDeck,
  shuffleDeck,
  dealCards,
  determineTrickWinner,
  calculateScores,
  aiChooseTrump,
  aiChooseBid,
  aiChooseCard,
  computeHitRates,
  weightsForSkill,
  setTrainedWeights,
} from './src/gameLogic.js';

// Load trained weights if present AND the "enabled" flag is set in the JSON
// so the sim mirrors the app's behavior. Use --baseline to force the default
// heuristic regardless of the flag.
const useBaseline = process.argv.includes('--baseline');
if (!useBaseline && existsSync('src/trainedWeights.json')) {
  const w = JSON.parse(readFileSync('src/trainedWeights.json', 'utf8'));
  if (w.enabled) {
    const tiers = { ...w };
    delete tiers.enabled;
    setTrainedWeights(tiers);
    console.log('(using trained weights from src/trainedWeights.json)\n');
  }
}

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const hasFlag = (name) => args.includes(`--${name}`);

if (hasFlag('help') || hasFlag('h')) {
  console.log(`Usage: node simulate.js [options]
  --games N        number of games to simulate (default 100)
  --rounds N       rounds per game (default 8, matches the app)
  --skills a,b,c,d skill 1-10 for seats P0,P1,P2,P3 (default 7,7,7,7)
  --verbose        print each game's totals
`);
  process.exit(0);
}

const GAMES = parseInt(flag('games', '100'), 10);
const ROUNDS = parseInt(flag('rounds', '8'), 10);
const SKILLS = flag('skills', '7,7,7,7').split(',').map((n) => parseInt(n, 10));
const VERBOSE = hasFlag('verbose');
const MC_SAMPLES = parseInt(flag('mc', '0'), 10);  // Monte Carlo samples for skill >= 9; 0 = off

if (SKILLS.length !== 4 || SKILLS.some((s) => !Number.isFinite(s))) {
  console.error('--skills must be 4 numbers, e.g. --skills 9,7,5,3');
  process.exit(1);
}

const NAMES = ['P0', 'P1', 'P2', 'P3'];
const nextPlayer = (p) => (p + 1) % 4;
const leftOf = (p) => (p + 1) % 4;

function playRound(dealer, bidHistory, tricksTakenHistory) {
  const hands = dealCards(shuffleDeck(createDeck()));
  const hitRates = computeHitRates(bidHistory, tricksTakenHistory);

  const chooser = leftOf(dealer);
  const trumpSuit = aiChooseTrump(hands[chooser], SKILLS[chooser], weightsForSkill(SKILLS[chooser]));

  const bids = [null, null, null, null];
  let bidder = chooser;
  for (let i = 0; i < 4; i++) {
    const existing = bids.filter((b) => b !== null);
    bids[bidder] = aiChooseBid(hands[bidder], trumpSuit, existing, bidder === dealer, SKILLS[bidder], weightsForSkill(SKILLS[bidder]));
    bidder = nextPlayer(bidder);
  }

  const tricksTaken = [0, 0, 0, 0];
  const playedTricks = [];
  let leader = leftOf(dealer);
  for (let t = 0; t < 13; t++) {
    const trick = [];
    let leadSuit = null;
    let player = leader;
    for (let i = 0; i < 4; i++) {
      const card = aiChooseCard(hands[player], trick, trumpSuit, leadSuit, SKILLS[player], bids, tricksTaken, player, playedTricks, hitRates, MC_SAMPLES);
      hands[player] = hands[player].filter((c) => c.id !== card.id);
      trick.push({ player, card });
      if (leadSuit === null) leadSuit = card.suit;
      player = nextPlayer(player);
    }
    const winner = determineTrickWinner(trick, leadSuit, trumpSuit);
    tricksTaken[winner]++;
    playedTricks.push(trick);
    leader = winner;
  }

  return { trumpSuit, bids, tricksTaken, scores: calculateScores(bids, tricksTaken) };
}

function playGame() {
  let dealer = 3;
  const totals = [0, 0, 0, 0];
  const matched = [0, 0, 0, 0];
  const trumpCounts = { '♠': 0, '♥': 0, '♦': 0, '♣': 0, [NO_TRUMP]: 0 };
  const bidHistory = [];
  const tricksTakenHistory = [];

  for (let r = 0; r < ROUNDS; r++) {
    if (r > 0) dealer = (dealer + 1) % 4;
    const res = playRound(dealer, bidHistory, tricksTakenHistory);
    trumpCounts[res.trumpSuit]++;
    for (let i = 0; i < 4; i++) {
      totals[i] += res.scores[i];
      if (res.bids[i] === res.tricksTaken[i]) matched[i]++;
    }
    bidHistory.push(res.bids);
    tricksTakenHistory.push(res.tricksTaken);
  }

  const max = Math.max(...totals);
  const winners = totals.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0);
  return { totals, matched, trumpCounts, winners };
}

const t0 = performance.now();
const wins = [0, 0, 0, 0];
const ties = [0, 0, 0, 0];
const cumScore = [0, 0, 0, 0];
const cumMatched = [0, 0, 0, 0];
const cumTrump = { '♠': 0, '♥': 0, '♦': 0, '♣': 0, [NO_TRUMP]: 0 };

for (let g = 0; g < GAMES; g++) {
  const r = playGame();
  for (let i = 0; i < 4; i++) {
    cumScore[i] += r.totals[i];
    cumMatched[i] += r.matched[i];
  }
  for (const k of Object.keys(cumTrump)) cumTrump[k] += r.trumpCounts[k];

  if (r.winners.length === 1) wins[r.winners[0]]++;
  else for (const w of r.winners) ties[w]++;

  if (VERBOSE) {
    console.log(`Game ${g + 1}: totals=${r.totals.join('/')} winner(s)=${r.winners.map((i) => NAMES[i]).join(',')}`);
  }
}

const elapsed = (performance.now() - t0) / 1000;

console.log(`\nResults over ${GAMES} games (${ROUNDS} rounds each), skills [${SKILLS.join(', ')}]:`);
console.log('Player  Skill   Wins         Ties   Avg score   Bids hit');
for (let i = 0; i < 4; i++) {
  const winPct = ((wins[i] / GAMES) * 100).toFixed(1);
  const avg = (cumScore[i] / GAMES).toFixed(1);
  const hitRate = ((cumMatched[i] / (GAMES * ROUNDS)) * 100).toFixed(1);
  console.log(
    `  ${NAMES[i]}     ${String(SKILLS[i]).padStart(2)}    ${String(wins[i]).padStart(4)} (${winPct.padStart(5)}%)  ${String(ties[i]).padStart(4)}   ${avg.padStart(6)}      ${hitRate.padStart(5)}%`
  );
}

const totalTrump = Object.values(cumTrump).reduce((s, n) => s + n, 0);
console.log('\nTrump choices across all rounds:');
for (const [k, n] of Object.entries(cumTrump)) {
  const pct = ((n / totalTrump) * 100).toFixed(1);
  console.log(`  ${SUIT_NAMES[k].padEnd(10)} ${String(n).padStart(5)} (${pct}%)`);
}
console.log(`\nElapsed: ${elapsed.toFixed(2)}s`);
