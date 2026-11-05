// Creates the Socket.IO server, checks the JWT of every connection and registers the event handlers.
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { setIO } = require('./io');
const registerGameHandlers = require('./gameHandlers');
const registerQueueHandlers = require('./queueHandlers');

function initSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: '*' } });
  setIO(io);

  // Token from io(url, { auth: { token } }) or from an "Authorization: Bearer" header (handy for Postman).
  io.use((socket, next) => {
    const header = socket.handshake.headers.authorization || '';
    const token = socket.handshake.auth?.token || (header.startsWith('Bearer ') ? header.slice(7) : null);
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET); // { player_id, player_type }
      socket.data.player_id = socket.user.player_id; // socket.data is readable via fetchSockets() (lobby presence)
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // Personal room for notifications: invitations, queue matched, tournament match ready.
    socket.join(`player:${socket.user.player_id}`);
    registerGameHandlers(io, socket);
    registerQueueHandlers(io, socket);
  });

  return io;
}

module.exports = { initSocket };
