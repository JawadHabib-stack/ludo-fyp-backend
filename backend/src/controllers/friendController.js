// Friend list, friend requests (send / accept / reject) and removing friends.
const friendModel = require('../models/friendModel');
const playerModel = require('../models/playerModel');
const httpError = require('../utils/httpError');
const { toId, oneOf } = require('../utils/validate');

// GET /api/friends
async function listFriends(req, res) {
  const friends = await friendModel.listFriends(req.user.player_id);
  res.json({ success: true, data: friends });
}

// GET /api/friends/requests
async function listRequests(req, res) {
  const received = await friendModel.listReceived(req.user.player_id);
  const sent = await friendModel.listSent(req.user.player_id);
  res.json({ success: true, data: { received, sent } });
}

// POST /api/friends/requests  { username }
async function sendRequest(req, res) {
  const { username } = req.body || {};
  if (typeof username !== 'string' || !username.trim()) throw httpError(400, 'username is required');

  const target = await playerModel.findRegisteredByUsername(username.trim());
  if (!target) throw httpError(404, 'User not found');
  const me = req.user.player_id;
  if (target.player_id === me) throw httpError(400, 'You cannot add yourself');

  const existing = await friendModel.findBetween(me, target.player_id);
  if (existing.some((f) => f.status === 'accepted')) throw httpError(409, 'You are already friends');
  if (existing.some((f) => f.status === 'pending' && f.requester_id === me)) {
    throw httpError(409, 'Request already sent');
  }
  if (existing.some((f) => f.status === 'pending')) {
    throw httpError(409, 'This user already sent you a request, accept it instead');
  }
  // An old rejected request is removed so the user can ask again.
  for (const f of existing) await friendModel.deleteById(f.friendship_id);

  const request = await friendModel.createRequest(me, target.player_id);
  res.status(201).json({ success: true, data: request });
}

// PUT /api/friends/requests/:friendship_id  { action: "accept" | "reject" }
async function respondToRequest(req, res) {
  const friendshipId = toId(req.params.friendship_id, 'friendship_id');
  const { action } = req.body || {};
  oneOf(action, ['accept', 'reject'], 'action');

  const request = await friendModel.findById(friendshipId);
  if (!request) throw httpError(404, 'Request not found');
  if (request.addressee_id !== req.user.player_id) throw httpError(403, 'Only the receiver can answer this request');
  if (request.status !== 'pending') throw httpError(409, 'Request was already answered');

  await friendModel.updateStatus(friendshipId, action === 'accept' ? 'accepted' : 'rejected');
  res.json({ success: true, data: await friendModel.findById(friendshipId) });
}

// DELETE /api/friends/:player_id
async function removeFriend(req, res) {
  const otherId = toId(req.params.player_id, 'player_id');
  const rows = await friendModel.findBetween(req.user.player_id, otherId);
  const friendship = rows.find((f) => f.status === 'accepted');
  if (!friendship) throw httpError(404, 'You are not friends with this player');

  await friendModel.deleteById(friendship.friendship_id);
  res.json({ success: true, data: { removed: true } });
}

module.exports = { listFriends, listRequests, sendRequest, respondToRequest, removeFriend };
