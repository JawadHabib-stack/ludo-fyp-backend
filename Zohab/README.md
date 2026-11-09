# Ludo Arena — Next.js Web App

The same app as the React + Vite version in the parent folder (same screens, same design from `../design.html`,
same backend), built with **Next.js 16** (App Router, JavaScript).

On a computer the app is a phone-sized card in the middle of the page; on a phone (screen narrower than 520px) it fills the whole screen.

## Run

1. Start MySQL (Laragon → **Start All**).
2. Start the backend (in `ludo-fyp-backend/backend`): `npm run dev` → http://localhost:3000
3. Start this app:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3001 (port 3000 is the backend).

Demo logins: `demo1` … `demo4`, password `password123`.

How it reaches the backend:

- REST: the browser calls `/api/...` on this app and Next.js forwards it to the backend (`rewrites` in `next.config.mjs`).
  Set `BACKEND_URL` if the backend is not on `http://localhost:3000`.
- Socket.IO: the browser connects straight to port 3000 on the same computer as the page.
  Set `NEXT_PUBLIC_SOCKET_URL` (e.g. `http://192.168.1.5:3000`) to use another address.

Production: `npm run build` then `npm start` (also on port 3001).

## Pages (URLs)

| URL | Screen |
|-----|--------|
| `/` | Home: greeting, invitations bell, next tournament match, Play Online, game modes |
| `/play/bot` | vs Computer setup |
| `/play/create-room`, `/play/join` | create a private room, join one by code |
| `/play/queue/[key]` | online matchmaking (`ffa2`, `ffa4`, `2v2`) |
| `/match/[id]` | room lobby, tournament lobby, the game and the result |
| `/tournaments`, `/tournaments/new`, `/tournaments/[id]` | tournament list, create form, details + bracket |
| `/friends`, `/invites`, `/profile`, `/leaderboard` | friends, invitations, profile, top players |

## Code map

| File | What it does |
|------|--------------|
| `app/layout.js` | html, Roboto font, page title; wraps every page in `AppShell` |
| `app/**/page.js` | one small file per URL; it shows a screen from `screens/` |
| `components/AppShell.jsx` | app card, login state, live notifications (socket events) |
| `components/Shell.jsx` | page decoration (floating pawns), background glows, bottom tabs, notification toast |
| `components/ui.jsx` | buttons, inputs, chips, pills, avatar, pawn, logo, dice, bottom sheet, pop-up |
| `components/Board.jsx` | the 15 × 15 board and the pawns (your colour is always bottom-left) |
| `components/InviteSheet.jsx`, `components/Icons.jsx` | "Invite friends" sheet, line icons |
| `screens/*.jsx` | the screens (same as `src/pages` in the React version) |
| `lib/api.js` | `api()` for REST calls, the Socket.IO connection, `emit()` and `listen()` |
| `lib/lib.js` | Ludo colours, session context, `useGo()`, `useNow()`, `useRuleSets()`, time formatting |
| `app/globals.css` | all styles (same as the React version) |

## Next.js notes

- The login token is saved in the browser (localStorage), so the server can't pre-render the screens: it sends the
  splash screen and the browser takes over. Every `page.js` sets `export const instant = false` for this reason.
- Cache Components is on (the Next.js 16 default): pages you leave are kept alive but hidden, so going back is instant.
  Screens that open a bottom sheet close it when they are hidden (`useLayoutEffect` cleanup).
