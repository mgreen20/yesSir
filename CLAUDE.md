# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server with HMR
- `npm run build` — production build
- `npm run preview` — serve the production build locally
- `npm run lint` — run ESLint over the repo
- `npm run sim` — run the AI-vs-AI headless simulator (`simulate.js`)

No test framework is configured; `simulate.js` is the primary tool for validating AI changes — see Architecture.

## What this project is

A React (v19) + Vite app implementing **"Yes Sir!"**, a trick-taking card game in the Oh Hell family. Supports both solo play (one human vs three AI opponents) and multiplayer (real-time via WebSocket). Auth and user profiles are backed by AWS Cognito + API Gateway + Lambda. The frontend is hosted on S3 + CloudFront.

## Deployment

```
npm run build
aws s3 sync dist/ s3://yessirstack-sitebucket397a1860-1ulrwxvcmuzy/ --delete
aws cloudfront create-invalidation --distribution-id E6Z2ABRS9N4DV --paths "/*"
```

CDK infrastructure lives in `infrastructure/`. The Lambda functions are in `infrastructure/lambda/`.

## Architecture

The codebase is intentionally small (four source files under `src/`). The important separations:

**`src/gameLogic.js`** — pure, framework-agnostic game rules and AI. No React, no DOM. Contains the deck, dealing, `determineTrickWinner`, `getPlayableCards` (must-follow-suit rule), `calculateScores` (bid × 10 if matched, 10 for a successful nil, else 0), the three AI decision functions (`aiChooseTrump`, `aiChooseBid`, `aiChooseCard`), and helpers for card-counting (`highestLiveRank`, `detectVoids`, `isCardSafe`) and opponent-skill estimation (`computeHitRates`). The AI is **layered by skill** — each tactic is gated on a skill threshold (see Conventions). Keep this file pure — `App.jsx` and `simulate.js` are the consumers.

Also exposes the **tunable weights API**: `DEFAULT_WEIGHTS` (the hand-tuned numbers used by `aiChooseTrump` and `aiChooseBid`), `weightsForSkill(skill)` (returns per-tier learned weights when loaded, falling back to defaults), and `setTrainedWeights(weightsByTier)` (runtime injection). `main.jsx` reads `src/trainedWeights.json` and **only calls `setTrainedWeights` when the JSON's top-level `"enabled": true` flag is set** — otherwise every tier falls through to `DEFAULT_WEIGHTS`. Callers pass `weightsForSkill(skill)` as the last arg to `aiChoose{Trump,Bid}`. Card play has no learned weights — it's all structural skill gates.

**`simulate.js`** (repo root) — headless AI-vs-AI simulator. Drives `gameLogic.js` directly over N games and prints win rates, bid-hit rates, and trump-choice distributions. This is the primary tool for validating AI strategy changes — UI regressions still need a manual playthrough, but strategy regressions show up immediately in the stats. CLI: `node simulate.js --games 2000 --skills 10,7,4,1`. Auto-loads `src/trainedWeights.json` if present; pass `--baseline` to ignore it and run pure `DEFAULT_WEIGHTS`.

**`train.js`** (repo root) — evolutionary trainer for the heuristic weights. Two modes: default **cross-tier** (`node train.js --minutes 5`) where all 5 tier populations play mixed-tier games each generation with within-tier selection, and **within-tier** (`node train.js --within`) where each tier evolves in isolation. Seeds from `src/trainedWeights.json` if present, otherwise random. Writes the per-tier champions back to `src/trainedWeights.json` on completion. The "genome" is the 14 numeric weights in `DEFAULT_WEIGHTS`; `aiChooseCard`'s structural gates are *not* evolved.

**`src/App.jsx`** — the router shell. Routes: `/` → `Lobby` (multiplayer), `/solo` → `SoloLobby`, `/game` → `Game` (solo), `/multiplayer-game` → `MultiplayerGame`, `/settings` → `AccountSettings`, `/stats` → `PlayerStats`, `/login`, `/signup`, `/confirm`. All routes except auth pages are wrapped in `RequireAuth`.

**`src/pages/Lobby.jsx`** — multiplayer lobby. Fetches user profile (`/profile` API) on mount to display the avatar + screen name dropdown in the header (Settings / Log out). Polls `/lobbies`, handles create/join/leave, and navigates to `/multiplayer-game` with game state.

