// SQL for tournament_invitations (a creator or participant invites a friend to a tournament).
const { pool } = require('../config/db');

async function create({ tournament_id, sender_id, receiver_id }, conn = pool) {
  const [result] = await conn.query(
    'INSERT INTO tournament_invitations (tournament_id, sender_id, receiver_id) VALUES (?, ?, ?)',
    [tournament_id, sender_id, receiver_id]
  );
  return findById(result.insertId, conn);
}

async function findById(invitationId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT i.*, t.name AS tournament_name, t.status AS tournament_status
     FROM tournament_invitations i JOIN tournaments t ON t.tournament_id = i.tournament_id
     WHERE i.invitation_id = ?`,
    [invitationId]
  );
  return rows[0] || null;
}

async function findPending(tournamentId, receiverId, conn = pool) {
  const [rows] = await conn.query(
    "SELECT * FROM tournament_invitations WHERE tournament_id = ? AND receiver_id = ? AND status = 'pending'",
    [tournamentId, receiverId]
  );
  return rows[0] || null;
}

// My pending invitations, with tournament info and who invited me.
async function listPendingForReceiver(receiverId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT i.invitation_id, i.tournament_id, t.name AS tournament_name, t.start_time,
            t.max_participants, t.players_per_match, i.created_at,
            i.sender_id, r.username AS sender_username, p.display_name AS sender_display_name
     FROM tournament_invitations i
     JOIN tournaments t ON t.tournament_id = i.tournament_id
     JOIN registered_users r ON r.player_id = i.sender_id
     JOIN players p ON p.player_id = i.sender_id
     WHERE i.receiver_id = ? AND i.status = 'pending'
     ORDER BY i.created_at DESC`,
    [receiverId]
  );
  return rows;
}

async function updateStatus(invitationId, status, conn = pool) {
  await conn.query('UPDATE tournament_invitations SET status = ? WHERE invitation_id = ?', [status, invitationId]);
}

// When a tournament starts or is cancelled, its open invitations can't be used any more.
async function expireForTournament(tournamentId, conn = pool) {
  await conn.query(
    "UPDATE tournament_invitations SET status = 'expired' WHERE tournament_id = ? AND status = 'pending'",
    [tournamentId]
  );
}

module.exports = { create, findById, findPending, listPendingForReceiver, updateStatus, expireForTournament };
