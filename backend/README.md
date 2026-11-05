# Ludo FYP — Backend

Backend for the Online Multiplayer Ludo mobile game.
Node.js + Express 5 + Socket.IO + MySQL (raw SQL with `mysql2`).

Design, database schema and API reference: [../BACKEND_PLAN.md](../BACKEND_PLAN.md) · coding rules: [../CLAUDE.md](../CLAUDE.md)

## Setup (Windows)

1. **Start MySQL.** Open Laragon and click **Start All** (or start MySQL in XAMPP). Wait until MySQL is running.
   The default login is `root` with an empty password.
2. **Install packages:**
   ```bash
   cd backend
   npm install
   ```
3. **Create `.env`:** copy `.env.example` to `.env`, then set `JWT_SECRET` to a long random string.
   Change the `DB_*` values if your MySQL login is different. If another app already uses port 3000, set `PORT=3100`.
4. **Create the database** (19 tables + demo data):
   ```bash
   npm run db:reset
   ```
   > Warning: this deletes and recreates the `ludo_fyp` database. Other databases are not touched.
5. **Run the server:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000/api/health and you should see `{"success":true,"data":{"status":"ok","db":"ok"}}`.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | start with auto-reload |
| `npm start` | start normally |
| `npm test` | run the Ludo engine unit tests (20 tests) |
| `npm run db:reset` | rebuild the database from `database/schema.sql` + `seed.sql` + demo users |

## Demo data

- **Users:** `demo1`, `demo2`, `demo3`, `demo4`, all with password `password123`. demo1 is friends with demo2 and demo3.
- **Rule sets:** 1 Classic, 2 Quick (2 tokens home wins), 3 **Demo** (1 token home wins, 10 s timer, good for a quick viva demo).
- **Bots:** 3 easy and 3 hard.
- **Tournament:** "Demo Cup", created by demo1 (already joined). 4 players, 1v1 knockout (semi-finals + final), Demo rules, 1-minute break between rounds, starts tomorrow. demo1 can press **Start** once at least 2 players have joined.

## Tournament in 1 minute

1. **Create:** `POST /api/tournaments`.
2. **Before the start:**
   - friends are invited (`POST /:id/invitations`) or join from the list (`POST /:id/register`)
   - the creator can edit, remove players or cancel
3. **Start:** at `start_time`, or early when the creator presses `POST /:id/start`. Round 1 matches are drawn and each gets a start time 1 minute ahead.
4. **Each match starts:**
   - at its time,
   - or as soon as all its players open the lobby (`match:join`),
   - or when the creator presses "start match now". The creator can also move the time.
5. **Next rounds:** winners advance, and the next round starts after the break. The last winner is the champion.

## Testing with Postman

1. Import [docs/ludo-api.postman_collection.json](docs/ludo-api.postman_collection.json).
2. Run **Auth → Login demo1**. The token is saved for every request after it. Log in as demo2–demo4 to act as the other players.
3. **Gameplay over Socket.IO:** in Postman choose *New → Socket.IO*, URL `http://localhost:3000`, and add the header `Authorization: Bearer <token>`. Turn on acknowledgements, then send:
   - `match:join` with `{ "match_id": 1 }`
   - `game:roll` with `{ "match_id": 1 }`
   - `game:move` with `{ "match_id": 1, "token_id": <one of valid_token_ids> }`

   Listen for `match:state`, `game:turn`, `game:rolled`, `game:moved` and `match:finished`.

**Quick self-playing demo:** create a bot match with `rule_set_id: 3` and don't make any moves. The 10-second turn timer plays your turns automatically, so the whole game runs to `match:finished` on its own.

## Connecting the mobile app

- Android emulator: `http://10.0.2.2:3000`
- Real phone: `http://<your PC's IP from ipconfig>:3000`. The phone must be on the same Wi-Fi, and Node must be allowed through Windows Firewall.
- Socket: `io(BASE_URL, { auth: { token } })` using `socket.io-client`.
