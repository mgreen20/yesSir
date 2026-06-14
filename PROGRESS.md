# Yes Sir! — Multiplayer Branch Progress

## Branch: `multiplayer`

---

## Completed

### AWS Infrastructure (CDK)
- Bootstrapped CDK for account `417425907187` / `us-east-1`
- Deployed `YesSirStack` via `infrastructure/lib/stack.js`
- Resources live:
  - **Cognito User Pool** `us-east-1_080y8pPVd` — email sign-up/confirm/login
  - **DynamoDB** — three tables: `yes-sir-connections`, `yes-sir-lobbies`, `yes-sir-games`
  - **WebSocket API** `wss://wpoqjf0373.execute-api.us-east-1.amazonaws.com/prod`
  - **HTTP API** `https://6iwy4whshi.execute-api.us-east-1.amazonaws.com`
  - **S3 + CloudFront** `https://d26bjchupr7c43.cloudfront.net`
- Lambda handlers (all ES modules): `connect`, `disconnect`, `message` (WebSocket), `lobby` (REST), `game` (game engine module)
- HTTP API routes: GET/POST `/lobbies`, GET `/lobbies/{id}`, POST `/lobbies/{id}/join`, `/leave`, `/start`
- `npm run deploy` — one-command build + S3 sync + CloudFront invalidation (index.html served with no-cache)

### Auth
- `src/auth.js` — Cognito SDK wrapper: `signUp`, `confirmSignUp`, `signIn`, `signOut`, `getCurrentUser` (returns `{ user, email, sub }`), `getIdToken`, `changePassword`
- Login / SignUp / ConfirmEmail pages — full flow working
- `RequireAuth` wrapper in `App.jsx` protects all game routes
- `vite.config.js` — `define: { global: 'globalThis' }` for Cognito browser compat

### Multiplayer Lobby (`src/pages/Lobby.jsx`)
- List open games, create, join, leave — all working
- Waiting room with live player list (polls every 2s), ChatBox integrated
- **Auto-rejoin** on page reload (suppressed when user explicitly leaves)
- **Fill empty seats with AI & Start** — host can start with 2–3 humans, remaining seats filled with random AI avatars; all humans navigate to the same multiplayer game
- 4 humans auto-start when last player joins
- All lobby navigation goes to `/multiplayer-game` (not solo game)

### Server-Side Game Engine (`infrastructure/lambda/game.js`)
- `gameLogic.js` and `gameReducer.js` copied to Lambda, run server-side (ES modules)
- `handleJoinGame` — registers connection, sends personalized initial state, auto-deals when all humans connected
- `handleGameAction` — validates action, applies reducer, runs AI turns until human's move, saves to DynamoDB, broadcasts personalized state to all players
- `personalizeState` — hides other players' hands, computes `playableCards` for the active player
- `runAiTurns` — loops: AI CHOOSE_TRUMP → AI BID → AI PLAY_CARD → ADVANCE_TRICK until human seat or terminal phase
- Game state initialized with `initialGameState()` on first join if record has no state

### Multiplayer Game Frontend
- `src/hooks/useGameSocket.js` — WebSocket hook: connect (waits for `userId`), JOIN_GAME, receive GAME_STATE, sendAction, reconnect
- `src/pages/MultiplayerGame.jsx` — full game UI driven by server state; seat remapping so "You" is always south; reuses all existing components (TrickArea, PlayerHand, ScoreCard, etc.)
- `src/App.jsx` — `/multiplayer-game` route added

### Additional Pages
- `src/pages/SoloLobby.jsx` — original solo AI opponent picker preserved at `/solo`
- `src/pages/AccountSettings.jsx` — change password via Cognito
- `src/pages/PlayerStats.jsx` — stats UI (shows `--` until backend stats built)
- `src/components/NavBar.jsx` — sticky nav for authenticated pages
- `src/components/ChatBox.jsx` — WebSocket-based real-time chat, embedded in waiting room

### Bug fixes
- `getCurrentUser()` now returns Cognito `sub` (used as userId) alongside `email`
- `useGameSocket` waits for `userId` before opening WebSocket
- Lambda player normalization: lobby stores full `{ seat, userId, username, name, isAI, emoji, skill }` shape
- `gameState` defaulted to `initialGameState()` in Lambda to handle freshly-created games
- Initial state saved to DynamoDB on first JOIN_GAME so second player sees consistent state
- CloudFront cache: `index.html` served with `no-cache` to prevent stale JS on deploy
- Leave button calls `POST /lobbies/{id}/leave` in DynamoDB before clearing local state (suppresses auto-rejoin loop)
- React error #310: moved auto-advance `useEffect` before early return guard (Rules of Hooks)
- Loading guard extended to `!gameState || yourSeat === null` to prevent render with null seat
- `GameErrorBoundary` added to `MultiplayerGame` — shows error text instead of blank green screen
- DEAL action now accepted from `ROUND_RESULT` phase (was PRE_DEAL only) — fixes Next Round button
- `runAiTurns` stops at `TRICK_RESULT` — server broadcasts all 4 cards, client auto-advances after 2 s
- Removed "Next Trick" button overlay — cards sweep to winner via CSS animation automatically

### Verified working (tested with 2 humans + 2 AI)
- Both players navigate to the same multiplayer game
- Cards dealt, AI plays automatically, humans see personalized hands
- Tricks complete, cards animate to winner after 2 seconds
- Round result modal shows after 13 tricks; Next Round advances correctly
- Full 8-round game playable end-to-end

---

## In Progress / Known Issues

1. **Player stats backend** — `GET /stats` endpoint not built; stats page shows placeholder values.

2. **Game disconnection handling** — if a player disconnects mid-game, no reconnection recovery or AI takeover yet.

3. **ADVANCE_TRICK race condition** — all clients send ADVANCE_TRICK after 2 s; the server guard (`phase !== TRICK_RESULT → return`) makes it idempotent but only the first sender triggers the broadcast. Low risk in practice.

4. **Game cleanup** — completed games stay in DynamoDB indefinitely; no TTL or cleanup on game-over.

5. **GameOverModal "You" seat assumption** — modal checks `winnerIdx === 0` for "You Won" but in multiplayer the human may not be seat 0. Cosmetic only; scores are correct.

---

## Key Config Values

| Resource | Value |
|---|---|
| Cognito User Pool ID | `us-east-1_080y8pPVd` |
| Cognito Client ID | `1h3d67k99gb85uffrjbsb9nruh` |
| HTTP API | `https://6iwy4whshi.execute-api.us-east-1.amazonaws.com` |
| WebSocket API | `wss://wpoqjf0373.execute-api.us-east-1.amazonaws.com/prod` |
| CloudFront URL | `https://d26bjchupr7c43.cloudfront.net` |
| S3 Bucket | `yessirstack-sitebucket397a1860-1ulrwxvcmuzy` |
| CloudFront Distribution | `E6Z2ABRS9N4DV` |
| AWS Account | `417425907187` / `us-east-1` |
| CDK Stack | `YesSirStack` |
