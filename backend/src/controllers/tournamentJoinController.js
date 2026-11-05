// Joining tournaments: register, withdraw, invite friends, and answer invitations.
const { withTransaction } = require('../config/db');
const tournamentModel = require('../models/tournamentModel');
const inviteModel = require('../models/tournamentInviteModel');
const friendModel = require('../models/friendModel');
const playerModel = require('../models/playerModel');
const tournamentManager = require('../game/tournamentManager');
const httpError = require('../utils/httpError');
const { toId, oneOf } = require('../utils/validate');

// Adds a player inside a transaction, with the tournament row locked (so it can't start or fill up meanwhile).
async function addPlayerLocked(conn, tournamentId, playerId) {
  const t = await tournamentModel.lockById(tournamentId, conn);
  if (!t) throw httpError(404, 'Tournament not found');
  if (t.status !== 'registration') throw httpError(409, 'Registration is closed');
  if (await tournamentModel.findParticipant(tournamentId, playerId, conn)) return null; // already in
  if ((await tournamentModel.countParticipants(tournamentId, conn)) >= t.max_participants) {
    throw httpError(409, 'Tournament is full');
  }
  return tournamentModel.addParticipant(tournamentId, playerId, conn);
}

// POST /api/tournaments/:tournament_id/register — join an open tournament
async function register(req, res) {
  const tournamentId = toId(req.params.tournament_id, 'tournament_id');
  const participant = await withTransaction((conn) => addPlayerLocked(conn, tournamentId, req.user.player_id));
  if (!participant) throw httpError(409, 'You are already registered');

  await tournamentManager.notifyMembers(tournamentId, 'player_joined', { player_id: req.user.player_id });
  res.status(201).json({ success: true, data: participant });
}

// DELETE /api/tournaments/:tournament_id/register — leave before the tournament starts
async function withdraw(req, res) {
  const tournamentId = toId(req.params.tournament_id, 'tournament_id');
  await withTransaction(async (conn) => {
    const t = await tournamentModel.lockById(tournamentId, conn);
    if (!t) throw httpError(404, 'Tournament not found');
    if (t.status !== 'registration') throw httpError(409, 'You can only leave before the tournament starts');
    if (!(await tournamentModel.removeParticipant(tournamentId, req.user.player_id, conn))) {
      throw httpError(404, 'You are not registered');
    }
  });

  await tournamentManager.notifyMembers(tournamentId, 'player_left', { player_id: req.user.player_id });
  res.json({ success: true, data: { withdrawn: true } });
}

// POST /api/tournaments/:tournament_id/invitations  { receiver_id }
// The creator or any participant can invite one of their friends.
async function invite(req, res) {
  const tournamentId = toId(req.params.tournament_id, 'tournament_id');
  const receiverId = toId((req.body || {}).receiver_id, 'receiver_id');
  const me = req.user.player_id;

  const t = await tournamentModel.findById(tournamentId);
  if (!t) throw httpError(404, 'Tournament not found');
  if (t.status !== 'registration') throw httpError(409, 'Registration is closed');
  const isMember = t.creator_id === me || (await tournamentModel.findParticipant(tournamentId, me));
  if (!isMember) throw httpError(403, 'Only the creator or a participant can invite');
  if (receiverId === me) throw httpError(400, 'You cannot invite yourself');
  if (!(await friendModel.areFriends(me, receiverId))) throw httpError(403, 'You can only invite friends');
  if (await tournamentModel.findParticipant(tournamentId, receiverId)) throw httpError(409, 'This friend already joined');
  if (await inviteModel.findPending(tournamentId, receiverId)) throw httpError(409, 'This friend already has a pending invitation');
  if (t.participant_count >= t.max_participants) throw httpError(409, 'Tournament is full');

  const invitation = await inviteModel.create({ tournament_id: tournamentId, sender_id: me, receiver_id: receiverId });
  const sender = await playerModel.findById(me);
  tournamentManager.notifyPlayers([receiverId], 'tournament:invited', {
    invitation_id: invitation.invitation_id,
    tournament_id: tournamentId,
    tournament_name: t.name,
    start_time: t.start_time,
    sender: { player_id: me, username: sender.username, display_name: sender.display_name },
  });
  res.status(201).json({ success: true, data: invitation });
}

// GET /api/tournaments/invitations — my pending tournament invitations
async function listInvitations(req, res) {
  res.json({ success: true, data: await inviteModel.listPendingForReceiver(req.user.player_id) });
}

// PUT /api/tournaments/invitations/:invitation_id  { action: "accept" | "decline" }
async function respondInvitation(req, res) {
  const invitationId = toId(req.params.invitation_id, 'invitation_id');
  const action = oneOf((req.body || {}).action, ['accept', 'decline'], 'action');

  const inv = await inviteModel.findById(invitationId);
  if (!inv) throw httpError(404, 'Invitation not found');
  if (inv.receiver_id !== req.user.player_id) throw httpError(403, 'This invitation is not for you');
  if (inv.status !== 'pending') throw httpError(409, `Invitation is already ${inv.status}`);

  if (action === 'decline') {
    await inviteModel.updateStatus(invitationId, 'declined');
    return res.json({ success: true, data: { invitation_id: invitationId, status: 'declined' } });
  }

  await withTransaction(async (conn) => {
    await addPlayerLocked(conn, inv.tournament_id, req.user.player_id); // 409 if closed or full
    await inviteModel.updateStatus(invitationId, 'accepted', conn);
  });
  await tournamentManager.notifyMembers(inv.tournament_id, 'player_joined', { player_id: req.user.player_id });
  res.json({ success: true, data: { invitation_id: invitationId, status: 'accepted', tournament_id: inv.tournament_id } });
}

module.exports = { register, withdraw, invite, listInvitations, respondInvitation };
