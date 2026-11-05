// Profile update, match history, user search and leaderboard.
const playerModel = require('../models/playerModel');
const matchModel = require('../models/matchModel');
const httpError = require('../utils/httpError');

// PUT /api/users/me  { display_name?, avatar? }
async function updateMe(req, res) {
  const { display_name, avatar } = req.body || {};
  if (display_name !== undefined && (typeof display_name !== 'string' || !display_name.trim() || display_name.trim().length > 50)) {
    throw httpError(400, 'display_name must be 1-50 characters');
  }
  if (avatar !== undefined && (typeof avatar !== 'string' || avatar.length > 255)) {
    throw httpError(400, 'avatar must be text (max 255 characters)');
  }

  await playerModel.updateProfile(req.user.player_id, { display_name: display_name?.trim(), avatar });
  res.json({ success: true, data: await playerModel.findById(req.user.player_id) });
}

// GET /api/users/me/matches — last 20 finished matches
async function myMatches(req, res) {
  const matches = await matchModel.listFinishedByPlayer(req.user.player_id);
  res.json({ success: true, data: matches });
}

// GET /api/users/search?q=ali
async function search(req, res) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) throw httpError(400, 'q (search text) is required');
  const users = await playerModel.searchRegistered(q, req.user.player_id);
  res.json({ success: true, data: users });
}

// GET /api/users/leaderboard
async function leaderboard(req, res) {
  res.json({ success: true, data: await playerModel.leaderboard() });
}

module.exports = { updateMe, myMatches, search, leaderboard };
