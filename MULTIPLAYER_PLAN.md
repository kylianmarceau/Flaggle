# Multiplayer Implementation Plan for locale

## Goal

Add real-time multiplayer to `locale` without compromising the current solo game architecture.

The multiplayer system should be:

- server-authoritative
- lightweight
- easy to host on Fly.io
- compatible with the existing pure game/country logic
- hard to accidentally desync
- simple enough to run as one Bun process initially

The first multiplayer release should support private rooms where players race on the same flags and the server validates every answer.

## Current foundation

Already implemented:

```text
src/core/game/          Pure game engine
src/core/countries/     Country data, aliases, normalization, fuzzy matching
src/core/modes/         Classic, timed, streak, continent modes
src/core/multiplayer/   Typed protocol shell and public room types
src/ui/                 Game UI
```

The current multiplayer protocol is only a frontend/mock shell. This plan replaces the mock with a real WebSocket backend.

## Non-goals for first multiplayer release

Do not add these yet:

- user accounts
- matchmaking
- global leaderboard
- chat
- database persistence
- Redis
- multiple backend Machines
- ranked play
- public room browser
- anti-cheat beyond server-side validation and rate limiting

Keep the first release focused on private room multiplayer.

## Target experience

### Main flow

```text
1. Player opens multiplayer panel
2. Player enters display name
3. Player creates a room or joins with room code
4. Players ready up
5. Host starts the game
6. Server reveals one flag at a time
7. Players submit answers
8. Server validates answers and awards points
9. Round result reveals country and scoring
10. Next round starts
11. Final scoreboard appears
```

### First game mode

Start with one multiplayer mode:

```text
Race
- same flag stream for everyone
- first correct answer gets most points
- later correct answers get fewer points
- wrong guesses do not eliminate player
- fixed number of rounds, e.g. 15
- server reveals result after first correct answer or timeout
```

This is easier and more fun than trying to make “guess all 196 countries” multiplayer immediately.

## Architecture

```text
Browser client
  src/ui/screens/MultiplayerScreen.ts
  src/core/multiplayer/protocol.ts
  WebSocket transport

Bun server
  server/index.ts
  server/rooms/RoomManager.ts
  server/rooms/Room.ts
  server/protocol/parseMessage.ts
  server/protocol/handlers.ts
  server/game/MultiplayerGame.ts

Shared pure logic
  src/core/countries/*
  src/core/game/*
  src/core/modes/*
```

One Bun process should serve:

```text
GET /              static app from dist/
GET /assets/...    static assets from dist/assets/
GET /health        health check
WS  /ws            multiplayer socket
```

## Server-authoritative rule

The server owns:

- room code
- player IDs
- ready state
- current round country
- accepted answers
- answer validation
- score calculation
- round timing
- game completion

The client owns:

- rendering public state
- collecting user input
- showing pending/submitted feedback

The client must never decide whether an answer is correct.

## Public vs private state

### Private server-only round state

```ts
interface PrivateRoundState {
  readonly roundNumber: number;
  readonly countryId: CountryId;
  readonly startedAt: number;
  readonly endsAt: number;
  readonly correctAnswers: Map<PlayerId, PlayerAnswer>;
  readonly lockedPlayerIds: Set<PlayerId>;
}
```

### Public client round state

```ts
interface PublicRoundState {
  readonly roundNumber: number;
  readonly flagSrc: string;
  readonly startedAt: number;
  readonly endsAt: number;
}
```

Before a round ends, clients receive only:

- flag image path
- round number
- timing
- public scoreboard

They do not receive:

- country name
- country code
- aliases
- accepted answers

The country identity is revealed only in `ROUND_ENDED`.

## Protocol updates

Current protocol types should be extended rather than replaced.

### Client messages

```ts
export type ClientMessage =
  | { readonly type: "CREATE_ROOM"; readonly playerName: string; readonly modeId: string }
  | { readonly type: "JOIN_ROOM"; readonly roomCode: string; readonly playerName: string }
  | { readonly type: "LEAVE_ROOM" }
  | { readonly type: "SET_READY"; readonly ready: boolean }
  | { readonly type: "START_GAME" }
  | { readonly type: "SUBMIT_ANSWER"; readonly answer: string; readonly clientSentAt: number }
  | { readonly type: "REQUEST_ROOM_SNAPSHOT" }
  | { readonly type: "PING"; readonly clientSentAt: number };
```

