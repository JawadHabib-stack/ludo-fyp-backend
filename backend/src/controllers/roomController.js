// Custom rooms: create, view, join by code, leave, start (host), invite friends, answer invitations.
const { withTransaction } = require('../config/db');
const roomModel = require('../models/roomModel');
const matchModel = require('../models/matchModel');
const ruleSetModel = require('../models/ruleSetModel');
const friendModel = require('../models/friendModel');
const playerModel = require('../models/playerModel');
const matchSetup = require('../game/matchSetup');
const gameManager = require('../game/gameManager');
const C = require('../game/constants');
const { getIO } = require('../sockets/io');
const { generateRoomCode } = require('../utils/roomCode');
const httpError = require('../utils/httpError');
const { toId, oneOf } = require('../utils/validate');

// Lobby info: room + rule set + seats.
async function roomInfo(room) {
  const rule_set = await ruleSetModel.findById(room.rule_set_id);
  const seats = await matchModel.listSeats(room.match_id);
  return { ...room, rule_set, seats };
}

// Tells everyone in the lobby (socket room match:<id>) that seats or status changed.
async function emitRoomUpdate(matchId) {
  const io = getIO();
  if (!io) return;
  const match = await matchModel.findById(matchId);
  const seats = await matchModel.listSeats(matchId);
  io.to(`match:${matchId}`).emit('room:updated', { match_id: matchId, status: match.status, seats });
}

async function findRoomOr404(matchIdValue) {
  const room = await roomModel.findByMatchId(toId(matchIdValue, 'match_id'));
  if (!room) throw httpError(404, 'Room not found');
  return room;
}

// POST /api/rooms  { rule_set_id, max_players, game_mode }
async function createRoom(req, res) {
  const body = req.body || {};
  const ruleSetId = toId(body.rule_set_id ?? 1, 'rule_set_id');
  const maxPlayers = oneOf(Number(body.max_players ?? 4), [2, 3, 4], 'max_players');
  const gameMode = oneOf(body.game_mode ?? 'ffa', ['ffa', '2v2'], 'game_mode');
  if (gameMode === '2v2' && maxPlayers !== 4) throw httpError(400, '2v2 needs max_players = 4');
  if (!(await ruleSetModel.findById(ruleSetId))) throw httpError(404, 'Rule set not found');

  const result = await withTransaction(async (conn) => {
    let roomCode = generateRoomCode();
    while (await roomModel.codeExists(roomCode, conn)) roomCode = generateRoomCode();

    const matchId = await matchSetup.createMatch(conn, {
      match_type: 'room',
      rule_set_id: ruleSetId,
      game_mode: gameMode,
      max_players: maxPlayers,
      subtype: { host_id: req.user.player_id, room_code: roomCode },
    });
    await matchSetup.addHumanSeat(conn, matchId, req.user.player_id); // host takes the first seat
    return { match_id: matchId, room_code: roomCode };
  });

  res.status(201).json({ success: true, data: result });
}

// GET /api/rooms/code/:room_code
async function getRoom(req, res) {
  const room = await roomModel.findByCode(String(req.params.room_code).toUpperCase());
  if (!room) throw httpError(404, 'Room not found');
  res.json({ success: true, data: await roomInfo(room) });
}

// POST /api/rooms/join  { room_code } — guests can join too.
async function joinRoom(req, res) {
  const { room_code } = req.body || {};
  if (typeof room_code !== 'string' || !room_code.trim()) throw httpError(400, 'room_code is required');
  const room = await roomModel.findByCode(room_code.trim().toUpperCase());
  if (!room) throw httpError(404, 'Room not found');
  if (room.status === 'cancelled') throw httpError(409, 'This room was closed by the host');

  const seatNo = await withTransaction((conn) => matchSetup.addHumanSeat(conn, room.match_id, req.user.player_id));
  await emitRoomUpdate(room.match_id);
  res.json({ success: true, data: { match_id: room.match_id, room_code: room.room_code, seat_no: seatNo } });
}

