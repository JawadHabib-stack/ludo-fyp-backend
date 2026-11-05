// Bot match creation, match state and move history.
const matchModel = require('../models/matchModel');
const tokenModel = require('../models/tokenModel');
const ruleSetModel = require('../models/ruleSetModel');
const matchSetup = require('../game/matchSetup');
const gameManager = require('../game/gameManager');
const httpError = require('../utils/httpError');
const { toId, oneOf } = require('../utils/validate');

// POST /api/matches/bot  { rule_set_id, total_players, game_mode, difficulty }
// The human sits in seat 1, bots fill the other seats.
async function createBotMatch(req, res) {
  const body = req.body || {};
  const ruleSetId = toId(body.rule_set_id ?? 1, 'rule_set_id');
  const totalPlayers = oneOf(Number(body.total_players ?? 4), [2, 3, 4], 'total_players');
  const gameMode = oneOf(body.game_mode ?? 'ffa', ['ffa', '2v2'], 'game_mode');
  const difficulty = oneOf(body.difficulty ?? 'easy', ['easy', 'hard'], 'difficulty');
  if (gameMode === '2v2' && totalPlayers !== 4) throw httpError(400, '2v2 needs total_players = 4');
  if (!(await ruleSetModel.findById(ruleSetId))) throw httpError(404, 'Rule set not found');

  const matchId = await matchSetup.setupAndStart({
    match_type: 'bot',
    rule_set_id: ruleSetId,
    game_mode: gameMode,
    max_players: totalPlayers,
    player_ids: [req.user.player_id],
    subtype: { difficulty },
    fill_with_bots: true,
    difficulty,
  });
  await gameManager.startMatch(matchId);

  res.status(201).json({ success: true, data: { match_id: matchId } });
}

// Only players with a seat may read a match (it contains the private room_code of rooms).
async function requireSeat(req) {
  const matchId = toId(req.params.match_id, 'match_id');
  if (!(await matchModel.findById(matchId))) throw httpError(404, 'Match not found');
  if (!(await matchModel.findSeatByPlayer(matchId, req.user.player_id))) {
    throw httpError(403, 'You are not in this match');
  }
  return matchId;
}

// GET /api/matches/:match_id
async function getMatch(req, res) {
  const matchId = await requireSeat(req);
  res.json({ success: true, data: await gameManager.getState(matchId) });
}

// GET /api/matches/:match_id/moves
async function getMoves(req, res) {
  const matchId = await requireSeat(req);
  res.json({ success: true, data: await tokenModel.listMovesByMatch(matchId) });
}

module.exports = { createBotMatch, getMatch, getMoves };