**`src/pages/SoloLobby.jsx`** — solo opponent selection. Same avatar/name dropdown as `Lobby.jsx`. Navigates to `/game` with selected opponents in router state.

**`src/pages/AccountSettings.jsx`** — profile management: screen name, avatar photo upload (S3 presigned URL via `/profile/avatar-upload-url`), email change (Cognito), password change. New users are redirected here automatically after email verification.

**`src/pages/ConfirmEmail.jsx`** — email verification after sign-up. Receives `email` and `password` via router state from `SignUp`; after successful confirmation auto-signs the user in and redirects to `/settings` so they can set up their profile immediately.

**`src/auth.js`** — thin wrappers around AWS Cognito User Pool SDK: `signUp`, `confirmSignUp`, `signIn`, `signOut`, `getCurrentUser`, `getIdToken`, `updateEmail`, `verifyEmailCode`, `changePassword`.

**`src/gameReducer.js`** — pure reducer + action handlers for the game state. Exports `PHASES`, `initialGameState()`, `gameReducer(state, action)`, and the small helpers `leftOfDealer` / `getNextPlayer`. Five action types: `DEAL`, `CHOOSE_TRUMP`, `BID`, `PLAY_CARD`, `ADVANCE_TRICK`. Every state transition lives here; side effects (deck shuffling, AI function calls, win sound) stay in the caller, and the action payload carries whatever the reducer needs (`hands`, the AI's chosen card, `playerNames` for messages). Reducer is pure — safe to call from anywhere, easy to unit-test.

**`src/pages/Game.jsx`** — the orchestrator. Two-layer structure: the outer `Game` reads `opponents` from `location.state` and redirects to `/` if missing (refresh recovery). The inner `GameView` calls `useReducer(gameReducer, ...)`, runs the AI-scheduling and trick-auto-advance effects, dispatches actions, and composes the UI from leaf components in `src/components/`. The state machine is driven by the `PHASES` enum:

```
PRE_DEAL → CHOOSE_TRUMP → BIDDING → PLAYING → TRICK_RESULT
                                            ↓
                                    ROUND_RESULT → (next round or GAME_OVER)
```

AI turns are driven by a `useEffect` that watches `phase`/`currentBidder`/`currentPlayer` and schedules the next AI action via `setTimeout` (stored on `timeoutRef` so it can be cancelled on abort or effect cleanup). When editing game flow, mutate phase + the relevant `current*` index together — the AI effect re-fires off those fields.

**`src/components/`** — presentational leaf components consumed by the pages. The page files own all state and pass props down. Notable ones: `Card` (rank/suit face with red/black styling — used by `TrickArea` and `PlayerHand`), `CardBack` and `OpponentHand` (the three opponent stacks, position-aware orientation), `AvatarCard` (Lobby grid + random reveal), `ScoreCard` (rendered four times at the seats), `GameHeader` / `ScoreTally` / `TableTrump` / `TrickArea` / `PlayerHand` (section components), `TrumpChoices` / `BidChoices` (action panels), `RoundResultModal` / `GameOverModal` (phase overlays). Components have no game state and no router awareness — that all lives in `Game.jsx`.

**`src/avatars.js`** — the 20 selectable opponents, each with a `skill` value 1–10. Skill is the AI's only difficulty knob and is threaded into every `ai*` function in `gameLogic.js`; higher skill = less random noise in trump/bid evaluation and a lower blunder rate during play.

**`src/sounds.js`** — Web Audio API synthesis (no audio files). `playDealSound` (filtered noise burst) and `playWinSound` (ascending arpeggio).

**`src/App.css`** — global styles. Responsive breakpoints at `max-width: 900px` (tablet) and `max-width: 600px` (mobile). On mobile, the table grid reflows to a 3-column layout (west | table | east), score tally is hidden, and opponent card stacks (`.opponent-cards`) are hidden to reduce clutter.

## Conventions worth preserving

- **Seat indexing**: `0 = You (south)`, `1 = West`, `2 = North`, `3 = East`. Dealer rotates clockwise; "left of dealer" is `(dealer + 1) % 4` and chooses trump + leads first.
- **Dealer-bid constraint**: the dealer cannot make the sum of all four bids equal to 13. `getValidBids` and the AI bid logic both enforce this; keep them in sync.
- **Trump representation**: `trumpSuit` is either a member of `SUITS` (`♠ ♥ ♦ ♣`) or the `NO_TRUMP` sentinel `'NT'`. No card has `suit === 'NT'`, so any expression like `card.suit === trumpSuit` or `hand.filter(c => c.suit === trumpSuit)` safely no-ops under No Trump without a special case. Preserve this invariant — add a `=== NO_TRUMP` branch only when the trump-matching shortcut isn't enough (e.g. UI labels, bid heuristics).
- **AI handler timing**: changing the `setTimeout` delays in App.jsx's AI effect changes the perceived pacing of the game; don't shorten them blindly.

- **AI skill gates**: each strategic tactic in `aiChooseCard` is gated on a skill threshold so difficulty progression is meaningful. Roughly:
  - **skill < 4** — no bid-awareness; plays each trick on immediate value, ignoring own bid.
  - **skill ≥ 4** — tracks own bid via `mustDuck` / `canDuck` / `mustWin` modes.
  - **skill ≥ 5** — cashes side-suit aces when leading (even with bid slack), before the duck check. Side aces lose value once an opponent voids out, so leading them early beats hoarding.
  - **skill ≥ 6** — plays the *lowest safe* winning card (rather than any random/lowest winner) AND applies **"second hand low"**: when no winner is safe (a higher card in the suit is still outstanding) and we're not 4th-to-play and not mustWin, duck with a loser instead of burning an unsafe winner. Lets opponents spend their A on this trick so our K becomes top-live for next time. Also computes `voids` from `playedTricks` for the safety check.
  - **skill ≥ 7** — two opponent-modeling tactics, both skipped against detected-weak opponents (via `hitRates`):
     - **`refuseToBail`** — won't overcut a leader who's already at bid (would be bailing them out of overshoot). Cost/benefit gated.
     - **`denyWinner`** — when the current highest card on the trick belongs to an opponent still *below* their bid, override the default duck/sluff and take/trump to deny their progress. This is the mirror of `refuseToBail` and what fires the AI's "trump the human's K when they're hunting bid" behavior.
  - **skill ≥ 8** — card-counting machinery built on `playedTricks`: multi-round trump-flush, top-live leading, void+armed tracking against opponents who've renounced. The "any credible opponent" gate from `hitRates` can suppress these moves when all opponents are weak.

  When adding a tactic, pick its gate to fit these tiers and document it in the function comment. Lower-skill players should stay visibly *worse* — don't accidentally make a new tactic apply unconditionally.

- **`comfortableSlack` aggression knob**: in the void-when-following branch, the AI only sluffs (discards non-trump instead of trumping) when it has *comfortable* bid slack — at least 3 tricks of room. With tight slack (`canDuck` but `tricksLeft - need < 3`), it trumps for the trick. This was added because the original "any slack → sluff" rule made the AI throw off too much against aggressive opponents who'd trump the unprotected suit anyway. If you tune the threshold, mirror the change in the in-suit duck logic to keep behavior coherent.

- **Side-suit length discount in `aiChooseBid`**: side-suit A/K credit is scaled by suit length — full value at length ≤ 4, then 0.95 / 0.85 / 0.72 / 0.55 / 0.40 at lengths 5–9+. The intuition: with 9 cards of a suit in your hand, only 4 remain among 3 opponents — somebody's likely void and may trump your A/K. The curve was originally much steeper but pushed borderline hands to bid 0 unnecessarily; rebalanced based on real void probabilities.

- **3-trump bonus in `aiChooseBid`**: holding exactly 3 trumps gives half the per-trump bonus (`bidTrumpCountBonus * 0.5`, ~0.3 with defaults). 4+ scales linearly as before. Below 3 gets nothing. The reason: even 3 trumps reliably traps one side-suit trick when the AI is forced void; the old "4+ only" formula caused AI to bid 0 on hands that consistently delivered 1.

- **`atBidOpp` / `targetAtBidOpp` lead-to-bust**: when leading at skill ≥ 7 and a non-weak opponent is at-bid, the AI overrides the "lead lowest" duck behavior and leads aggressively. `targetAtBidOpp` further refines the lead suit — prefer trump (forces follow) or a suit the opp still likely holds (not known void), with extra weight to suits they've played 2+ of (they're running low, more likely forced into an overshoot). Uses `detectSuitCounts` for the play-count check. Lower-skill players don't get this — they play their own hand without modeling opponent bid status.

