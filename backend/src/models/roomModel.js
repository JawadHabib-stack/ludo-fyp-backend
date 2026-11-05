// SQL for room_matches (custom rooms with a code) and room_invitations.
const { pool } = require('../config/db');

const ROOM_COLUMNS = `rm.match_id, rm.room_code, rm.host_id, m.status, m.max_players, m.game_mode, m.rule_set_id`;

async function findByCode(roomCode, conn = pool) {
  const [rows] = await conn.query(
    `SELECT ${ROOM_COLUMNS} FROM room_matches rm JOIN matches m ON m.match_id = rm.match_id WHERE rm.room_code = ?`,
    [roomCode]
  );
  return rows[0] || null;
}

async function findByMatchId(matchId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT ${ROOM_COLUMNS} FROM room_matches rm JOIN matches m ON m.match_id = rm.match_id WHERE rm.match_id = ?`,
    [matchId]
  );
  return rows[0] || null;
}

async function codeExists(roomCode, conn = pool) {
  const [rows] = await conn.query('SELECT 1 FROM room_matches WHERE room_code = ?', [roomCode]);
  return rows.length > 0;
}

// ---------- invitations ----------

async function createInvitation({ match_id, sender_id, receiver_id, minutes }, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO room_invitations (match_id, sender_id, receiver_id, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [match_id, sender_id, receiver_id, minutes]
  );
  return findInvitationById(result.insertId, conn);
}

// is_expired is worked out by MySQL (NOW()), so JS time zones don't matter.
async function findInvitationById(invitationId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT i.*, rm.room_code, (i.expires_at < NOW()) AS is_expired
     FROM room_invitations i JOIN room_matches rm ON rm.match_id = i.match_id
     WHERE i.invitation_id = ?`,
    [invitationId]
  );
  return rows[0] || null;
}

async function findPendingInvitation(matchId, receiverId, conn = pool) {
  const [rows] = await conn.query(
    "SELECT * FROM room_invitations WHERE match_id = ? AND receiver_id = ? AND status = 'pending'",
    [matchId, receiverId]
  );
  return rows[0] || null;
}

// Lazy expiry: old pending invitations are marked expired whenever invitations are read (no cron job).
async function expireOldInvitations(conn = pool) {
  await conn.query("UPDATE room_invitations SET status = 'expired' WHERE status = 'pending' AND expires_at < NOW()");
}

// When a room starts or is cancelled, its pending invitations can't be used any more.
async function expireRoomInvitations(matchId, conn = pool) {
  await conn.query("UPDATE room_invitations SET status = 'expired' WHERE match_id = ? AND status = 'pending'", [matchId]);
}

async function updateInvitationStatus(invitationId, status, conn = pool) {
  await conn.query('UPDATE room_invitations SET status = ? WHERE invitation_id = ?', [status, invitationId]);
}

async function listPendingForReceiver(receiverId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT i.invitation_id, i.match_id, rm.room_code, i.created_at, i.expires_at,
            i.sender_id, r.username AS sender_username, p.display_name AS sender_display_name
     FROM room_invitations i
     JOIN room_matches rm ON rm.match_id = i.match_id
     JOIN registered_users r ON r.player_id = i.sender_id
     JOIN players p ON p.player_id = i.sender_id
     WHERE i.receiver_id = ? AND i.status = 'pending'
     ORDER BY i.created_at DESC`,
    [receiverId]
  );
  return rows;
}

module.exports = {
  findByCode,
  findByMatchId,
  codeExists,
  createInvitation,
  findInvitationById,
  findPendingInvitation,
  expireOldInvitations,
  expireRoomInvitations,
  updateInvitationStatus,
  listPendingForReceiver,
};
