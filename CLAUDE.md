# CLAUDE.md — Ludo FYP Backend

Backend for the **Online Multiplayer Ludo** mobile game (Final Year Project).
Stack: **Node.js + Express 5 + Socket.IO + MySQL**, plain JavaScript (CommonJS).
All backend code lives in [backend/](backend/). Full build plan, SQL schema and API details: [BACKEND_PLAN.md](BACKEND_PLAN.md).

---

## 1. Golden rules (read before writing any code)

1. **Simple beats clever.** This is an FYP. The student must explain every line in the viva and change code live in front of examiners. No extra layers, no design patterns for their own sake, no TypeScript, no ORM, no classes unless they're really needed.
2. **Ask before adding any npm package.** Allowed: `express`, `cors`, `mysql2`, `socket.io`, `jsonwebtoken`, `bcryptjs`. Anything else needs approval.
3. **Fixed flow:** `routes → controllers → models → MySQL`. All Ludo logic goes in `src/game/`. Don't add a "services" or "repositories" layer.
4. **Raw SQL with `?` placeholders only.** Never put user input into SQL with string concatenation or template literals.
5. **DB matches the ERD 1:1.** 19 entities = 19 tables, 24 relationships = 24 foreign keys. Don't add tables or FKs that aren't in the ERD without asking, because examiners will compare the two. (On 2026-11-05 the user approved adding TOURNAMENT_INVITATION plus "REGISTERED_USER creates TOURNAMENT" and "RULE_SET governs TOURNAMENT" to the original 18-entity / 19-relationship ERD.)
6. **The server is in charge of the game.** It rolls the dice and checks every move. The client only says what it wants to do ("roll", "move token 12").
7. **snake_case everywhere:** DB columns, JSON request bodies, JSON responses. Rows go out as-is, with no camelCase mapping layer.
8. **Every file starts with a 1–2 line comment** saying what it does. Comment the *why* in tricky places (game rules). Don't write comments that just repeat the code.
9. **Keep files small** (under ~200 lines) and functions short. When a file grows, split it by feature, not by pattern.
10. **Never return `password_hash`**, and never log passwords or JWTs.
11. **Keep `database/schema.sql` and `seed.sql` up to date.** Any DB change must go into those files so `npm run db:reset` always rebuilds the current schema.
12. After finishing a phase, tick it in **§14 Build status** below.

---

## 2. Tech stack

| Part | Choice | Why |
|------|--------|-----|
| Runtime | Node.js 22+ (user has Node 25) | built-in `--env-file`, `--watch`, `node --test` |
| HTTP | Express 5 | async errors reach the error handler on their own, so no try/catch wrappers |
| Realtime | Socket.IO 4 | turns, online matchmaking, room lobby |
| Database | MySQL 8 (or MariaDB 10.2+ through XAMPP) via `mysql2/promise` pool | raw SQL is easy to show and explain |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` | bcryptjs is pure JS, so nothing native to compile on Windows |
| Env vars | `node --env-file=.env` | no dotenv |
| Auto-reload | `node --watch` | no nodemon |
| Tests | `node --test` (built-in) | no Jest |

---

## 3. Commands (run inside `backend/`)

```bash
npm install
npm run db:reset   # DROPS and recreates the DB, loads schema.sql + seed.sql + demo users (WIPES DATA)
npm run dev        # dev server with auto-reload → http://localhost:3000
npm start          # normal start
npm test           # Ludo engine unit tests
```

Health check: `GET http://localhost:3000/api/health` → `{ "success": true, "data": { "status": "ok", "db": "ok" } }`

`.env` (copy from `.env.example`):
```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=ludo_fyp
JWT_SECRET=change_this_long_random_string
JWT_EXPIRES_IN=30d
```
Port 3000 clashes with the user's other project (the FSM Next.js dev server). If both are running, set `PORT=3100` in `.env`, or stop the other app first.

---

## 4. Folder structure