Do not support multiplayer hints in the first version. Hints complicate fairness.

### Server messages

```ts
export type ServerMessage =
  | { readonly type: "CONNECTED"; readonly playerId: string; readonly serverNow: number }
  | { readonly type: "ROOM_SNAPSHOT"; readonly room: PublicRoomState }
  | { readonly type: "PLAYER_JOINED"; readonly player: PublicPlayerState }
  | { readonly type: "PLAYER_LEFT"; readonly playerId: string }
  | { readonly type: "PLAYER_READY_CHANGED"; readonly playerId: string; readonly ready: boolean }
  | { readonly type: "GAME_STARTED"; readonly room: PublicRoomState }
  | { readonly type: "ROUND_STARTED"; readonly round: PublicRoundState; readonly players: readonly PublicPlayerState[] }
  | { readonly type: "ANSWER_ACCEPTED"; readonly playerId: string; readonly points: number }
  | { readonly type: "ANSWER_REJECTED"; readonly reason: string }
  | { readonly type: "ROUND_ENDED"; readonly countryCode: string; readonly countryName: string; readonly results: readonly RoundResult[] }
  | { readonly type: "GAME_COMPLETED"; readonly results: readonly FinalResult[] }
  | { readonly type: "PONG"; readonly clientSentAt: number; readonly serverNow: number }
  | { readonly type: "ERROR"; readonly code: string; readonly message: string };
```

## Room model

```ts
interface RoomSettings {
  readonly modeId: "race";
  readonly roundCount: number;
  readonly roundSeconds: number;
  readonly maxPlayers: number;
}
```

Initial values:

```ts
const DEFAULT_ROOM_SETTINGS = {
  modeId: "race",
  roundCount: 15,
  roundSeconds: 20,
  maxPlayers: 8,
};
```

```ts
class Room {
  readonly code: string;
  readonly seed: string;
  readonly hostPlayerId: PlayerId;

  status: "lobby" | "playing" | "round-result" | "complete";
  players: Map<PlayerId, PlayerSession>;
  settings: RoomSettings;
  game: MultiplayerGame | null;

  snapshot(): PublicRoomState;
  addPlayer(session: PlayerSession): void;
  removePlayer(playerId: PlayerId): void;
  setReady(playerId: PlayerId, ready: boolean): void;
  startGame(playerId: PlayerId): void;
  submitAnswer(playerId: PlayerId, answer: string, receivedAt: number): void;
  broadcast(message: ServerMessage): void;
}
```

## Room manager

```ts
class RoomManager {
  private readonly roomsByCode = new Map<string, Room>();
  private readonly sessionsBySocket = new WeakMap<ServerWebSocket, PlayerSession>();

  attach(socket: ServerWebSocket): void;
  detach(socket: ServerWebSocket): void;
  handleMessage(socket: ServerWebSocket, raw: string | Buffer): void;
  createRoom(socket: ServerWebSocket, playerName: string, modeId: string): void;
  joinRoom(socket: ServerWebSocket, roomCode: string, playerName: string): void;
  leaveRoom(socket: ServerWebSocket): void;
  cleanupRooms(now: number): void;
}
```

Responsibilities:

- parse messages
- validate input
- create player sessions
- create/join rooms
- route messages to room
- clean up disconnected/empty rooms
- enforce max room count

## Multiplayer game model

```ts
class MultiplayerGame {
  readonly seed: string;
  readonly countryIndex: CountryIndex;
  readonly countryQueue: CountryId[];
  readonly settings: RoomSettings;

  round: PrivateRoundState | null;
  roundNumber: number;

  startNextRound(now: number): PublicRoundState | null;
  submitAnswer(player: PlayerSession, answer: string, receivedAt: number): AnswerResult;
  endRound(now: number): RoundEndResult;
  isComplete(): boolean;
}
```

Use existing country matching:

