// Baseline-anchored evolutionary trainer. Each candidate agent plays N games
// where the OTHER three seats are fixed `DEFAULT_WEIGHTS` agents at the same
// skill level. Fitness = win rate against this baseline pool. This gives a
// clean, stable selection signal — unlike peer-vs-peer self-play (which lets
// populations drift to weird equilibria) or cross-tier games (where most of
// the variance comes from opponent strength, not from your own play).
//
// Selection and breeding stay within-tier so tiers remain distinct. Seeds
// from src/trainedWeights.json (continue training) or random if absent.
//
// Usage:
//   node train.js                       # 5-minute baseline-anchored training (default)
//   node train.js --minutes 10
//   node train.js --within              # legacy mode: peer-vs-peer within each tier
//   node train.js --cross-tier          # legacy mode: mixed-tier tournaments

import { performance } from 'node:perf_hooks';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import {
  DEFAULT_WEIGHTS,
  createDeck,
  shuffleDeck,
  dealCards,
  determineTrickWinner,
  calculateScores,
  aiChooseTrump,
  aiChooseBid,
  aiChooseCard,
} from './src/gameLogic.js';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const hasFlag = (n) => args.includes(`--${n}`);

const TOTAL_MINUTES = parseFloat(flag('minutes', '5'));
const POPULATION = parseInt(flag('population', '20'), 10);
const ELITE_FRAC = 0.3;
const MUTATION_RATE = 0.12;
const GAMES_PER_EVAL = parseInt(flag('games', '40'), 10);
const ROUNDS_PER_GAME = 8;
const OUTPUT_PATH = 'src/trainedWeights.json';

const TIERS = [
  { key: 'novice',  skill: 1 },
  { key: 'casual',  skill: 3 },
  { key: 'skilled', skill: 5 },
  { key: 'expert',  skill: 7 },
  { key: 'master',  skill: 9 },
];

const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS);

// ─── Genome ops ──────────────────────────────────────────────

function randomGenome() {
  const g = {};
  for (const k of WEIGHT_KEYS) g[k] = DEFAULT_WEIGHTS[k] * (1 + (Math.random() - 0.5));
  return g;
}

function mutate(genome) {
  const child = { ...genome };
  for (const k of WEIGHT_KEYS) {
    if (Math.random() < 0.4) {
      const sigma = Math.abs(genome[k]) * MUTATION_RATE + 0.05;
      child[k] += (Math.random() - 0.5) * 2 * sigma;
    }
  }
  return child;
}

function crossover(a, b) {
  const child = {};
  for (const k of WEIGHT_KEYS) child[k] = Math.random() < 0.5 ? a[k] : b[k];
  return child;
}

// ─── Game (4 agents w/ per-player weights → winner index) ────

const nextPlayer = (p) => (p + 1) % 4;
const leftOf = (p) => (p + 1) % 4;

function playRound(dealer, agents, skill) {
  const hands = dealCards(shuffleDeck(createDeck()));
  const chooser = leftOf(dealer);
  const trumpSuit = aiChooseTrump(hands[chooser], skill, agents[chooser]);

  const bids = [null, null, null, null];
  let bidder = chooser;
  for (let i = 0; i < 4; i++) {
    const existing = bids.filter(b => b !== null);
    bids[bidder] = aiChooseBid(hands[bidder], trumpSuit, existing, bidder === dealer, skill, agents[bidder]);
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
      const card = aiChooseCard(hands[player], trick, trumpSuit, leadSuit, skill, bids, tricksTaken, player, playedTricks, null);
      hands[player] = hands[player].filter(c => c.id !== card.id);
      trick.push({ player, card });
      if (leadSuit === null) leadSuit = card.suit;
      player = nextPlayer(player);
    }
    const winner = determineTrickWinner(trick, leadSuit, trumpSuit);
    tricksTaken[winner]++;
    playedTricks.push(trick);
    leader = winner;
  }
  return calculateScores(bids, tricksTaken);
}

function playGame(agents, skill) {
  let dealer = Math.floor(Math.random() * 4);
  const totals = [0, 0, 0, 0];
  for (let r = 0; r < ROUNDS_PER_GAME; r++) {
    if (r > 0) dealer = (dealer + 1) % 4;
    const roundScores = playRound(dealer, agents, skill);
    for (let i = 0; i < 4; i++) totals[i] += roundScores[i];
  }
  const max = Math.max(...totals);
  const winners = totals.map((s, i) => s === max ? i : -1).filter(i => i >= 0);
  return { winners, fractional: 1 / winners.length };
}

// ─── Fitness: win rate vs 3 DEFAULT_WEIGHTS opponents ────────

