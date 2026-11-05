# Ludo FYP — Backend Build Plan

Node.js + Express 5 + Socket.IO + MySQL backend for the Online Multiplayer Ludo mobile game.
Based on the ERD (18 entities, 19 relationships) and *Ludo_FYP_Working_Flow.pdf*.
Coding rules and quick reference: [CLAUDE.md](CLAUDE.md).

**Contents**
1. [Key decisions](#1-key-decisions)
2. [Architecture](#2-architecture)
3. [Database](#3-database)
4. [Ludo engine](#4-ludo-engine)
5. [Core files (code sketches)](#5-core-files-code-sketches)
6. [REST API — detailed](#6-rest-api--detailed)
7. [Build phases](#7-build-phases)
8. [Gameplay internals (gameManager)](#8-gameplay-internals-gamemanager)
9. [Testing plan](#9-testing-plan)
10. [Viva preparation](#10-viva-preparation)
11. [Mobile app integration notes](#11-mobile-app-integration-notes)
12. [Future work](#12-future-work)

---

## 1. Key decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Language | Plain JavaScript, CommonJS | easiest to read and change live in the viva |
| Framework | Express 5 | async errors are caught automatically, which means less boilerplate |
| DB access | `mysql2/promise` + raw SQL, no ORM | SQL maps directly to the ERD, and examiners can read the queries |
| Realtime | Socket.IO 4 | online/room/tournament games need instant turn updates |
| Auth | JWT in the `Authorization` header; bcryptjs hashing | stateless and simple; guests also get a JWT |
| Guest identity | `device_id` sent by the app | reopening the app gives back the same guest player |
| Game state | stored in MySQL (tokens, current_seat, dice_value) | survives restarts and is easy to show in phpMyAdmin/Workbench |
| In-memory state | matchmaking queue + turn timers only | small and easy to rebuild |
| Dice | rolled on the server | prevents cheating |
| JSON style | snake_case, the same as the DB columns | no mapping code |
| Tournament admin | `x-admin-key` header (from `.env`) | the ERD has no admin entity, so this avoids adding one |
| Match end (FFA) | ends when the first seat finishes; the rest are ranked by progress | shorter games and simpler logic |
| Tests | `node --test` on the pure engine | no extra dependency |

---

## 2. Architecture

```
┌─────────────────────┐        HTTP (JSON)        ┌──────────────────────────────────────────┐
│ React Native app    │ ────────────────────────▶ │ Express app (src/app.js)                 │
│  - axios/fetch      │                           │   routes/ → middleware/ → controllers/   │
│  - socket.io-client │ ◀──── Socket.IO ────────▶ │ Socket.IO (src/sockets/)                 │
└─────────────────────┘                           │   gameHandlers / queueHandlers           │
                                                  │          │                               │
                                                  │          ▼                               │
                                                  │ game/  gameManager ── ludoEngine (pure)  │
                                                  │        matchSetup     botAI              │
                                                  │        tournamentManager                 │
                                                  │          │                               │
                                                  │          ▼                               │
                                                  │ models/ (SQL only) ──────▶ MySQL         │
                                                  └──────────────────────────────────────────┘
```

What each layer does:
- **routes/**: maps a URL to a controller and attaches middleware. One line per endpoint.
- **middleware/**: `auth` (checks the JWT), `registeredOnly`, `adminKey`, `errorHandler`.
- **controllers/**: reads `req`, validates input, calls models or game functions, sends JSON.
- **models/**: SQL only. Functions take an optional `conn` so they work inside transactions.
- **game/**: all Ludo logic. `ludoEngine` is pure (no DB, no sockets), so it can be unit tested.
- **sockets/**: realtime events. They check the input, then call `gameManager`.

---

## 3. Database

### 3.1 Relationships → foreign keys (19)

| # | ERD relationship | Implemented as |
|---|------------------|----------------|
| 1 | PLAYER *plays as* MATCH_PLAYER | `match_players.player_id → players` |
| 2 | MATCH *seats 2–4* MATCH_PLAYER | `match_players.match_id → matches` |
| 3 | RULE_SET *governs* MATCH | `matches.rule_set_id → rule_sets` |
| 4 | MATCH *has (0 or 2)* TEAM | `teams.match_id → matches` |
| 5 | TEAM *groups* MATCH_PLAYER | `match_players.team_id → teams` |
| 6 | BOT *fills seat* MATCH_PLAYER | `match_players.bot_id → bots` |
| 7 | MATCH_PLAYER *controls* TOKEN | `tokens.match_player_id → match_players` |
| 8 | MATCH_PLAYER *makes* MOVE | `moves.match_player_id → match_players` |
| 9 | TOKEN *moved in* MOVE | `moves.token_id → tokens` |
| 10 | TOKEN *captured in* MOVE | `moves.captured_token_id → tokens` (nullable) |
| 11 | REGISTERED_USER *creates* ROOM_MATCH | `room_matches.host_id → registered_users` |
| 12 | ROOM_MATCH *has* ROOM_INVITATION | `room_invitations.match_id → room_matches` |
| 13 | REGISTERED_USER *sends* ROOM_INVITATION | `room_invitations.sender_id → registered_users` |
| 14 | REGISTERED_USER *receives* ROOM_INVITATION | `room_invitations.receiver_id → registered_users` |
| 15 | REGISTERED_USER *sends* FRIENDSHIP | `friendships.requester_id → registered_users` |
| 16 | REGISTERED_USER *receives* FRIENDSHIP | `friendships.addressee_id → registered_users` |
| 17 | REGISTERED_USER *registers* TOURNAMENT_PARTICIPANT | `tournament_participants.player_id → registered_users` |
| 18 | TOURNAMENT *has* TOURNAMENT_PARTICIPANT | `tournament_participants.tournament_id → tournaments` |
| 19 | TOURNAMENT_MATCH *played as* TOURNAMENT | `tournament_matches.tournament_id → tournaments` |
| 20 | REGISTERED_USER *creates* TOURNAMENT | `tournaments.creator_id → registered_users` (added 2026-11-05) |
| 21 | RULE_SET *governs* TOURNAMENT | `tournaments.rule_set_id → rule_sets` (added) |
| 22 | TOURNAMENT *has* TOURNAMENT_INVITATION | `tournament_invitations.tournament_id → tournaments` (added) |
| 23 | REGISTERED_USER *sends* TOURNAMENT_INVITATION | `tournament_invitations.sender_id → registered_users` (added) |
| 24 | REGISTERED_USER *receives* TOURNAMENT_INVITATION | `tournament_invitations.receiver_id → registered_users` (added) |

Specialisations (shown with "d" in the ERD) are implemented as **PK = FK** subtype tables: `guest_users`, `registered_users` → `players`; `bot_matches`, `online_matches`, `room_matches`, `tournament_matches` → `matches`.

### 3.2 `database/schema.sql`

> **Updated 2026-11-05 (tournament module):** `backend/database/schema.sql` is the source of truth. Changes compared with the listing below:
> - `tournaments` gained `creator_id`, `rule_set_id`, `description`, `players_per_match`, `round_break_minutes`
> - `tournament_matches` gained `scheduled_at`
> - `registered_users` gained `tournaments_won`
> - there is a new table `tournament_invitations`
>
> That makes 19 tables.

The DB name isn't hard-coded, so this file can also be imported in phpMyAdmin or Workbench after selecting a database.

```sql
-- =====================================================================
-- Ludo FYP — MySQL schema. 18 tables = 18 ERD entities.
-- Parents are created before children (FK order).
-- =====================================================================
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. PLAYERS & SOCIAL
-- ---------------------------------------------------------------------
CREATE TABLE players (
  player_id     INT AUTO_INCREMENT PRIMARY KEY,
  display_name  VARCHAR(50)  NOT NULL,
  avatar        VARCHAR(255) NULL,
  player_type   ENUM('guest','registered') NOT NULL,      -- subtype discriminator
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE guest_users (
  player_id  INT PRIMARY KEY,                             -- PK = FK (subtype)
  device_id  VARCHAR(100) NOT NULL UNIQUE,
  CONSTRAINT fk_guest_player FOREIGN KEY (player_id) REFERENCES players(player_id)
) ENGINE=InnoDB;

CREATE TABLE registered_users (
  player_id      INT PRIMARY KEY,                         -- PK = FK (subtype)
  username       VARCHAR(30)  NOT NULL UNIQUE,
  email          VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  games_played   INT NOT NULL DEFAULT 0,
  games_won      INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_reg_player FOREIGN KEY (player_id) REFERENCES players(player_id)
) ENGINE=InnoDB;

CREATE TABLE friendships (
  friendship_id  INT AUTO_INCREMENT PRIMARY KEY,
  requester_id   INT NOT NULL,
  addressee_id   INT NOT NULL,
  status         ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_friend_pair (requester_id, addressee_id),
  CONSTRAINT chk_friend_not_self CHECK (requester_id <> addressee_id),
  CONSTRAINT fk_friend_requester FOREIGN KEY (requester_id) REFERENCES registered_users(player_id),
  CONSTRAINT fk_friend_addressee FOREIGN KEY (addressee_id) REFERENCES registered_users(player_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. RULES & BOTS
-- ---------------------------------------------------------------------
CREATE TABLE rule_sets (
  rule_set_id            INT AUTO_INCREMENT PRIMARY KEY,
  name                   VARCHAR(50) NOT NULL UNIQUE,
  six_to_unlock          TINYINT(1) NOT NULL DEFAULT 1,   -- 0 = a 1 or a 6 unlocks
  extra_turn_on_six      TINYINT(1) NOT NULL DEFAULT 1,
  extra_turn_on_capture  TINYINT(1) NOT NULL DEFAULT 1,
  extra_turn_on_home     TINYINT(1) NOT NULL DEFAULT 1,
  capture_enabled        TINYINT(1) NOT NULL DEFAULT 1,
  tokens_to_win          TINYINT NOT NULL DEFAULT 4,      -- tokens that must reach home
  turn_seconds           TINYINT NOT NULL DEFAULT 30
) ENGINE=InnoDB;

CREATE TABLE bots (
  bot_id      INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL,
  difficulty  ENUM('easy','hard') NOT NULL DEFAULT 'easy'
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. MATCHES (supertype + 4 subtypes)
-- ---------------------------------------------------------------------
CREATE TABLE matches (
  match_id      INT AUTO_INCREMENT PRIMARY KEY,
  rule_set_id   INT NOT NULL,
  match_type    ENUM('bot','online','room','tournament') NOT NULL,   -- subtype discriminator
  game_mode     ENUM('ffa','2v2') NOT NULL DEFAULT 'ffa',
  max_players   TINYINT NOT NULL DEFAULT 4,
  status        ENUM('waiting','in_progress','finished','cancelled') NOT NULL DEFAULT 'waiting',
  current_seat  TINYINT NULL,     -- seat_no whose turn it is
  dice_value    TINYINT NULL,     -- rolled but not used yet; NULL = current seat must roll
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at    DATETIME NULL,
  ended_at      DATETIME NULL,
  CONSTRAINT chk_match_players CHECK (max_players BETWEEN 2 AND 4),
  CONSTRAINT fk_match_rules FOREIGN KEY (rule_set_id) REFERENCES rule_sets(rule_set_id)
) ENGINE=InnoDB;

CREATE TABLE bot_matches (
  match_id    INT PRIMARY KEY,
  difficulty  ENUM('easy','hard') NOT NULL DEFAULT 'easy',
  CONSTRAINT fk_botmatch_match FOREIGN KEY (match_id) REFERENCES matches(match_id)
) ENGINE=InnoDB;

CREATE TABLE online_matches (
  match_id    INT PRIMARY KEY,
  queue_key   VARCHAR(10) NOT NULL,                         -- 'ffa2' | 'ffa4' | '2v2'
  matched_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_online_match FOREIGN KEY (match_id) REFERENCES matches(match_id)
) ENGINE=InnoDB;

CREATE TABLE room_matches (
  match_id   INT PRIMARY KEY,
  host_id    INT NOT NULL,
  room_code  CHAR(6) NOT NULL UNIQUE,
  CONSTRAINT fk_room_match FOREIGN KEY (match_id) REFERENCES matches(match_id),
  CONSTRAINT fk_room_host  FOREIGN KEY (host_id)  REFERENCES registered_users(player_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. TOURNAMENTS
-- ---------------------------------------------------------------------
CREATE TABLE tournaments (
  tournament_id     INT AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  max_participants  TINYINT NOT NULL DEFAULT 8,             -- 4, 8 or 16
  start_time        DATETIME NOT NULL,
  status            ENUM('registration','in_progress','finished','cancelled') NOT NULL DEFAULT 'registration',
  current_round     TINYINT NOT NULL DEFAULT 0,             -- 0 = not started
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tournament_matches (
  match_id       INT PRIMARY KEY,
  tournament_id  INT NOT NULL,
  round_no       TINYINT NOT NULL,
  match_no       TINYINT NOT NULL,
  UNIQUE KEY uq_tmatch_slot (tournament_id, round_no, match_no),
  CONSTRAINT fk_tmatch_match      FOREIGN KEY (match_id)      REFERENCES matches(match_id),
  CONSTRAINT fk_tmatch_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id)
) ENGINE=InnoDB;

CREATE TABLE tournament_participants (
  participant_id    INT AUTO_INCREMENT PRIMARY KEY,
  tournament_id     INT NOT NULL,
  player_id         INT NOT NULL,
  status            ENUM('active','eliminated','champion') NOT NULL DEFAULT 'active',
  eliminated_round  TINYINT NULL,
  joined_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tournament_player (tournament_id, player_id),
  CONSTRAINT fk_tp_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id),
  CONSTRAINT fk_tp_player     FOREIGN KEY (player_id)     REFERENCES registered_users(player_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. SEATS, TEAMS, TOKENS, MOVES
-- ---------------------------------------------------------------------
CREATE TABLE teams (
  team_id   INT AUTO_INCREMENT PRIMARY KEY,
  match_id  INT NOT NULL,
  team_no   TINYINT NOT NULL,                               -- 1 = seats 1+3, 2 = seats 2+4
  UNIQUE KEY uq_team_no (match_id, team_no),
  CONSTRAINT fk_team_match FOREIGN KEY (match_id) REFERENCES matches(match_id)
) ENGINE=InnoDB;

CREATE TABLE match_players (
  match_player_id  INT AUTO_INCREMENT PRIMARY KEY,
  match_id         INT NOT NULL,
  player_id        INT NULL,                                -- human seat
  bot_id           INT NULL,                                -- bot seat
  team_id          INT NULL,                                -- 2v2 only
  seat_no          TINYINT NOT NULL,                        -- 1..4 = colour + turn order
  color            ENUM('red','green','yellow','blue') NOT NULL,
  finish_position  TINYINT NULL,                            -- 1 = winner (set when match ends)
  joined_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_seat (match_id, seat_no),
  UNIQUE KEY uq_player_once (match_id, player_id),
  CONSTRAINT chk_human_or_bot CHECK ((player_id IS NULL) <> (bot_id IS NULL)),  -- exactly one
  CONSTRAINT fk_mp_match  FOREIGN KEY (match_id)  REFERENCES matches(match_id),
  CONSTRAINT fk_mp_player FOREIGN KEY (player_id) REFERENCES players(player_id),
  CONSTRAINT fk_mp_bot    FOREIGN KEY (bot_id)    REFERENCES bots(bot_id),
  CONSTRAINT fk_mp_team   FOREIGN KEY (team_id)   REFERENCES teams(team_id)
) ENGINE=InnoDB;

CREATE TABLE tokens (
  token_id         INT AUTO_INCREMENT PRIMARY KEY,
  match_player_id  INT NOT NULL,
  token_no         TINYINT NOT NULL,                        -- 1..4
  position         TINYINT NOT NULL DEFAULT -1,             -- -1 base | 0-50 track | 51-55 home column | 56 home
  UNIQUE KEY uq_token_no (match_player_id, token_no),
  CONSTRAINT fk_token_seat FOREIGN KEY (match_player_id) REFERENCES match_players(match_player_id)
) ENGINE=InnoDB;

CREATE TABLE moves (
  move_id            INT AUTO_INCREMENT PRIMARY KEY,
  match_player_id    INT NOT NULL,
  token_id           INT NOT NULL,
  captured_token_id  INT NULL,
  dice_value         TINYINT NOT NULL,
  from_position      TINYINT NOT NULL,
  to_position        TINYINT NOT NULL,
  is_auto            TINYINT(1) NOT NULL DEFAULT 0,         -- 1 = played by timer timeout
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_move_seat     FOREIGN KEY (match_player_id)   REFERENCES match_players(match_player_id),
  CONSTRAINT fk_move_token    FOREIGN KEY (token_id)          REFERENCES tokens(token_id),
  CONSTRAINT fk_move_captured FOREIGN KEY (captured_token_id) REFERENCES tokens(token_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. ROOM INVITATIONS
-- ---------------------------------------------------------------------
CREATE TABLE room_invitations (
  invitation_id  INT AUTO_INCREMENT PRIMARY KEY,
  match_id       INT NOT NULL,
  sender_id      INT NOT NULL,
  receiver_id    INT NOT NULL,
  status         ENUM('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at     DATETIME NOT NULL,
  CONSTRAINT fk_inv_room     FOREIGN KEY (match_id)    REFERENCES room_matches(match_id),
  CONSTRAINT fk_inv_sender   FOREIGN KEY (sender_id)   REFERENCES registered_users(player_id),
  CONSTRAINT fk_inv_receiver FOREIGN KEY (receiver_id) REFERENCES registered_users(player_id)
) ENGINE=InnoDB;
```

### 3.3 `database/seed.sql`

```sql
-- Ludo FYP — fixed data: rule sets, bots, one demo tournament.
INSERT INTO rule_sets
  (name, six_to_unlock, extra_turn_on_six, extra_turn_on_capture, extra_turn_on_home, capture_enabled, tokens_to_win, turn_seconds)
VALUES
  ('Classic', 1, 1, 1, 1, 1, 4, 30),   -- id 1: standard Ludo
  ('Quick',   0, 1, 1, 1, 1, 2, 20),   -- id 2: 1 or 6 unlocks, 2 tokens home wins
  ('Demo',    0, 1, 1, 1, 1, 1, 10);   -- id 3: for viva demos (1 token home wins)

INSERT INTO bots (name, difficulty) VALUES
  ('Bot Ali', 'easy'), ('Bot Sara', 'easy'), ('Bot Zain', 'easy'),
  ('Bot Max', 'hard'), ('Bot Nova', 'hard'), ('Bot Rex',  'hard');

INSERT INTO tournaments (name, max_participants, start_time)
VALUES ('Demo Cup', 4, DATE_ADD(NOW(), INTERVAL 1 DAY));
```

### 3.4 `database/reset.js` (what it does)

1. Connects **without** a database, using `multipleStatements: true` (only in this script).
2. `DROP DATABASE IF EXISTS <DB_NAME>; CREATE DATABASE <DB_NAME> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE <DB_NAME>;`
3. Runs `schema.sql`, then `seed.sql`.
4. Creates demo users in JS (because bcrypt hashes have to be generated): `demo1` … `demo4`, password `password123`, emails `demo1@ludo.test` and so on. Makes `demo1–demo2` and `demo1–demo3` accepted friends.
5. Prints `Database reset: 18 tables, seed + 4 demo users loaded.`

> **Warning:** `npm run db:reset` deletes all data in `DB_NAME`. Only use it on your local development database.

---

## 4. Ludo engine

### 4.1 `game/constants.js`

```js
// Ludo board numbers and game settings. Change gameplay tuning here.
module.exports = {
  BASE_POS: -1,
  LAST_TRACK_POS: 50,        // last main-track cell before the home column
  HOME_POS: 56,
  TRACK_LENGTH: 52,
  START_OFFSET: { red: 0, green: 13, yellow: 26, blue: 39 },
  SAFE_CELLS: [0, 8, 13, 21, 26, 34, 39, 47],           // global cell numbers
  SEAT_COLORS: { 1: 'red', 2: 'green', 3: 'yellow', 4: 'blue' },
  SEATS_FOR_PLAYERS: { 2: [1, 3], 3: [1, 2, 3], 4: [1, 2, 3, 4] },
  TEAM_OF_SEAT: { 1: 1, 3: 1, 2: 2, 4: 2 },
  BOT_DELAY_MS: 1000,        // bot "thinking" time
  NO_MOVE_DELAY_MS: 1200,    // show the dice before passing the turn
  START_DELAY_MS: 2000,      // time for clients to join before the first turn
  INVITE_EXPIRY_MINUTES: 10,
  ONLINE_RULE_SET_ID: 1,     // online matches use Classic
  TOURNAMENT_RULE_SET_ID: 1, // tournament matches use Classic
  TOURNAMENT_SEATS: 4,       // players per tournament match
  QUEUES: {
    ffa2: { players: 2, game_mode: 'ffa' },
    ffa4: { players: 4, game_mode: 'ffa' },
    '2v2': { players: 4, game_mode: '2v2' },
  },
};
```

### 4.2 `game/ludoEngine.js`: pure functions

The engine works on plain token objects: `{ token_id, seat_no, color, team_no, position }`, and `rules` is a `rule_sets` row.

| Function | Returns | Logic |
|----------|---------|-------|
| `unlockValues(rules)` | `[6]` or `[1, 6]` | from `six_to_unlock` |
| `getValidMoves(seatTokens, dice, rules)` | `[{ token_id, from, to }]` | in base: valid if dice is in unlockValues, `to = 0`. On board: valid if `position + dice ≤ 56`. Home (56): never valid. |
| `toGlobalCell(color, position)` | `0..51` or `null` | `null` unless `0 ≤ position ≤ 50` |
| `isSafeCell(globalCell)` | bool | `SAFE_CELLS.includes(cell)` |
| `findCapture(move, mover, allTokens)` | token or `null` | null if `move.to > 50` or the cell is safe. Opponents = tokens on the same global cell, different seat, not a teammate. Capture only if `opponents.length === 1`. |
| `isSeatFinished(seatTokens, rules)` | bool | count of tokens at 56 ≥ `tokens_to_win` |
| `getsExtraTurn({ dice, captured, reachedHome }, rules)` | bool | six + flag, OR capture + flag, OR home + flag |
| `getNextSeat(currentSeat, activeSeatNos)` | seat_no | first active seat number greater than current, otherwise wrap to the smallest |
| `progressScore(seatTokens)` | number | `sum(position + 1)` |
| `rankSeats(seats, tokens, winnerSeatNos, gameMode)` | `[{ seat_no, finish_position }]` | FFA: winner = 1, others by progress desc (ties: seat_no). 2v2: winning team = 1, other team = 2. |

**Unit tests (`tests/ludoEngine.test.js`):**
- 6 unlocks with Classic; 5 doesn't. With `six_to_unlock = 0`, a 1 unlocks.
- A token at 53 with a 3 → valid (56). With a 4 → invalid.
- Global cell: green at position 0 → 13. Red at 50 → 50. Blue at 20 → 7.
- Capture on a normal cell. No capture on a safe cell. No capture of a 2-token group. No capture of a teammate. No capture in the home column.
- Extra turn flags (each one on/off).
- `getNextSeat(4, [1,3,4])` → 1. `getNextSeat(1, [1,3])` → 3. A finished seat is skipped.
- `isSeatFinished` with `tokens_to_win` 4 and 1.
- `rankSeats` for FFA and 2v2.

### 4.3 `game/botAI.js`

```
chooseMove(validMoves, context, difficulty)
  easy → random valid move
  hard → move with highest scoreMove()

scoreMove(move):
  +100  captures an opponent
  + 80  reaches home (to = 56)
  + 60  unlocks a token (from = -1)
  + 30  lands on a safe cell
  + to  (prefer tokens that are further ahead)
```
Human timeouts use the `hard` choice, so the player gets a sensible auto-move.

---

## 5. Core files (code sketches)

### `package.json` scripts
```json
{
  "scripts": {
    "start": "node --env-file=.env src/server.js",
    "dev": "node --watch --env-file=.env src/server.js",
    "db:reset": "node --env-file=.env database/reset.js",
    "test": "node --test"
  }
}
```

### `src/config/db.js`
```js
// MySQL connection pool + transaction helper used by all models.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

// Runs work(conn) inside a transaction. Commits on success, rolls back on any error.
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
```

### `src/utils/httpError.js`
```js
// Creates an Error with an HTTP status so errorHandler can send the right code.
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
module.exports = httpError;
```

### `src/middleware/auth.js`
```js
// JWT check + role guards for routes.
const jwt = require('jsonwebtoken');
const httpError = require('../utils/httpError');

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw httpError(401, 'Login required');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { player_id, player_type }
  } catch {
    throw httpError(401, 'Invalid or expired token');
  }
  next();
}

function registeredOnly(req, res, next) {
  if (req.user.player_type !== 'registered') throw httpError(403, 'Create an account to use this feature');
  next();
}

function adminKey(req, res, next) {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) throw httpError(403, 'Admin key required');
  next();
}

module.exports = { auth, registeredOnly, adminKey };
```

### `src/middleware/errorHandler.js`
```js
// Converts any thrown error into { success: false, message }.
function errorHandler(err, req, res, next) {
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Already exists' });
  }
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ success: false, message: status === 500 ? 'Server error' : err.message });
}
module.exports = errorHandler;
```

### `src/app.js`
```js
// Express app: middleware, routes, 404, error handler.
const express = require('express');
const cors = require('cors');
const { pool } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ success: true, data: { status: 'ok', db: 'ok' } });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/friends', require('./routes/friendRoutes'));
app.use('/api/rule-sets', require('./routes/ruleSetRoutes'));
app.use('/api/matches', require('./routes/matchRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));
app.use('/api/tournaments', require('./routes/tournamentRoutes'));

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
```

### Route file example: `src/routes/friendRoutes.js`
```js
// /api/friends — friend list and requests (registered users only).
const router = require('express').Router();
const { auth, registeredOnly } = require('../middleware/auth');
const c = require('../controllers/friendController');

router.use(auth, registeredOnly);
router.get('/', c.listFriends);
router.get('/requests', c.listRequests);
router.post('/requests', c.sendRequest);
router.put('/requests/:friendship_id', c.respondToRequest);
router.delete('/:player_id', c.removeFriend);

module.exports = router;
```

### `src/server.js`
```js
// Entry point: HTTP server + Socket.IO + tournament start check.
const http = require('http');
const app = require('./app');
const { initSocket } = require('./sockets');
const tournamentManager = require('./game/tournamentManager');

const server = http.createServer(app);
initSocket(server);

// Every minute: start tournaments whose start_time has passed.
setInterval(() => {
  tournamentManager.startDueTournaments().catch((err) => console.error('Tournament check failed:', err));
}, 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ludo backend running on http://localhost:${PORT}`));
```

### `src/sockets/io.js` + `index.js`
```js
// sockets/io.js — holds the Socket.IO instance so any file can emit (no requires = no circular imports).
let io = null;
module.exports = { setIO: (instance) => { io = instance; }, getIO: () => io };
```
```js
// sockets/index.js — creates Socket.IO, checks the JWT, registers event handlers.
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { setIO } = require('./io');
const registerGameHandlers = require('./gameHandlers');
const registerQueueHandlers = require('./queueHandlers');

function initSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: '*' } });
  setIO(io);

  io.use((socket, next) => {
    const header = socket.handshake.headers.authorization || '';
    const token = socket.handshake.auth?.token || (header.startsWith('Bearer ') ? header.slice(7) : null);
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`player:${socket.user.player_id}`);
    registerGameHandlers(io, socket);
    registerQueueHandlers(io, socket);
  });
}

module.exports = { initSocket };
```

### Ack wrapper used in socket handlers
```js
// Runs handler(data) and replies through the ack callback with { success, data } or { success: false, message }.
function on(socket, event, handler) {
  socket.on(event, async (data, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      reply({ success: true, data: await handler(data || {}) });
    } catch (err) {
      if (!err.status) console.error(`[${event}]`, err);
      reply({ success: false, message: err.status ? err.message : 'Server error' });
    }
  });
}
```

---

## 6. REST API — detailed

All bodies are JSON with snake_case keys. "→" shows the `data` part of a success response.

### 6.1 Auth

**POST `/api/auth/guest`** (Public)
- Body: `{ device_id, display_name? }`
- If `guest_users.device_id` already exists, return that player. Otherwise create a `players` row (type `guest`, default name `Guest####`) and a `guest_users` row in one transaction.
- → `{ token, player: { player_id, display_name, avatar, player_type: "guest" } }`
- 400 if `device_id` is missing.

**POST `/api/auth/register`** (Public)
- Body: `{ username, email, password, display_name? }`
- Validate: username 3–30 chars `[A-Za-z0-9_]`, email contains `@`, password ≥ 6 chars.
- Hash with `bcrypt.hash(password, 10)`. Insert `players` (type `registered`) and `registered_users` in one transaction.
- → 201 `{ token, player }`. 409 if the username or email is taken.

**POST `/api/auth/login`** (Public)
- Body: `{ login, password }` (login = username or email)
- → `{ token, player }`. 401 `"Invalid username or password"` (same message for both cases).

**GET `/api/auth/me`** (Any)
- → `{ player_id, display_name, avatar, player_type, username?, email?, games_played?, games_won? }`

JWT: `jwt.sign({ player_id, player_type }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })`.

### 6.2 Users

| Endpoint | Details |
|----------|---------|
| `PUT /api/users/me` (Any) | Body `{ display_name?, avatar? }` → updated player |
| `GET /api/users/me/matches` (Any) | Last 20 finished matches: `match_id, match_type, game_mode, ended_at, color, finish_position` |
| `GET /api/users/search?q=` (Reg) | `username LIKE 'q%'`, max 20, excludes yourself → `[{ player_id, username, display_name, avatar }]` |
| `GET /api/users/leaderboard` (Public) | Top 20 by `games_won`, then `games_played` → `[{ player_id, username, display_name, games_played, games_won }]` |

### 6.3 Friends (all Reg)

| Endpoint | Details |
|----------|---------|
| `GET /api/friends` | Accepted friendships in either direction → `[{ friendship_id, player_id, username, display_name, avatar }]` |
| `GET /api/friends/requests` | → `{ received: [...pending where I am addressee], sent: [...pending where I am requester] }` |
| `POST /api/friends/requests` | Body `{ username }`. 404 user not found; 400 yourself; 409 if a pending or accepted row exists **in either direction**. A rejected row between the pair is deleted first, so people can ask again. → 201 friendship |
| `PUT /api/friends/requests/:friendship_id` | Body `{ action: "accept" \| "reject" }`. Only the addressee, only when pending. → updated friendship |
| `DELETE /api/friends/:player_id` | Deletes the accepted friendship between me and that player. 404 if not friends |

### 6.4 Rule sets and matches

| Endpoint | Details |
|----------|---------|
| `GET /api/rule-sets` (Public) | All rows |
| `POST /api/matches/bot` (Any) | Body `{ rule_set_id, total_players (2–4), game_mode ("ffa" \| "2v2"), difficulty ("easy" \| "hard") }`. 2v2 needs `total_players = 4`. The human gets seat 1; bots of that difficulty fill the rest (in 2v2, the human's teammate in seat 3 is a bot). Calls `matchSetup.setupAndStart` and then `gameManager.startMatch`. → 201 `{ match_id }` |
| `GET /api/matches/:match_id` (Any, own seat only, otherwise 403) | Same shape as `match:state` (§8.1) |
| `GET /api/matches/:match_id/moves` (Any, own seat only) | `[{ move_id, seat_no, color, token_no, dice_value, from_position, to_position, captured_token_id, is_auto, created_at }]` ordered by `move_id` |

### 6.5 Rooms and invitations

| Endpoint | Details |
|----------|---------|
| `POST /api/rooms` (Reg) | Body `{ rule_set_id, max_players (2–4), game_mode }` (2v2 needs 4). Transaction: `matches` (type room, status waiting), `room_matches` (host, unique code, retried on collision), host seat. → 201 `{ match_id, room_code }` |
| `GET /api/rooms/code/:room_code` (Any) | → `{ match_id, room_code, host_id, status, max_players, game_mode, rule_set, seats }` |
| `POST /api/rooms/join` (Any) | Body `{ room_code }` (case doesn't matter). 404 bad code; 409 cancelled / started / full. Adds a seat at the next free `SEATS_FOR_PLAYERS[max_players]` slot. Joining again returns your existing seat (safe to repeat). Emits `room:updated`. → `{ match_id, room_code, seat_no }` |
| `POST /api/rooms/:match_id/leave` (Any) | Removes my seat. If I'm the host: status → `cancelled`, pending invitations → `expired`. Emits `room:updated`. |
| `POST /api/rooms/:match_id/start` (Reg, host only) | Body `{ fill_with_bots: true }`. Needs at least 2 seats after filling (and 4 for 2v2). Calls `matchSetup.prepareForStart` (bots, teams, tokens, status in_progress), sets pending invitations to `expired`, then `gameManager.startMatch`. → `{ match_id }` |
| `POST /api/rooms/:match_id/invitations` (Reg, host only) | Body `{ receiver_id }`. Receiver must be an accepted friend; room must be waiting; 409 if a pending invitation already exists. `expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE)`. Emits `invite:received` to `player:<receiver_id>`. → 201 invitation |
| `GET /api/rooms/invitations` (Reg) | First runs `UPDATE ... SET status='expired' WHERE status='pending' AND expires_at < NOW()` (lazy expiry, no cron), then lists my pending invitations with room_code and sender name |
| `PUT /api/rooms/invitations/:invitation_id` (Reg, receiver only) | Body `{ action: "accept" \| "decline" }`. Accept: 409 if expired or the room is full or started, otherwise adds a seat and emits `room:updated`. → `{ match_id, room_code }` |

Room code: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I).

### 6.6 Tournaments

> Rebuilt on 2026-11-05 as the full tournament module. The full endpoint list is in [CLAUDE.md §8](CLAUDE.md), and `schema.sql` is the source of truth for the tables. The pseudocode further down is the older version; see `game/tournamentManager.js` for the current logic.

**User journey**

| Who | Step | How |
|-----|------|-----|
| Creator | Create | `POST /api/tournaments { name, description, rule_set_id, max_participants (2/4/8/16), players_per_match (2/4), start_time, round_break_minutes (1-60), join }`. The creator joins automatically unless `join: false`. |
| Creator | Edit before the start | `PUT /api/tournaments/:id` with any field. `max_participants` can't go below the number already joined. Members get `tournament:updated` (edited). |
| Anyone (registered) | Join from the list | `POST /:id/register` → 409 if full, already in, or started |
| Creator / participant | Invite a friend | `POST /:id/invitations { receiver_id }` → the friend gets `tournament:invited` |
| Friend | Answer | `GET /tournaments/invitations`, then `PUT /tournaments/invitations/:id { action }`. Accept = join. |
| Participant | Leave | `DELETE /:id/register` (before the start) |
| Creator | Remove a player | `DELETE /:id/participants/:player_id` (before the start) → that player gets `tournament:updated` (removed) |
| System / creator | Start | At `start_time` the scheduler starts it, or cancels it if there are fewer than 2 players. The creator can also `POST /:id/start` early. Pending invitations expire. |
| System | Draw round 1 | `ludoEngine.makeTournamentGroups`: 1v1 or 4-player, no byes. Matches are created as `waiting` with `scheduled_at` = now + 1 min. Players get `tournament:match_ready`. |
| Players | Lobby | Emit `match:join` → everyone gets `tournament:lobby` (who is here). When all players are present, the match starts early. |
| System / creator | Match start | At `scheduled_at` (scheduler), or creator `POST /:id/matches/:match_id/start`. The creator can move the time with `PUT .../schedule`. Players get `tournament:match_started`. |
| Players | Play | Normal gameplay. Absent players are auto-played by the turn timer. |
| System | Next round | When every match of the round has ended: losers are eliminated and the next round is drawn with `scheduled_at` = now + `round_break_minutes`. |
| System | Champion | The last winner gets status `champion`, `registered_users.tournaments_won + 1`, and everyone gets `tournament:updated` (finished, `champion_id`). |
| Creator | Cancel | `POST /:id/cancel` at any time before the end. Open matches are cancelled (`match:cancelled`). |
| Anyone | Follow | `GET /tournaments`, `GET /:id` (bracket + champion), `GET /mine`, `GET /my-matches` |

**Concurrency:** register, withdraw, remove, edit, start and round-closing all lock the tournament row (`FOR UPDATE`). A match start goes through `prepareForStart`, which locks the match row and only works when the status is `waiting`. So the scheduler, the lobby and the creator can't start the same match twice.

Example: Demo Cup (4 players, 1v1) → round 1 = 2 semi-finals → the 2 winners play the final → champion. 8 players with 4 per match → 2 matches → final of 2. (Both verified by the tournament journey test.)

<details><summary>Older design notes (replaced)</summary>


**tournamentManager logic**
```
startTournament(id):
  status = in_progress, current_round = 1 → buildRound(id, 1)

buildRound(id, round_no):
  players = active participants, shuffled
  groups  = as few groups as possible (max TOURNAMENT_SEATS = 4 each), sizes as equal as possible
            e.g. 8 → [4,4], 5 → [3,2], 2 → [2]  → every match has ≥ 2 players, so no byes are needed
  for each group (match_no = 1, 2, ...):
    matchSetup.setupAndStart({ match_type: 'tournament', rule_set_id: TOURNAMENT_RULE_SET_ID,
      player_ids: group, subtype: { tournament_id: id, round_no, match_no } })
    gameManager.startMatch(match_id)
    emit tournament:match_ready to each player:<id>

onMatchFinished(match_id):          // called by gameManager after a tournament match ends
  transaction, tournament row locked FOR UPDATE:
    if current_round != this match's round → return (another match already closed the round)
    if any match in this round is not finished → return (wait)
    everyone in this round who did not finish 1st → status eliminated, eliminated_round = round_no
    active = active participants
    if active.length === 1 → that participant status champion, tournament finished
    else → current_round + 1
  then buildRound(id, current_round)

startDueTournaments():              // setInterval every 60s in server.js
  tournaments in registration with start_time <= NOW():
    ≥ 2 participants → startTournament ;  else → status cancelled
```

Example: 8 players → round 1 = 2 matches of 4 → 2 winners → round 2 = a final with 2 players → champion.

</details>

---

## 7. Build phases

Each phase finishes with a **Done when** check. Don't start the next phase until it passes. Tick the phase in CLAUDE.md §14.

### Phase 0 — Project setup
- [ ] Install MySQL 8 Community Server (or XAMPP), make sure it runs on port 3306, and note the root password.
- [ ] `mkdir backend && cd backend && npm init -y`
- [ ] `npm install express cors mysql2 socket.io jsonwebtoken bcryptjs`
- [ ] Add the scripts to `package.json` (§5). Create `.env.example`, `.env` and `.gitignore` (`node_modules`, `.env`).
- [ ] Create `src/app.js`, `src/server.js`, `utils/httpError.js`, `middleware/errorHandler.js`. For now, use a health route without the DB check.
- **Done when:** `npm run dev` → `GET /api/health` returns `success: true`; an unknown URL returns a 404 JSON.

### Phase 1 — Database
- [ ] `database/schema.sql` (§3.2), `database/seed.sql` (§3.3), `database/reset.js` (§3.4)
- [ ] `src/config/db.js` (§5). Add the DB check to the health route.
- **Done when:** `npm run db:reset` succeeds; `SHOW TABLES;` lists **18** tables; `SELECT * FROM rule_sets` shows 3 rows; demo users exist; health returns `db: "ok"`.

### Phase 2 — Auth and players
- [ ] `models/playerModel.js`: `createGuest(display_name, device_id, conn)`, `findGuestByDevice`, `createRegistered({...}, conn)`, `findRegisteredByLogin`, `findRegisteredByUsername`, `findById`, `updateProfile` (every model function takes `conn = pool` as its last parameter)
- [ ] `middleware/auth.js` (§5)
- [ ] `controllers/authController.js`: `guest`, `register`, `login`, `me`
- [ ] `routes/authRoutes.js`
- **Done when (Postman):** guest login twice with the same `device_id` → same `player_id`; register → login → `/auth/me` works; wrong password → 401; no token on `/auth/me` → 401; the response never contains `password_hash`.

### Phase 3 — Users and friends
- [ ] `controllers/userController.js` + `routes/userRoutes.js`: updateMe, myMatches (returns `[]` until Phase 6), search, leaderboard
- [ ] `models/friendModel.js`: `findBetween(a, b)`, `createRequest`, `findById`, `updateStatus`, `deleteById`, `listFriends`, `listPending`
- [ ] `controllers/friendController.js` + `routes/friendRoutes.js`
- **Done when:** demo3 sends a request to demo4 → demo4 sees it under `received` → accepts → both see each other in `/friends`; a duplicate request → 409; a guest token on `/friends` → 403.

### Phase 4 — Ludo engine + tests
- [ ] `game/constants.js` (§4.1), `game/ludoEngine.js` (§4.2), `game/botAI.js` (§4.3)
- [ ] `tests/ludoEngine.test.js` with every case in §4.2
- **Done when:** `npm test` passes every case. The engine imports nothing from `models/` or `sockets/`.

### Phase 5 — Match setup + rule sets + bot match
- [ ] `models/ruleSetModel.js`, `botModel.js` (`pickBots(difficulty, count)`)
- [ ] `models/matchModel.js`: `createMatch`, `createSubtype(type, match_id, fields)`, `findById` (joins rule set), `addSeat`, `listSeats` (with display_name / bot name / team_no), `findSeatByPlayer`, `removeSeat`, `createTeam`, `setTeam`, `updateTurn(match_id, current_seat, dice_value)`, `setStatus`, `setFinishPosition`
- [ ] `models/tokenModel.js`: `createTokens(match_player_id, conn)` (4 rows at -1), `listByMatch` (joined with seat_no, color, team_no), `updatePosition`, `insertMove`, `listMovesByMatch`
- [ ] `game/matchSetup.js`:
  - `createMatch(conn, { match_type, rule_set_id, game_mode, max_players, subtype })` → match_id
  - `addHumanSeat(conn, match_id, player_id)` → next free seat from `SEATS_FOR_PLAYERS[max_players]` with colour from `SEAT_COLORS`
  - `prepareForStart(conn, match_id, { fill_with_bots, difficulty })` → bot seats in the empty slots, teams 1/2 if 2v2 (seat→team via `TEAM_OF_SEAT`), 4 tokens per seat, `status = in_progress`, `current_seat` = lowest seat, `started_at = NOW()`
  - `setupAndStart(opts)` → all three steps in one `withTransaction`, returns match_id (used by bot/online/tournament)
- [ ] `controllers/matchController.js` + `routes/matchRoutes.js`; `ruleSetController` + routes
- [ ] Add a simple `gameManager.getState(match_id)` now (needed by GET /matches/:id)
- **Done when:** `POST /matches/bot { rule_set_id: 1, total_players: 4, game_mode: "ffa", difficulty: "easy" }` creates 1 `matches` + 1 `bot_matches` + 4 `match_players` (1 human, 3 bots) + 16 `tokens` at -1. In 2v2, 2 `teams` are created and seats 1+3 / 2+4 are linked. `GET /matches/:id` returns the state.

### Phase 6 — Gameplay over Socket.IO
- [ ] `sockets/io.js`, `sockets/index.js` (§5), `sockets/gameHandlers.js` (`match:join`, `game:roll`, `game:move`)
- [ ] `game/gameManager.js` (full logic in §8): `getState`, `startMatch`, `startTurn`, `rollDice`, `moveToken`, `autoPlay`, `finishMatch`, `ensureTimer`
- [ ] `finishMatch`: rankings → `finish_position`; registered stats: `games_played + 1`, winners `games_won + 1`; emit `match:finished`; clear timer; for tournament matches, lazily require `tournamentManager` and call `onMatchFinished` (stub until Phase 9)
- [ ] Fill in `GET /users/me/matches`
- **Done when:** in Postman's Socket.IO tab: connect with the token → `match:join` → `game:roll` → `game:move` → `game:moved` arrives; bots play by themselves; with the **Demo** rule set and no input, the timer auto-plays until `match:finished`; `finish_position` and `games_played/games_won` are saved; two fast `game:roll` emits → the second one gets `"Already rolled"`.

### Phase 7 — Rooms + invitations
- [ ] `utils/roomCode.js`, `models/roomModel.js`, `controllers/roomController.js`, `routes/roomRoutes.js` (§6.5)
- [ ] Emit `room:updated` through `getIO().to('match:<id>')`, and `invite:received` through `getIO().to('player:<id>')`
- **Done when:** demo1 creates a room → code; a guest joins by code; demo1 invites demo2 (friend) → demo2 gets `invite:received` → accepts → seat; demo1 starts with `fill_with_bots: true` → everyone in `match:<id>` gets `match:state` with `in_progress`; inviting a non-friend → 403; joining a started room → 409; an expired invitation can't be accepted.

### Phase 8 — Online matchmaking
- [ ] `sockets/queueHandlers.js`:
  - `queues = { ffa2: [], ffa4: [], '2v2': [] }`, entries `{ player_id, socket_id }`
  - `queue:join { queue_key }` → validate the key, remove the player from every queue, push, emit `queue:waiting` to everyone in that queue
  - when `queue.length >= QUEUES[key].players` → `splice` that many → `setupAndStart({ match_type: 'online', rule_set_id: ONLINE_RULE_SET_ID, game_mode, player_ids, subtype: { queue_key } })` → `gameManager.startMatch` → emit `queue:matched { match_id }` to each `player:<id>`
  - `queue:leave` and `disconnect` → remove the player
- **Done when:** a guest and a registered user both join `ffa2` → both get the same `match_id` → both can `match:join` and play; leaving the queue removes you; the same player joining twice doesn't create two entries.

### Phase 9 — Tournaments
- [ ] `models/tournamentModel.js`, `game/tournamentManager.js` (§6.6), `controllers/tournamentController.js`, `routes/tournamentRoutes.js`
- [ ] Replace the Phase 6 stub with the real `onMatchFinished`
- [ ] `setInterval` in `server.js` for `startDueTournaments`
- **Done when:** demo1–4 register for "Demo Cup" (max 4) → it starts automatically → 1 match is created and each player gets `tournament:match_ready` → after the match the winner is `champion`, the others are `eliminated`, and the tournament is `finished`. An 8-player tournament makes 2 round-1 matches, then a final.

### Phase 10 — Polish + viva prep
- [ ] Check every file has its top comment, no dead code, no `console.log` spam
- [ ] Export the Postman collection to `backend/docs/ludo-api.postman_collection.json` (environment vars: `base_url`, `token`, `admin_key`)
- [ ] A short `backend/README.md` covering install MySQL → `.env` → `npm i` → `db:reset` → `dev`
- [ ] Do a full demo run (§10.3) from a fresh `db:reset`
- **Done when:** a clean machine can follow the README and finish the demo script without errors.

---

## 8. Gameplay internals (gameManager)

### 8.1 Match state shape (`getState`)
```json
{
  "match": { "match_id": 7, "match_type": "bot", "game_mode": "ffa", "status": "in_progress",
             "current_seat": 1, "dice_value": null, "max_players": 4,
             "rule_set": { "rule_set_id": 1, "name": "Classic", "six_to_unlock": 1, "tokens_to_win": 4, "turn_seconds": 30 } },
  "seats": [
    { "match_player_id": 21, "seat_no": 1, "color": "red", "player_id": 5, "bot_id": null,
      "display_name": "Ali", "team_no": null, "finish_position": null }
  ],
  "tokens": [ { "token_id": 81, "match_player_id": 21, "seat_no": 1, "token_no": 1, "position": -1 } ],
  "turn_deadline": 1767000000000
}
```

### 8.2 In-memory timers
```js
const timers = new Map(); // match_id → { timeout, deadline }
function clearTimer(match_id) { ... clearTimeout + delete ... }
```

### 8.3 Functions (pseudocode)

```
startMatch(match_id):
  emit match:state to match:<id>
  setTimeout(startTurn(match_id), START_DELAY_MS)       // lets clients join

startTurn(match_id):
  match = find; if status != in_progress → return
  seat  = seat with seat_no = match.current_seat
  clearTimer(match_id)
  if seat.bot_id → timer = setTimeout(autoPlay(match_id, seat_no), BOT_DELAY_MS), deadline = null
  else           → timer = setTimeout(autoPlay(match_id, seat_no, is_auto=true), turn_seconds*1000)
                   deadline = Date.now() + turn_seconds*1000
  emit game:turn { seat_no, deadline }

rollDice(match_id, seat_no):                            // socket handler already found seat_no from player_id
  withTransaction:
    match = SELECT ... FROM matches WHERE match_id = ? FOR UPDATE
    409 if status != in_progress | current_seat != seat_no ("Not your turn") | dice_value != NULL ("Already rolled")
    dice  = crypto.randomInt(1, 7)
    moves = ludoEngine.getValidMoves(seatTokens, dice, rules)
    if moves empty → current_seat = getNextSeat(...), dice_value stays NULL   // turn passes NOW in DB
    else           → dice_value = dice
  emit game:rolled { seat_no, dice_value: dice, valid_token_ids }
  if moves empty → clearTimer; setTimeout(startTurn(match_id), NO_MOVE_DELAY_MS)
  return { dice_value, valid_token_ids }

moveToken(match_id, seat_no, token_id, is_auto = false):
  withTransaction:
    match = ... FOR UPDATE ; 409 checks (in_progress, my turn, dice_value NOT NULL)
    tokens = all tokens of the match (with seat_no, color, team_no)
    move = getValidMoves(seatTokens, match.dice_value, rules).find(token_id)  → 400 "Invalid move" if missing
    captured = rules.capture_enabled ? findCapture(move, seat, tokens) : null
    UPDATE tokens SET position = move.to ;  if captured → UPDATE captured token position = -1
    INSERT moves (match_player_id, token_id, captured_token_id, dice_value, from, to, is_auto)
    update tokens in memory → check finish:
      FFA : if isSeatFinished(seat)                         → winners = [seat_no]
      2v2 : if seat AND teammate finished                   → winners = [seat_no, teammate]
    if winners → finishMatch(conn, match, winners)           // same transaction
    else:
      active = seats not finished
      extra  = getsExtraTurn({ dice, captured, reachedHome: move.to === 56 }, rules) && active.includes(seat_no)
      next   = extra ? seat_no : getNextSeat(seat_no, active)
      UPDATE matches SET current_seat = next, dice_value = NULL
  emit game:moved { seat_no, token_id, from_position, to_position, captured_token_id, extra_turn, is_auto }
  if winners → clearTimer; emit match:finished; if tournament → tournamentManager.onMatchFinished(match_id)
  else       → startTurn(match_id)

autoPlay(match_id, seat_no, is_auto):                   // bots and timeouts; wrapped in try/catch
  match = find; return if not in_progress or current_seat != seat_no
  if dice_value is NULL → result = rollDice(match_id, seat_no); return if no valid moves
  if seat is bot → await sleep(BOT_DELAY_MS)            // humans: no sleep (avoids racing a late click)
  pick = botAI.chooseMove(validMoves, context, seat is bot ? bot.difficulty : 'hard')
  moveToken(match_id, seat_no, pick.token_id, is_auto)

finishMatch(conn, match, winnerSeatNos):
  ranking = rankSeats(...) → UPDATE match_players SET finish_position
  UPDATE matches SET status='finished', ended_at=NOW(), current_seat=NULL, dice_value=NULL
  for each human seat that is registered: games_played + 1, and games_won + 1 if finish_position = 1

ensureTimer(match_id):                                  // called on match:join
  if match in_progress and !timers.has(match_id) → startTurn(match_id)
```

### 8.4 Turn sequence (example)

```
App (seat 1)                     Server                                   MySQL
  │ match:join {match_id} ──────▶ seat check, socket.join(match:7)
  │ ◀──────────── ack + match:state ; ensureTimer
  │ ◀──────────── game:turn {seat 1, deadline}
  │ game:roll ──────────────────▶ lock match, randomInt → 6 ───────────▶ UPDATE matches dice_value=6
  │ ◀──────────── game:rolled {6, valid [81,82,83,84]}
  │ game:move {token 81} ───────▶ validate, capture?, save ────────────▶ UPDATE tokens, INSERT moves,
  │                                                                       UPDATE matches (seat, dice NULL)
  │ ◀──────────── game:moved {81, -1→0, extra_turn: true}
  │ ◀──────────── game:turn {seat 1 again}
  ...  seat 2 is a bot → server autoPlays after 1s → game:rolled / game:moved sent to everyone
```

---

## 9. Testing plan

| Level | Tool | What |
|-------|------|------|
| Unit | `npm test` (`node --test`) | every `ludoEngine` function (§4.2 cases) |
| API | Postman collection | every endpoint: happy path + one error each (401/403/404/409) |
| Socket | Postman Socket.IO request (header `Authorization: Bearer {{token}}`) | join, roll, move, ack errors, queue |
| Self-play | Bot match with the **Demo** rule set (10 s timer) + no input | the whole turn loop runs to `match:finished` with no client |
| End-to-end | Android emulator + a real phone (or 2 emulators) | online queue, room invite, a full game |
| DB check | MySQL Workbench / phpMyAdmin | rows appear in `moves`, `tokens` change, stats go up |

Postman tip: in the login request's *Tests* tab add `pm.environment.set('token', pm.response.json().data.token)` so every request after it uses the new token.

---

## 10. Viva preparation

### 10.1 ERD → code map (be ready to point at it)

| ERD part | Table | Main code |
|----------|-------|-----------|
| PLAYER / GUEST / REGISTERED | players, guest_users, registered_users | `authController`, `playerModel` |
| FRIENDSHIP | friendships | `friendController`, `friendModel` |
| MATCH + 4 subtypes | matches, bot/online/room/tournament_matches | `matchSetup`, `matchModel` |
| RULE_SET | rule_sets | `ludoEngine` reads the flags |
| MATCH_PLAYER / TEAM / BOT | match_players, teams, bots | `matchSetup.prepareForStart`, `botAI` |
| TOKEN / MOVE | tokens, moves | `gameManager.moveToken`, `tokenModel` |
| ROOM_INVITATION | room_invitations | `roomController` |
| TOURNAMENT / PARTICIPANT | tournaments, tournament_participants | `tournamentManager` |

### 10.2 Likely questions and short answers
- **How did you implement specialisation?** A type column in the parent table, and a subtype table whose PK is also an FK to the parent. Both rows are inserted in one transaction, which keeps it *disjoint* (one type column) and *total* (always inserted together).
- **How do you stop cheating?** The client never sends a dice value. The server rolls with `crypto.randomInt` and checks every move with `getValidMoves`.
- **What if two players click at the same time?** Each roll or move locks the match row (`SELECT ... FOR UPDATE`) inside a transaction, and the second request sees the updated state and is rejected.
- **What if the server restarts mid-game?** All state is in MySQL. When players rejoin, `ensureTimer` restarts the turn timer.
- **How does capture work?** Token positions are relative to each colour. `toGlobalCell` turns them into shared track cells, and if exactly one opponent token is on a non-safe cell, it goes back to base.
- **Why MySQL and not MongoDB?** The data is strongly relational (19 relationships), FKs and transactions protect integrity, and it matches the ERD directly.
- **Why Socket.IO?** Turns have to reach all players instantly. Polling REST would be slow and wasteful.
- **Why no ORM?** Raw SQL is easier to explain, and each query maps clearly to the ERD.
- **How are guests different?** A guest JWT has `player_type: 'guest'`, and the `registeredOnly` middleware blocks guests from friends, creating rooms, invites and tournaments (as the flow says).

### 10.3 Demo script (around 10 minutes)
1. `npm run db:reset` → show the 18 tables in Workbench.
2. Postman: guest login → bot match with the Demo rule set → join over the socket → roll/move → bots play → `match:finished` → show the `moves` table.
3. demo1 login → friend request to demo4 → accept.
4. demo1 creates a room → a guest joins by code → invite demo2 → accept → start with bots.
5. **Tournament (main demo):** use Demo Cup (4 players, 1v1, Demo rules).
   - demo1 (creator) invites demo2 and demo3, who accept. demo4 joins from the public list.
   - demo1 edits the description, then presses **Start**. Show the bracket and each match's time.
   - Players open the lobby, and the match starts early.
   - Move one match's time, then use "start now".
   - After the semi-finals the final is scheduled after the 1-minute break.
   - At the end, show the champion and `tournaments_won`.
6. Live change: set `turn_seconds` to 15 in `rule_sets` and show the new deadline.

---

## 11. Mobile app integration notes

- Base URL: emulator `http://10.0.2.2:3000`, real phone `http://<PC-LAN-IP>:3000`. Keep it in one config file in the app.
- Save the JWT (AsyncStorage) after guest login or login, and send `Authorization: Bearer <token>` on every request.
- Guest `device_id`: generate a random ID once on first launch and store it.
- Socket: `socket.io-client`, `io(BASE_URL, { auth: { token } })`. Connect once after login and reuse it on every screen.
- Board screen: on open, emit `match:join`; draw from `match:state`; update on `game:rolled` / `game:moved` / `game:turn`; show `match:finished`.
- To map a token's `position` to the screen: positions 0–50 → global cell `(START_OFFSET[color] + position) % 52` → the board's 52-cell coordinate table. 51–55 → that colour's home column cells. -1 → base slot `token_no`. 56 → centre.

---

## 12. Future work (put this in the report, don't build it now)

Chat in matches, push notifications for invites (FCM), password reset by email, three-sixes rule and blocks, upgrading a guest to registered while keeping stats, spectator mode, forfeit after disconnecting, rate limiting, Redis for the queue if there are multiple server instances, Docker deployment, an admin web panel for tournaments.