```
backend/
├── package.json
├── .env.example                # copy to .env (never commit .env)
├── database/
│   ├── schema.sql              # 18 CREATE TABLEs — source of truth for the DB
│   ├── seed.sql                # rule sets, bots
│   └── reset.js                # npm run db:reset (drop + create + schema + seed + demo users + Demo Cup)
├── src/
│   ├── server.js               # entry: http server + Socket.IO + tournament scheduler (tick every 5 s)
│   ├── app.js                  # express app: cors, json, routes, 404, error handler
│   ├── config/
│   │   └── db.js               # mysql2 pool + withTransaction()
│   ├── middleware/
│   │   ├── auth.js             # auth, registeredOnly
│   │   └── errorHandler.js     # turns thrown errors into JSON
│   ├── utils/
│   │   ├── httpError.js        # httpError(status, message)
│   │   ├── validate.js         # toId(), oneOf() — tiny input checks that throw 400
│   │   └── roomCode.js         # 6-char room code generator
│   ├── routes/                 # URL → controller only. No logic here.
│   │   ├── authRoutes.js       # /api/auth
│   │   ├── userRoutes.js       # /api/users
│   │   ├── friendRoutes.js     # /api/friends
│   │   ├── ruleSetRoutes.js    # /api/rule-sets
│   │   ├── matchRoutes.js      # /api/matches
│   │   ├── roomRoutes.js       # /api/rooms (rooms + invitations)
│   │   └── tournamentRoutes.js # /api/tournaments
│   ├── controllers/            # read req → validate → call models/game → send res
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── friendController.js
│   │   ├── ruleSetController.js
│   │   ├── matchController.js
│   │   ├── roomController.js
│   │   ├── tournamentController.js     # browse, details, create + creator controls
│   │   └── tournamentJoinController.js # register, withdraw, invite friends, answer invitations
│   ├── models/                 # SQL only. Return rows. Know nothing about req/res.
│   │   ├── playerModel.js      # players, guest_users, registered_users
│   │   ├── friendModel.js      # friendships
│   │   ├── ruleSetModel.js     # rule_sets
│   │   ├── botModel.js         # bots
│   │   ├── matchModel.js       # matches, 4 subtype tables, teams, match_players
│   │   ├── tokenModel.js       # tokens, moves
│   │   ├── roomModel.js        # room_matches, room_invitations
│   │   ├── tournamentModel.js  # tournaments, tournament_participants, tournament_matches
│   │   └── tournamentInviteModel.js # tournament_invitations
│   ├── game/                   # everything Ludo
│   │   ├── constants.js        # board numbers, safe cells, seat colours, delays
│   │   ├── ludoEngine.js       # PURE rule functions — no DB, no sockets (unit tested)
│   │   ├── botAI.js            # picks a token for bots and for timed-out players
│   │   ├── matchSetup.js       # create match, seats, teams, bots, tokens (in transactions)
│   │   ├── gameManager.js      # turn loop: roll, move, timers, bot turns, finish match, stats
│   │   └── tournamentManager.js# start, schedule rounds, lobby early start, advance winners, champion, cancel, tick()
│   └── sockets/
│       ├── io.js               # holds the io instance: setIO()/getIO() (no requires → no circular imports)
│       ├── index.js            # create Socket.IO server, JWT check, register handlers
│       ├── on.js               # on(socket, event, handler) — ack wrapper { success, data | message }
│       ├── gameHandlers.js     # match:join, game:roll, game:move
│       └── queueHandlers.js    # online matchmaking queue (in memory)
├── tests/
│   └── ludoEngine.test.js
├── docs/
│   └── ludo-api.postman_collection.json   # import into Postman
└── README.md                   # setup steps for a fresh machine
```

---

## 5. How a request flows (explain this in the viva)

```
REST:      Mobile app ──HTTP──▶ routes/ ─▶ middleware/auth ─▶ controllers/ ─▶ models/ ─▶ MySQL

Realtime:  Mobile app ◀─Socket.IO─▶ sockets/ ─▶ game/gameManager ─▶ game/ludoEngine (rules, pure)
                                                     └──────────────▶ models/ ─▶ MySQL
```