// POST /api/rooms/:match_id/leave — if the host leaves, the room is cancelled.
async function leaveRoom(req, res) {
  const room = await findRoomOr404(req.params.match_id);
  const me = req.user.player_id;

  const cancelled = room.host_id === me;
  await withTransaction(async (conn) => {
    // Lock + re-check inside the transaction, so a "start" at the same moment can't be undone.
    const match = await matchModel.lockById(room.match_id, conn);
    if (match.status !== 'waiting') throw httpError(409, 'Match already started');
    if (!(await matchModel.findSeatByPlayer(room.match_id, me, conn))) throw httpError(404, 'You are not in this room');

    if (cancelled) {
      await matchModel.setStatus(room.match_id, 'cancelled', conn);
      await roomModel.expireRoomInvitations(room.match_id, conn);
    } else {
      await matchModel.removeSeat(room.match_id, me, conn);
    }
  });

  await emitRoomUpdate(room.match_id);
  res.json({ success: true, data: { left: true, room_cancelled: cancelled } });
}

// POST /api/rooms/:match_id/start  { fill_with_bots } — host only.
async function startRoom(req, res) {
  const room = await findRoomOr404(req.params.match_id);
  if (room.host_id !== req.user.player_id) throw httpError(403, 'Only the host can start the room');
  const fillWithBots = (req.body || {}).fill_with_bots !== false; // default: true

  await withTransaction(async (conn) => {
    await matchSetup.prepareForStart(conn, room.match_id, { fill_with_bots: fillWithBots, difficulty: 'easy' });
    await roomModel.expireRoomInvitations(room.match_id, conn);
  });
  await gameManager.startMatch(room.match_id);
  res.json({ success: true, data: { match_id: room.match_id } });
}

// POST /api/rooms/:match_id/invitations  { receiver_id } — host invites a friend.
async function invite(req, res) {
  const room = await findRoomOr404(req.params.match_id);
  const me = req.user.player_id;
  const receiverId = toId((req.body || {}).receiver_id, 'receiver_id');
  if (room.host_id !== me) throw httpError(403, 'Only the host can send invitations');
  if (room.status !== 'waiting') throw httpError(409, 'Match already started');
  if (receiverId === me) throw httpError(400, 'You cannot invite yourself');
  if (!(await friendModel.areFriends(me, receiverId))) throw httpError(403, 'You can only invite friends');
  if (await matchModel.findSeatByPlayer(room.match_id, receiverId)) throw httpError(409, 'This friend is already in the room');

  await roomModel.expireOldInvitations();
  if (await roomModel.findPendingInvitation(room.match_id, receiverId)) {
    throw httpError(409, 'This friend already has a pending invitation');
  }

  const invitation = await roomModel.createInvitation({
    match_id: room.match_id,
    sender_id: me,
    receiver_id: receiverId,
    minutes: C.INVITE_EXPIRY_MINUTES,
  });

  const sender = await playerModel.findById(me);
  const io = getIO();
  if (io) {
    io.to(`player:${receiverId}`).emit('invite:received', {
      invitation_id: invitation.invitation_id,
      match_id: room.match_id,
      room_code: room.room_code,
      sender: { player_id: me, username: sender.username, display_name: sender.display_name },
    });
  }
  res.status(201).json({ success: true, data: invitation });
}

// GET /api/rooms/invitations — my pending invitations.
async function listInvitations(req, res) {
  await roomModel.expireOldInvitations();
  res.json({ success: true, data: await roomModel.listPendingForReceiver(req.user.player_id) });
}

// PUT /api/rooms/invitations/:invitation_id  { action: "accept" | "decline" }
async function respondInvitation(req, res) {
  const invitationId = toId(req.params.invitation_id, 'invitation_id');
  const action = oneOf((req.body || {}).action, ['accept', 'decline'], 'action');

  const inv = await roomModel.findInvitationById(invitationId);
  if (!inv) throw httpError(404, 'Invitation not found');
  if (inv.receiver_id !== req.user.player_id) throw httpError(403, 'This invitation is not for you');
  if (inv.status !== 'pending') throw httpError(409, `Invitation is already ${inv.status}`);
  if (inv.is_expired) {
    await roomModel.updateInvitationStatus(invitationId, 'expired');
    throw httpError(409, 'Invitation expired');
  }

  if (action === 'decline') {
    await roomModel.updateInvitationStatus(invitationId, 'declined');
    return res.json({ success: true, data: { invitation_id: invitationId, status: 'declined' } });
  }

  await withTransaction(async (conn) => {
    await matchSetup.addHumanSeat(conn, inv.match_id, req.user.player_id); // 409 if full or started
    await roomModel.updateInvitationStatus(invitationId, 'accepted', conn);
  });
  await emitRoomUpdate(inv.match_id);
  res.json({ success: true, data: { match_id: inv.match_id, room_code: inv.room_code } });
}

module.exports = { createRoom, getRoom, joinRoom, leaveRoom, startRoom, invite, listInvitations, respondInvitation };