```ts
isCorrectAnswer(countryIndex, currentCountryId, submittedAnswer)
```

This gives multiplayer the same abbreviation and typo tolerance as solo mode.

## Scoring

Initial race scoring:

```text
first correct answer: 1000 points
second:               700 points
third:                500 points
later correct:         300 points
wrong answer:           0 points
no answer:              0 points
```

Optional streak bonus:

```text
+50 per current streak, capped at +250
```

Keep scoring simple and visible.

```ts
function scoreCorrectAnswer(position: number, streak: number): number {
  const placement = [1000, 700, 500][position - 1] ?? 300;
  return placement + Math.min(streak, 5) * 50;
}
```

## Round timing

Each round has:

```ts
startedAt: number;
endsAt: number;
```

Server should end the round when:

- every connected player has answered correctly, or
- `Date.now() >= endsAt`

Implementation options:

### Simple first version

Use `setTimeout` per round on the server.

```ts
this.roundTimeout = setTimeout(() => this.endRound(Date.now()), roundSeconds * 1000);
```

Clear timeout when room ends or advances.

### Later improvement

Use a server tick loop for all rooms if many rooms exist.

## Client transport

Add:

```text
src/core/multiplayer/webSocketTransport.ts
```

```ts
export function createWebSocketTransport(url: string): MultiplayerTransport;
```

Behavior:

- connect to `/ws`
- parse server JSON messages
- expose `onMessage`
- expose `onStatusChange`
- stringify outgoing client messages
- reconnect only after explicit user action in first version

Same-origin URL helper:

```ts
export function getDefaultWebSocketUrl(): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}
```

## UI plan

Add a multiplayer entry point without disrupting the current solo-first UI.

Recommended minimal UI:

```text
Header
  locale logo
  mode select: Solo / Multiplayer
```

When Multiplayer selected:

```text
Room panel
  name input
  create room
  join room code

Lobby
  room code
  players
  ready toggle
  start button for host

Game
  flag
  answer input
  timer
  scoreboard
  round result
```

Keep the same visual language as the solo UI.

### Multiplayer screens/components

```text
src/ui/screens/MultiplayerScreen.ts
src/ui/dom/renderLobby.ts
src/ui/dom/renderScoreboard.ts
src/ui/dom/renderRoundResult.ts
```

Avoid a separate route system unless needed. A single screen state machine is enough.

```ts
type MultiplayerUiState =
  | { type: "disconnected" }
  | { type: "join" }
  | { type: "lobby"; room: PublicRoomState }
  | { type: "playing"; room: PublicRoomState }
  | { type: "round-result"; room: PublicRoomState; result: RoundResult }
  | { type: "complete"; results: readonly FinalResult[] };
```

## Server files to add

```text
server/
  index.ts
  static.ts
  rooms/
    Room.ts
    RoomManager.ts
    PlayerSession.ts
    roomCode.ts
  game/
    MultiplayerGame.ts
    scoring.ts
  protocol/
    parseMessage.ts
    validateMessage.ts
    send.ts
```

## Package scripts

Add:

```json
{
  "scripts": {
    "dev:server": "bun --watch server/index.ts",
    "start": "bun server/index.ts"
  }
}
```

Keep frontend development separate:

```text
npm run dev        Vite frontend
npm run dev:server Bun WebSocket server
```

For production Fly.io, Bun serves both static frontend and `/ws`.

## Validation and security

### Message validation

Every incoming message must be validated before use.

Reject:

- non-JSON
- unknown message type
- missing fields
- overly long strings
- invalid room code
- invalid player name
- answer longer than max length

Suggested limits:

```ts
const LIMITS = {
  playerNameLength: 24,
  roomCodeLength: 6,
  answerLength: 80,
  maxPlayersPerRoom: 8,
  maxRooms: 500,
  maxMessageBytes: 2048,
};
```

### Rate limits

Per socket:

```text
CREATE_ROOM:    3/min
JOIN_ROOM:     10/min
SUBMIT_ANSWER: 6/sec
SET_READY:      5/sec
```

For first version, implement a simple in-memory sliding window or token bucket on `PlayerSession`.