function evaluateAnchored(candidate, skill, games) {
  let wins = 0;
  for (let g = 0; g < games; g++) {
    // Seat candidate at a random position so seat bias doesn't pollute fitness.
    const seat = Math.floor(Math.random() * 4);
    const agents = [DEFAULT_WEIGHTS, DEFAULT_WEIGHTS, DEFAULT_WEIGHTS, DEFAULT_WEIGHTS];
    agents[seat] = candidate;
    const { winners, fractional } = playGame(agents, skill);
    if (winners.includes(seat)) wins += fractional;
  }
  return wins / games;
}


// ─── Driver ──────────────────────────────────────────────────

function loadSeed() {
  if (!existsSync(OUTPUT_PATH)) return null;
  try { return JSON.parse(readFileSync(OUTPUT_PATH, 'utf8')); }
  catch { return null; }
}

function initPopulation(seed) {
  const pop = [];
  for (let i = 0; i < POPULATION; i++) {
    if (i === 0) pop.push({ ...seed });
    else if (i < POPULATION / 2) pop.push(mutate({ ...seed }));
    else pop.push(mutate(mutate({ ...seed })));
  }
  return pop;
}

function trainTier(skill, deadline, seed) {
  let population = initPopulation(seed);
  let bestEver = { fitness: -Infinity, genome: population[0] };
  let generation = 0;

  while (Date.now() < deadline) {
    const fitness = population.map(g => evaluateAnchored(g, skill, GAMES_PER_EVAL));
    const bestIdx = fitness.indexOf(Math.max(...fitness));
    if (fitness[bestIdx] > bestEver.fitness) {
      bestEver = { fitness: fitness[bestIdx], genome: population[bestIdx] };
    }
    const ranked = fitness.map((f, i) => ({ f, i })).sort((a, b) => b.f - a.f);
    const eliteCount = Math.max(2, Math.floor(POPULATION * ELITE_FRAC));
    const elites = ranked.slice(0, eliteCount).map(r => population[r.i]);
    const next = [...elites];
    while (next.length < POPULATION) {
      const a = elites[Math.floor(Math.random() * elites.length)];
      const b = elites[Math.floor(Math.random() * elites.length)];
      next.push(mutate(crossover(a, b)));
    }
    population = next;
    generation++;
  }
  return { genome: bestEver.genome, fitness: bestEver.fitness, generations: generation };
}

const mode = hasFlag('within') ? 'within' : hasFlag('cross-tier') ? 'cross-tier' : 'anchored';
if (mode !== 'anchored') {
  console.error(`Legacy modes (--within / --cross-tier) are not maintained in this build.`);
  console.error(`Run without flags for baseline-anchored fitness training.`);
  process.exit(1);
}

const seed = loadSeed();
const TOTAL_MS = TOTAL_MINUTES * 60 * 1000;
const PER_TIER_MS = TOTAL_MS / TIERS.length;

console.log(`Mode: BASELINE-ANCHORED`);
console.log(`Seed: ${seed ? 'continuing from ' + OUTPUT_PATH : 'random (no prior weights)'}`);
console.log(`Population: ${POPULATION}, games per evaluation: ${GAMES_PER_EVAL}`);
console.log(`Budget: ${TOTAL_MINUTES} min total, ${(PER_TIER_MS / 1000).toFixed(0)}s per tier\n`);

const trained = {};
const overallStart = performance.now();

for (const tier of TIERS) {
  const tierStart = performance.now();
  const deadline = Date.now() + PER_TIER_MS;
  process.stdout.write(`[${tier.key.padEnd(8)}] skill=${tier.skill} ... `);
  const seedGenome = seed?.[tier.key] ?? randomGenome();
  const result = trainTier(tier.skill, deadline, seedGenome);
  trained[tier.key] = result.genome;
  const elapsed = ((performance.now() - tierStart) / 1000).toFixed(1);
  // Fitness here is win-rate against baseline opponents (0.0–1.0). 0.25 means
  // matching baseline; >0.25 means beating it.
  console.log(`done. ${result.generations} generations in ${elapsed}s, best win-rate vs baseline=${(result.fitness * 100).toFixed(1)}%`);
}

// Auto-enable freshly-trained weights — re-running training means you
// explicitly opted into using them. Flip "enabled" to false in the JSON to
// turn it off without losing the data.
writeFileSync(OUTPUT_PATH, JSON.stringify({ enabled: true, ...trained }, null, 2));

const totalElapsed = ((performance.now() - overallStart) / 1000).toFixed(1);
console.log(`\nTraining complete in ${totalElapsed}s. Wrote ${OUTPUT_PATH}\n`);

console.log('Master genome (shift from defaults):');
for (const k of WEIGHT_KEYS) {
  const v = trained.master[k];
  const d = DEFAULT_WEIGHTS[k];
  const diff = ((v - d) / d * 100).toFixed(0);
  console.log(`  ${k.padEnd(20)} ${v.toFixed(3).padStart(8)}  (default ${d}, ${diff > 0 ? '+' : ''}${diff}%)`);
}
