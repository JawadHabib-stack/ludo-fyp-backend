// Socket events for playing: match:join (also the lobby of rooms and tournament matches), game:roll, game:move.
const gameManager = require('../game/gameManager');
const tournamentManager = require('../game/tournamentManager');
const matchModel = require('../models/matchModel');
const httpError = require('../utils/httpError');
const { toId } = require('../utils/validate');
const on = require('./on');

module.exports = function registerGameHandlers(io, socket) {
  const playerId = socket.user.player_id;

  // Only players who have a seat in the match may join or play it.
  async function mySeat(matchIdValue) {
    const matchId = toId(matchIdValue, 'match_id');
    const seat = await matchModel.findSeatByPlayer(matchId, playerId);
    if (!seat) throw httpError(403, 'You are not in this match');
    return { matchId, seat };
  }

  on(socket, 'match:join', async ({ match_id }) => {
    const { matchId } = await mySeat(match_id);
    socket.join(`match:${matchId}`);
    await gameManager.ensureTimer(matchId);
    const state = await gameManager.getState(matchId);
    // Tournament lobby: tell everyone who is here; starts the match early if all players are present.
    if (state.match.match_type === 'tournament' && state.match.status === 'waiting') {
      await tournamentManager.onLobbyJoin(matchId);
    }
    return state;
  });

  on(socket, 'game:roll', async ({ match_id }) => {
    const { matchId, seat } = await mySeat(match_id);
    const result = await gameManager.rollDice(matchId, seat.seat_no);
    return { dice_value: result.dice_value, valid_token_ids: result.valid_token_ids };
  });

  on(socket, 'game:move', async ({ match_id, token_id }) => {
    const { matchId, seat } = await mySeat(match_id);
    return gameManager.moveToken(matchId, seat.seat_no, toId(token_id, 'token_id'));
  });
};