- **MySQL is the source of truth for game state:** token positions, whose turn it is, and the pending dice value. A server restart doesn't lose games.
- **Only two things live in memory:** the matchmaking queue (entries `{ player_id, socket_id }`) and the turn timers. When someone emits `match:join` and the timer is missing (after a restart), `gameManager.ensureTimer()` starts it again. If a timer callback fails (a race with a player's click, or a DB hiccup), it retries the turn after 1 s, so a match never freezes. `moveToken` clears the timer as soon as a move is saved.
- Every roll or move runs in **one transaction** that starts with `SELECT ... FROM matches WHERE match_id = ? FOR UPDATE`, so two clicks at the same moment can't both go through.

---

## 6. Database

- 19 tables, one per ERD entity. **Plural snake_case names.** The match table is `matches` because `MATCH` is a reserved word in MySQL.
- **Subtypes (disjoint + total):** the parent table has a type column (`players.player_type`, `matches.match_type`), and each subtype table's primary key is also a foreign key to the parent. Always insert the parent row and the subtype row in **one transaction**.
- **Winners and champions have no extra FK.** Use `match_players.finish_position = 1` and `tournament_participants.status = 'champion'`.
- **No `ON DELETE CASCADE / SET NULL`.** Nothing is hard-deleted except room seats before a match starts and friendships. (MySQL also doesn't allow a CHECK constraint on a column that has an FK referential action, and `match_players` has a CHECK.)
- Do date math in SQL (`NOW()`, `DATE_ADD(NOW(), INTERVAL 10 MINUTE)`), not in JS, so timezones can't cause bugs.
- Booleans are `TINYINT(1)` and come back as `0`/`1`. Use `!!value` in JS.

| # | ERD entity | Table | Key columns |
|---|-----------|-------|-------------|
| 1 | PLAYER | `players` | player_id, display_name, avatar, player_type |
| 2 | GUEST_USER | `guest_users` | player_id (PK+FK), device_id |
| 3 | REGISTERED_USER | `registered_users` | player_id (PK+FK), username, email, password_hash, games_played, games_won |
| 4 | FRIENDSHIP | `friendships` | requester_id, addressee_id, status |
| 5 | RULE_SET | `rule_sets` | six_to_unlock, extra_turn_on_six/capture/home, capture_enabled, tokens_to_win, turn_seconds |
| 6 | MATCH | `matches` | rule_set_id, match_type, game_mode, max_players, status, current_seat, dice_value |
| 7 | BOT_MATCH | `bot_matches` | match_id (PK+FK), difficulty |
| 8 | ONLINE_MATCH | `online_matches` | match_id (PK+FK), queue_key |
| 9 | ROOM_MATCH | `room_matches` | match_id (PK+FK), host_id, room_code |
| 10 | TOURNAMENT_MATCH | `tournament_matches` | match_id (PK+FK), tournament_id, round_no, match_no, scheduled_at |
| 11 | TEAM | `teams` | match_id, team_no (1/2) — 2v2 only |
| 12 | MATCH_PLAYER | `match_players` | match_id, player_id **XOR** bot_id, team_id, seat_no, color, finish_position |
| 13 | BOT | `bots` | name, difficulty |
| 14 | TOKEN | `tokens` | match_player_id, token_no (1–4), position |
| 15 | MOVE | `moves` | match_player_id, token_id, captured_token_id, dice_value, from/to_position, is_auto |
| 16 | ROOM_INVITATION | `room_invitations` | match_id, sender_id, receiver_id, status, expires_at |
| 17 | TOURNAMENT | `tournaments` | **creator_id**, **rule_set_id**, name, description, max_participants, players_per_match, start_time, round_break_minutes, status, current_round |
| 18 | TOURNAMENT_PARTICIPANT | `tournament_participants` | tournament_id, player_id, status (active/eliminated/champion), eliminated_round |
| 19 | TOURNAMENT_INVITATION | `tournament_invitations` | tournament_id, sender_id, receiver_id, status (pending/accepted/declined/expired) |

`registered_users` also has a `tournaments_won` column (shown on the profile).

---

## 7. Game rules (code lives in `game/ludoEngine.js`)

**Board model.** Each token stores its `position` counted from its own colour's start cell:
- `-1` means in base (yard)
- `0–50` means on the main track (0 = own start cell)
- `51–55` means in its own home column (no one else can reach it)
- `56` means home (finished)

The main track has **52 cells**. Global cell = `(START_OFFSET[color] + position) % 52`, used only for positions 0–50.
- `START_OFFSET`: red 0, green 13, yellow 26, blue 39
- `SAFE_CELLS` (global): 0, 8, 13, 21, 26, 34, 39, 47 (four start cells plus four star cells)
- Seats: 1 = red, 2 = green, 3 = yellow, 4 = blue. A 2-player match uses seats 1 and 3, a 3-player match uses 1, 2 and 3. Turns go in seat order (clockwise).
- 2v2: Team 1 = seats 1 and 3, Team 2 = seats 2 and 4.

**Rules (switched on and off by the match's `rule_sets` row):**
1. **Unlock:** a token leaves base to position 0 on a 6, or on a 1 or 6 when `six_to_unlock = 0`.
2. **Exact roll home:** a move is invalid if `position + dice > 56`.
3. **No valid move:** the turn passes automatically.
4. **Capture** (only when `capture_enabled`): a token lands on a main-track cell (0–50) that isn't a safe cell and holds **exactly one** opponent token, so that token goes back to -1. If two or more tokens share a cell, they form a safe group and nothing is captured. Teammates are never captured. A move captures at most one token, which matches the ERD (each move has 0 or 1 captured token).
5. **Extra turn:** on a six, a capture, or a token reaching home. Each one has its own rule-set flag.
6. **Seat finished:** when the number of tokens at 56 is at least `tokens_to_win` (4 for Classic, fewer for quick modes).
7. **Free-for-all end:** the match ends as soon as the first seat finishes. The other seats are ranked by progress (`sum(position + 1)`, ties broken by seat_no).
8. **2v2 end:** a finished seat is skipped in turn order. A team wins when both its seats have finished. The winning seats get finish_position 1 and the losing seats get 2.
9. **Turn timer:** `turn_seconds`. When time runs out, the server plays the turn itself (botAI "hard" pick) and saves the move with `is_auto = 1`.
10. **Bot seats:** the server plays them after `BOT_DELAY_MS`.

Not implemented on purpose (possible future work): three sixes in a row = lost turn, blocks that stop movement.

---

## 8. REST API (all paths start with `/api`)

- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "message": "..." }`
- Auth header: `Authorization: Bearer <jwt>`. The JWT payload is `{ player_id, player_type }`.
- Who can call: **Public** = anyone · **Any** = guest or registered (logged in) · **Reg** = registered only · **Creator** = the registered user who created the tournament

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET | `/health` | Public | server + DB check |
| POST | `/auth/guest` | Public | guest login by `device_id` (same device → same player) |
| POST | `/auth/register` | Public | sign up |
| POST | `/auth/login` | Public | login with username or email |
| GET | `/auth/me` | Any | current player + stats |
| PUT | `/users/me` | Any | update display_name / avatar |
| GET | `/users/me/matches` | Any | match history |
| GET | `/users/search?q=` | Reg | find registered users by username |
| GET | `/users/leaderboard` | Public | top 20 by games_won |
| GET | `/friends` | Reg | accepted friends |
| GET | `/friends/requests` | Reg | pending requests `{ received, sent }` |
| POST | `/friends/requests` | Reg | send request `{ username }` |
| PUT | `/friends/requests/:friendship_id` | Reg | `{ action: "accept" \| "reject" }` |
| DELETE | `/friends/:player_id` | Reg | remove friend |
| GET | `/rule-sets` | Public | list rule sets |
| POST | `/matches/bot` | Any | create + start a bot match |
| GET | `/matches/:match_id` | Any (own seat) | full match state. Only players in the match can read it, because it holds the room_code. |
| GET | `/matches/:match_id/moves` | Any (own seat) | move history |
| POST | `/rooms` | Reg | create room → `{ match_id, room_code }` |
| GET | `/rooms/code/:room_code` | Any | lobby info |
| POST | `/rooms/join` | Any | join by `{ room_code }` |
| POST | `/rooms/:match_id/leave` | Any | leave lobby (host leaving cancels the room) |
| POST | `/rooms/:match_id/start` | Reg (host) | start, `{ fill_with_bots }` |
| POST | `/rooms/:match_id/invitations` | Reg (host) | invite a friend `{ receiver_id }` |
| GET | `/rooms/invitations` | Reg | my pending invitations |
| PUT | `/rooms/invitations/:invitation_id` | Reg | `{ action: "accept" \| "decline" }` |
| GET | `/tournaments?status=` | Public | list (with creator_username, rule_set_name, participant_count) |
| GET | `/tournaments/mine` | Reg | tournaments I created or joined (`is_creator`, `my_status`) |
| GET | `/tournaments/my-matches` | Reg | my waiting / running tournament matches with `scheduled_at` |
| GET | `/tournaments/:tournament_id` | Public | details + participants + bracket (rounds → matches → seats, winner_id) + champion |
| POST | `/tournaments` | Reg | create `{ name, description?, rule_set_id, max_participants, players_per_match, start_time, round_break_minutes, join? }` |
| PUT | `/tournaments/:tournament_id` | Creator | edit any field (only before the start) |
| POST | `/tournaments/:tournament_id/start` | Creator | start now (at least 2 players), otherwise it starts by itself at start_time |
| POST | `/tournaments/:tournament_id/cancel` | Creator | cancel (also stops open matches) |
| DELETE | `/tournaments/:tournament_id/participants/:player_id` | Creator | remove a player (before the start) |
| PUT | `/tournaments/:tournament_id/matches/:match_id/schedule` | Creator | change a waiting match's time `{ scheduled_at }` |
| POST | `/tournaments/:tournament_id/matches/:match_id/start` | Creator | start a waiting match now |
| POST | `/tournaments/:tournament_id/register` | Reg | join (before the start, if not full) |
| DELETE | `/tournaments/:tournament_id/register` | Reg | withdraw (before the start) |
| POST | `/tournaments/:tournament_id/invitations` | Reg (creator or participant) | invite a friend `{ receiver_id }` |
| GET | `/tournaments/invitations` | Reg | my pending tournament invitations |
| PUT | `/tournaments/invitations/:invitation_id` | Reg | `{ action: "accept" \| "decline" }` (accept = join) |

**Tournament lifecycle:**
1. **registration:** join, invite, withdraw; the creator can edit or remove players.
2. **Start:** at `start_time` (scheduler) or when the creator presses Start. With fewer than 2 players at `start_time`, the tournament is cancelled.
3. **Round 1:** matches are drawn (2 or 4 players each, no byes) and scheduled 1 minute later.
4. **Each match starts:**
   - at `scheduled_at`,
   - or early when all its players are in the lobby (`match:join`),
   - or when the creator presses "start match now".
5. **After each round:** when all its matches end, losers are eliminated and the next round is scheduled `round_break_minutes` later. The last winner is the champion (`tournaments_won + 1`).
6. **No-show players:** their turns are auto-played by the turn timer, so the bracket always finishes.

Status codes: 200 ok · 201 created · 400 bad input · 401 missing/bad token · 403 not allowed (guest on a Reg route, not the host) · 404 not found · 409 conflict (duplicate, full, already started, not your turn).

---

## 9. Socket.IO events

Connect with `io(SERVER_URL, { auth: { token } })`. The `Authorization: Bearer` header also works (handy for Postman).
On connect, the server puts the socket in room `player:<player_id>` for personal notifications. Game sockets join `match:<match_id>`.

**Client → server.** Each one replies through an ack callback: `socket.emit('game:roll', { match_id }, (res) => ...)`, where `res = { success, data?, message? }`.

| Event | Payload | Notes |
|-------|---------|-------|
| `match:join` | `{ match_id }` | seat owners only. Joins the socket room and replies with the state. Also used for the room lobby. |
| `game:roll` | `{ match_id }` | only on your turn, before rolling |
| `game:move` | `{ match_id, token_id }` | token must be in the `valid_token_ids` from the last roll |
| `queue:join` | `{ queue_key }` | `"ffa2"`, `"ffa4"` or `"2v2"` |
| `queue:leave` | `{}` | disconnecting also removes you from the queue |

**Server → client:**

| Event | Sent to | Payload |
|-------|---------|---------|
| `match:state` | `match:<id>` | `{ match, seats, tokens, turn_deadline }` |
| `game:turn` | `match:<id>` | `{ seat_no, deadline }` |
| `game:rolled` | `match:<id>` | `{ seat_no, dice_value, valid_token_ids }` (empty list = turn passes) |
| `game:moved` | `match:<id>` | `{ seat_no, token_id, from_position, to_position, captured_token_id, extra_turn, is_auto }` |
| `match:finished` | `match:<id>` | `{ match_id, rankings: [{ seat_no, player_id, bot_id, finish_position }] }` |
| `room:updated` | `match:<id>` | `{ match_id, status, seats }` |
| `queue:waiting` | each queued player | `{ queue_key, waiting, needed }` |
| `queue:matched` | `player:<id>` | `{ match_id }` → client opens the board and emits `match:join` |
| `invite:received` | `player:<id>` | `{ invitation_id, match_id, room_code, sender }` |
| `tournament:invited` | `player:<id>` | `{ invitation_id, tournament_id, tournament_name, start_time, sender }` |
| `tournament:match_ready` | `player:<id>` | `{ tournament_id, match_id, round_no, match_no, scheduled_at }`. Sent when a round is drawn and when the creator changes the time. |
| `tournament:lobby` | `match:<id>` | `{ match_id, scheduled_at, player_ids, present_player_ids }` |
| `tournament:match_started` | `player:<id>` | `{ tournament_id, match_id, round_no }` → open the board |
| `tournament:updated` | `player:<id>` (participants + creator) | `{ tournament_id, reason, ... }`. reason is one of: `edited`, `player_joined`, `player_left`, `removed`, `started`, `match_started`, `match_finished`, `round_scheduled`, `rescheduled`, `finished` (+ `champion_id`), `cancelled` |
| `match:cancelled` | `match:<id>` | `{ match_id }` (the tournament was cancelled) |

---

## 10. Code conventions and patterns

- CommonJS (`require` / `module.exports`). Files are camelCase.js. Functions are verbs (`findById`, `createRoom`). SQL keywords are UPPERCASE.
- Validation is done inline in controllers with `throw httpError(400, '...')`. No validation library.
- **Express 5 notes:** a thrown error or rejected promise goes straight to `errorHandler`, so don't wrap in try/catch. `req.body` is `undefined` when there's no JSON body, so always write `req.body || {}`. Don't use `*` wildcard routes; the 404 handler is a plain `app.use(...)` at the end.
- **Model pattern.** Every model function takes `conn = pool` as its **last** parameter, so it also works inside transactions. Inside a `withTransaction` callback, **always pass `conn`**. A query on the pool would wait on the row lock that your own transaction holds, which causes a deadlock until the lock wait timeout. (Functions in `game/matchSetup.js` take `conn` first, because they only run inside transactions.)
  ```js
  // models/playerModel.js — SQL for players, guest_users, registered_users
  const { pool } = require('../config/db');

  async function findRegisteredByLogin(login, conn = pool) {
    const [rows] = await conn.query(
      `SELECT p.player_id, p.display_name, p.player_type, r.username, r.password_hash
       FROM players p JOIN registered_users r ON r.player_id = p.player_id
       WHERE r.username = ? OR r.email = ?`,
      [login, login]
    );
    return rows[0] || null;
  }

  module.exports = { findRegisteredByLogin };
  ```
- **Controller pattern:**
  ```js
  // controllers/friendController.js — friend requests and friend list
  const friendModel = require('../models/friendModel');
  const playerModel = require('../models/playerModel');
  const httpError = require('../utils/httpError');

  async function sendRequest(req, res) {
    const { username } = req.body || {};
    if (!username) throw httpError(400, 'username is required');
    const target = await playerModel.findRegisteredByUsername(username);
    if (!target) throw httpError(404, 'User not found');
    if (target.player_id === req.user.player_id) throw httpError(400, 'You cannot add yourself');
    const request = await friendModel.createRequest(req.user.player_id, target.player_id);
    res.status(201).json({ success: true, data: request });
  }

  module.exports = { sendRequest };
  ```
- **Transactions:** `withTransaction(async (conn) => { ...; return value; })` commits on success and rolls back on any throw.
- **Socket handlers** use one small `on(socket, event, handler)` wrapper that calls the ack with `{ success, data }` or `{ success: false, message }`.
- **Every `setTimeout` callback in `gameManager` is wrapped in try/catch.** An error thrown there would otherwise crash Node (unhandled rejection).
- `console.log` is fine for an FYP. Log server start, match start/finish and 500 errors. Don't log every request.

---

## 11. Viva quick-change recipes

| Examiner asks | Where to change |
|---------------|-----------------|
| "Make the turn timer 15 seconds" | `UPDATE rule_sets SET turn_seconds = 15 ...` (and `seed.sql`) — no code |
| "Add a new game mode / rule set" | `INSERT INTO rule_sets ...` in `seed.sql` — no code |
| "Turn off capturing" / "no extra turn on six" | flip the flag in the `rule_sets` row |
| "Add a rule: three sixes = lose the turn" | `ALTER TABLE rule_sets ADD three_sixes_forfeit ...` + add a `six_count` column to `matches` + check it in `gameManager.rollDice` |
| "Change the safe cells" | `SAFE_CELLS` in `game/constants.js` |
| "Make the bot smarter / dumber" | weights in `scoreMove()` in `game/botAI.js` |
| "Bots should move faster" | `BOT_DELAY_MS` in `game/constants.js` |
| "Add a profile field (e.g. country)" | `ALTER TABLE players ADD country VARCHAR(50) NULL` → `schema.sql` → `playerModel` select/update → `userController.updateMe` |
| "Add a new endpoint" | model function → controller function → one line in the routes file |
| "Invitations expire after 5 minutes" | `INVITE_EXPIRY_MINUTES` in `game/constants.js` |
| "Room code with 4 characters" | `utils/roomCode.js` (and `CHAR(6)` in `schema.sql`) |
| "Tournament with 1v1 matches" | the creator sets `players_per_match: 2` (no code) |
| "Allow 32-player tournaments" | `TOURNAMENT_SIZES` in `game/constants.js` |
| "Give players 2 minutes in the lobby" | `TOURNAMENT_LOBBY_SECONDS` in `game/constants.js` |
| "Start a tournament match later" | the creator calls `PUT .../matches/:match_id/schedule` (no code) |
| "Who can invite to a tournament?" | `tournamentJoinController.invite` (creator or a participant, friends only) |
| "Show where the password is hashed" | `authController.register` → `bcrypt.hash(password, 10)` |
| "Show how you stop cheating" | dice are rolled in `gameManager.rollDice`, moves are checked against `ludoEngine.getValidMoves` |

---

## 12. Gotchas

- **MySQL on this PC comes from Laragon:** MySQL 8.4.3 at `C:\laragon\bin\mysql\mysql-8.4.3-winx64`, data in `C:\laragon\data\mysql-8.4`, user `root` with an empty password. Start it with Laragon → **Start All**. It takes about 2 minutes to become ready because the data folder holds many other projects' DBs. The CLI is `C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe -u root ludo_fyp`. Only ever touch the `ludo_fyp` database.
- **Don't kill node by image name** (`taskkill /IM node.exe`), because other Node apps may be running. Stop the dev server with Ctrl+C or by its own PID.
- The workspace path has spaces (`FYP - Ludo App`), so **quote paths** in shell commands.
- The **Android emulator** reaches the PC at `http://10.0.2.2:3000`, not `localhost`. A **real phone** needs the PC's LAN IP (from `ipconfig`), the same Wi-Fi, and Node allowed through Windows Firewall.
- `MATCH` is reserved in MySQL, so the table is `matches`. Don't name anything `match` in SQL.
- `mysql2` `query()` returns `[rows, fields]`, so destructure with `const [rows] = ...`. For INSERT, read `result.insertId` from `const [result] = ...`.
- Set `multipleStatements: true` **only** in `database/reset.js`, never in the app pool, because it would make SQL injection worse.
- MySQL won't accept a CHECK constraint on a column that has an `ON DELETE CASCADE/SET NULL` FK, which is why `match_players` FKs have no actions.
- **Circular requires:** `gameManager` needs `io` and the socket handlers need `gameManager`. That's why `io` lives in `sockets/io.js`, which requires nothing. `gameManager → tournamentManager → gameManager` is also circular, so require `tournamentManager` **inside** the function that uses it (with a comment).
- `node --env-file=.env` stops with an error if `.env` is missing, so copy `.env.example` first.
- XAMPP's MariaDB works too (needs 10.2+ for CHECK). The schema avoids MySQL-8-only features.
- Turn timers live in memory. After a restart, `match:join` re-arms them through `ensureTimer()`.

---

## 13. Scope

**In scope:** everything in the ERD and the working-flow PDF (guest/registered auth, friends, bot/online/room/tournament matches, rule sets, 2v2 teams, bots, tokens, moves, captures, rankings, stats).

**Out of scope (don't build unless asked):** chat, coins/payments, push notifications (FCM), email verification and password reset, admin panel UI, spectators, forfeit/kick for disconnecting, upgrading a guest to a registered account, Redis, Docker, microservices, rate limiting. These can be listed as "future work" in the report.

---

## 14. Build status

Phases are described in [BACKEND_PLAN.md §7](BACKEND_PLAN.md#7-build-phases).

- [x] Phase 0 — Project setup + health route (2026-11-05)
- [x] Phase 1 — Database (schema, seed, reset script, db.js) (now 19 tables, 30 FKs = 24 relationships + 6 subtype links)
- [x] Phase 2 — Auth (guest, register, login, middleware)
- [x] Phase 3 — Users + friends
- [x] Phase 4 — Ludo engine + unit tests (18 tests)
- [x] Phase 5 — Match setup + rule sets + bot match REST
- [x] Phase 6 — Gameplay over Socket.IO (turns, timer, bots, finish, stats)
- [x] Phase 7 — Rooms + invitations
- [x] Phase 8 — Online matchmaking
- [x] Phase 9 — Tournaments
- [x] Phase 10 — Postman collection + README (2026-11-05: all phases verified by an end-to-end run, 99/99 checks)

- [x] Phase 11 — **Full tournament module** (2026-11-05): creator, edit, invitations, scheduled matches, lobby early start, creator match controls, cancel, scheduler, tournaments_won. Verified by an 82-check tournament journey run.

Decisions made while building (they differ from the first plan):
- Tournaments have a **creator** (no admin key any more). They start at `start_time` or when the creator presses Start, **not** automatically when full.
- Tournament rounds use `ludoEngine.makeTournamentGroups`, which never gives byes. 1v1: the odd player out joins a pair, making a 3-player match. 4-player: balanced groups (5 → 3+2).
- `POST /rooms/join` and accepting an invitation are **safe to repeat**: if you already have a seat, you get your seat back instead of a 409.
- The `queue:join` ack returns `{ queue_key, matched, match_id }`.
