// Entry point: HTTP server + Socket.IO + the tournament scheduler
// (every few seconds it starts tournaments at start_time and tournament matches at scheduled_at).
const http = require('http');
const app = require('./app');
const { initSocket } = require('./sockets');
const tournamentManager = require('./game/tournamentManager');
const { TOURNAMENT_TICK_MS } = require('./game/constants');

const server = http.createServer(app);
initSocket(server);

setInterval(() => {
  tournamentManager.tick().catch((err) => console.error('Tournament scheduler failed:', err));
}, TOURNAMENT_TICK_MS);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ludo backend running on http://localhost:${PORT}`));
