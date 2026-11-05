// Holds the Socket.IO server so any file can emit events.
// It requires nothing, which avoids circular imports (gameManager <-> socket handlers).
let io = null;

module.exports = {
  setIO: (instance) => {
    io = instance;
  },
  getIO: () => io,
};