### Origin checks

On WebSocket upgrade, allow only configured origins:

```text
ALLOWED_ORIGINS=https://locale.game,http://localhost:5173
```

## Testing plan

### Unit tests

```text
tests/multiplayerProtocol.test.ts
tests/roomManager.test.ts
tests/room.test.ts
tests/multiplayerGame.test.ts
```

Cover:

- creates room
- joins room
- rejects invalid room
- ready state changes
- only host can start game
- game cannot start until enough players are ready
- round starts with public state only
- correct answer scores
- typo/abbreviation answer works
- wrong answer rejected or recorded correctly
- round timeout ends round
- final results sorted by score
- disconnected player handled

### Integration tests

Use Bun/WebSocket client in tests:

```text
start server on random port
connect two WebSocket clients
create room
join room
ready
start
submit answer
observe broadcasts
```

### Browser smoke tests

Manual or automated smoke:

- create room
- join room in second tab
- ready both players
- start game
- submit correct answer
- see result on both clients

## Implementation phases

### Phase 1 — Server skeleton

Add:

- `server/index.ts`
- static file serving
- `/health`
- `/ws` upgrade
- basic connect/disconnect logs

Acceptance:

- `bun server/index.ts` starts
- `GET /health` returns `ok`
- WebSocket connects

### Phase 2 — Protocol validation

Add:

- message parser
- message validator
- typed `send` helper
- error responses

Acceptance:

- invalid messages are rejected safely
- valid messages route to handlers

### Phase 3 — Rooms and lobby

Add:

- room code generation
- room creation
- room joining
- player sessions
- ready state
- room snapshots

Acceptance:

- two clients can join same room
- both receive snapshots
- ready changes broadcast

### Phase 4 — Multiplayer game loop

Add:

- seeded round queue
- round start/end
- answer validation
- scoring
- round timeout
- final results

Acceptance:

- host starts game
- both clients receive same flag
- answer is validated server-side
- round result reveals country
- final scoreboard produced

### Phase 5 — Client WebSocket transport

Add:

- real `createWebSocketTransport`
- same-origin `/ws` URL helper
- transport status handling

Acceptance:

- client can connect to real server
- mock transport remains useful for isolated UI tests if needed

### Phase 6 — Multiplayer UI

Add:

- multiplayer mode entry point
- create/join UI
- lobby UI
- ready/start controls
- multiplayer game screen
- scoreboard
- round result display

Acceptance:

- full two-tab flow works locally
- UI remains consistent with current solo design

### Phase 7 — Hardening

Add:

- rate limits
- origin allowlist
- room TTL cleanup
- empty room cleanup
- max players
- max rooms
- structured logs

Acceptance:

- abuse cases are bounded
- idle rooms disappear
- server remains stable under bad input

### Phase 8 — Fly.io deployment

Add:

- `Dockerfile`
- `fly.toml`
- production static serving from `dist`

Acceptance:

- `npm test` passes
- `npm run build` passes
- `fly deploy` serves app
- `/ws` works over WSS

## Local development flow

Terminal 1:

```sh
npm run dev
```

Terminal 2:

```sh
npm run dev:server
```

Frontend dev connects to:

```text
ws://localhost:3000/ws
```

Production connects to same origin:

```text
wss://locale.game/ws
```

## First release acceptance criteria

- One player can create a room.
- Another player can join by code.
- Players can ready up.
- Host can start game.
- Every player sees the same flag each round.
- Server validates answers using existing country matching.
- Server awards points.
- Round result reveals country.
- Game ends after configured round count.
- Final scoreboard is shown.
- Invalid messages do not crash server.
- Empty rooms clean up.
- Tests and build pass.

## Recommended first configuration

```ts
const DEFAULT_MULTIPLAYER = {
  roundCount: 15,
  roundSeconds: 20,
  maxPlayers: 8,
  minPlayersToStart: 2,
};
```

## Future extensions

After first release:

- reconnect support
- spectator mode
- custom room settings
- continent-only multiplayer
- streak multiplayer
- daily multiplayer seed
- room share links
- Redis for multi-machine scaling
- Postgres for durable leaderboards/history