- **Multi-trick MCTS lookahead** (skill ≥ 9, opt-in via `mcSamples > 0`): for Master-tier card decisions, the AI samples plausible opponent-hand distributions (respecting voids), simulates the *entire rest of the round* (`simulateRoundFromMove`) with the heuristic AI as the opponent model, then scores each candidate by `own_round_score - best_opponent_score`. This is determinized MC / AlphaZero-lite — no UCB tree, just per-candidate rollouts averaged over samples. Recursive `aiChooseCard` calls inside the rollout pass `mcSamples=0` to avoid infinite recursion. The App passes `mcSamples=6`; `simulate.js` defaults to 0 with an opt-in `--mc N` flag. Mixed-skill matchups show large gains (gradient 10/7/4/1 Master wins 38.6% → **61.0%** with `--mc 4`). Same-skill self-play is less dramatic because all four use the same MCTS modeling each other heuristically. Cost: ~15× slower than pure heuristic in the simulator; ~100ms per Master decision in the app (~30s total AI thinking per 8-round game, spread across plays so it feels responsive).

- **History threading**: `aiChooseCard` consumes `playedTricks` (every completed trick this round) and `hitRates` (derived from `bidHistory` + `tricksTakenHistory`). Both `App.jsx` state and `simulate.js`'s round loop maintain these. New state with similar lifetime — accumulates within a game, resets on restart — should follow the same shape: a per-round array in App state, appended on trick/round transitions, and a local variable in `playRound`/`playGame` for the simulator.

