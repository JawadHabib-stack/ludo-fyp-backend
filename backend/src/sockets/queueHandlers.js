// Online matchmaking: players wait in an in-memory queue until enough have joined, then a match is created.
const C = require('../game/constants');
const matchSetup = require('../game/matchSetup');
const gameManager = require('../game/gameManager');
const httpError = require('../utils/httpError');
const on = require('./on');

// queue_key -> waiting entries { player_id, socket_id } in join order
const queues = { ffa2: [], ffa4: [], '2v2': [] };

function removeWhere(test) {
  for (const key of Object.keys(queues)) queues[key] = queues[key].filter((e) => !test(e));
}

function broadcastWaiting(io, key) {
  for (const e of queues[key]) {
    io.to(`player:${e.player_id}`).emit('queue:waiting', { queue_key: key, waiting: queues[key].length, needed: C.QUEUES[key].players });
  }
}

// If enough players are waiting, take them out of the queue and start an online match.
async function tryMatch(io, key) {
  const { players, game_mode } = C.QUEUES[key];
  if (queues[key].length < players) return null;

  const entries = queues[key].splice(0, players);
  const playerIds = entries.map((e) => e.player_id);
  let matchId;
  try {
    matchId = await matchSetup.setupAndStart({
      match_type: 'online',
      rule_set_id: C.ONLINE_RULE_SET_ID,
      game_mode,
      max_players: players,
      player_ids: playerIds,
      subtype: { queue_key: key },
      fill_with_bots: false,
    });
  } catch (err) {
    // Creating the match failed: put the players back at the front (unless they already re-joined).
    const back = entries.filter((e) => !queues[key].some((q) => q.player_id === e.player_id));
    queues[key].unshift(...back);
    throw err;
  }

  // The match exists now. Tell the players first; if startMatch fails, match:join restarts the turn timer.
  for (const id of playerIds) io.to(`player:${id}`).emit('queue:matched', { match_id: matchId });
  await gameManager.startMatch(matchId);
  return matchId;
}

module.exports = function registerQueueHandlers(io, socket) {
  const playerId = socket.user.player_id;

  on(socket, 'queue:join', async ({ queue_key }) => {
    if (!C.QUEUES[queue_key]) throw httpError(400, 'queue_key must be ffa2, ffa4 or 2v2');
    removeWhere((e) => e.player_id === playerId); // a player can only wait in one queue
    queues[queue_key].push({ player_id: playerId, socket_id: socket.id });
    broadcastWaiting(io, queue_key);
    const matchId = await tryMatch(io, queue_key);
    return { queue_key, matched: !!matchId, match_id: matchId };
  });

  on(socket, 'queue:leave', async () => {
    removeWhere((e) => e.player_id === playerId);
    return { left: true };
  });

  // Only remove the entry made by THIS socket: after a reconnect, the new socket's entry must stay.
  socket.on('disconnect', () => removeWhere((e) => e.socket_id === socket.id));
};
