// Registers a socket event and answers through the ack callback:
// success → { success: true, data }, error → { success: false, message } (same shape as the REST API).
function on(socket, event, handler) {
  socket.on(event, async (data, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      reply({ success: true, data: await handler(data || {}) });
    } catch (err) {
      if (!err.status) console.error(`[socket ${event}]`, err);
      reply({ success: false, message: err.status ? err.message : 'Server error' });
    }
  });
}

module.exports = on;