## ML training — current state

We ran three training experiments (within-tier, cross-tier, baseline-anchored) and ended on the following settled state. The training infrastructure stays in place and the most recent trained weights are kept on disk **but disabled by default**, so the user can toggle them on if curious.

**What's on disk:**
- `src/trainedWeights.json` — **baseline-anchored** weights (5-min run, win-rate vs `DEFAULT_WEIGHTS` opponents as fitness). Has top-level **`"enabled": false`** so the app and simulator currently fall back to `DEFAULT_WEIGHTS`. Per-tier win-rate vs baseline at end of training: Novice 51% / Casual 55% / Skilled 70% / Expert 76% / Master 81%.
- `src/trainedWeights.backup.json` — within-tier trained weights (10-min, peer-vs-peer per tier). Flattened the skill gradient but improved scoring at all tiers in self-play.
- `src/trainedWeights.preanchor.json` — snapshot of `backup.json` used as the seed for the baseline-anchored run.

**Three card-play fixes are unconditionally on** (in `aiChooseCard`, *not* in trained weights):
1. **Cash side-suit aces when leading** (skill ≥ 5) — fires before the duck check.
2. **Trump when void w/ tight slack** — only sluff if `mustDuck` / `refuseToBail` / `comfortableSlack` (≥ 3 tricks of room).
3. **Lowest *safe* winner** (skill ≥ 6) — was skill ≥ 8 before. Also lowered `voids` computation gate to skill ≥ 6.

These fix the human-feel complaints ("AI throws off too much / won't play aces early") and are independent of the training experiment.

**Why training is off:** even the best-trained model (baseline-anchored) produced a non-monotonic skill gradient when trained tiers played each other in the simulator (Skill 1 occasionally beat Skill 7). Each tier got better at beating *fixed-baseline* opponents but their relative ordering wasn't preserved when they fought each other. Baseline weights + the three structural fixes is the cleanest combination for human-vs-AI play.

**To re-enable trained weights:** edit `src/trainedWeights.json` and change `"enabled": false` → `"enabled": true`, then reload. To switch to a different snapshot, copy any of the `*.json` files in `src/` over `trainedWeights.json` (and set `enabled: true`). Re-running `node train.js --minutes N` overwrites `trainedWeights.json` with fresh weights and auto-sets `enabled: true`.

**Future improvements** if someone wants to revisit ML training:
- The "elapsed" log line in `train.js` still has a cosmetic bug (prints raw `Date.now()` seconds instead of elapsed seconds). Fix the format string.
- Cross-tier fitness inversion suggests training one tier at a time against the *previously-trained higher tier* (curriculum learning) would preserve gradient — a fourth experiment we never ran.
- The `*.backup.json` and `*.preanchor.json` files are kept for now in case the user wants to A/B them. Safe to delete once a permanent state is chosen.
