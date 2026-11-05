// SQL for friendships (friend requests and friend list). Only registered users take part.
const { pool } = require('../config/db');

async function findById(friendshipId, conn = pool) {
  const [rows] = await conn.query('SELECT * FROM friendships WHERE friendship_id = ?', [friendshipId]);
  return rows[0] || null;
}

// All rows between two players, in either direction (A→B or B→A).
async function findBetween(a, b, conn = pool) {
  const [rows] = await conn.query(
    `SELECT * FROM friendships
     WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    [a, b, b, a]
  );
  return rows;
}

async function areFriends(a, b, conn = pool) {
  const rows = await findBetween(a, b, conn);
  return rows.some((row) => row.status === 'accepted');
}

async function createRequest(requesterId, addresseeId, conn = pool) {
  const [result] = await conn.query(
    'INSERT INTO friendships (requester_id, addressee_id) VALUES (?, ?)',
    [requesterId, addresseeId]
  );
  return findById(result.insertId, conn);
}

async function updateStatus(friendshipId, status, conn = pool) {
  await conn.query('UPDATE friendships SET status = ? WHERE friendship_id = ?', [status, friendshipId]);
}

async function deleteById(friendshipId, conn = pool) {
  await conn.query('DELETE FROM friendships WHERE friendship_id = ?', [friendshipId]);
}

// Accepted friends of a player, showing the OTHER person of each friendship.
async function listFriends(playerId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT f.friendship_id, r.player_id, r.username, p.display_name, p.avatar
     FROM friendships f
     JOIN registered_users r ON r.player_id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
     JOIN players p ON p.player_id = r.player_id
     WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
     ORDER BY r.username`,
    [playerId, playerId, playerId]
  );
  return rows;
}

// Pending requests other people sent to me.
async function listReceived(playerId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT f.friendship_id, f.created_at, r.player_id, r.username, p.display_name, p.avatar
     FROM friendships f
     JOIN registered_users r ON r.player_id = f.requester_id
     JOIN players p ON p.player_id = r.player_id
     WHERE f.addressee_id = ? AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [playerId]
  );
  return rows;
}

// Pending requests I sent to other people.
async function listSent(playerId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT f.friendship_id, f.created_at, r.player_id, r.username, p.display_name, p.avatar
     FROM friendships f
     JOIN registered_users r ON r.player_id = f.addressee_id
     JOIN players p ON p.player_id = r.player_id
     WHERE f.requester_id = ? AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [playerId]
  );
  return rows;
}

module.exports = {
  findById,
  findBetween,
  areFriends,
  createRequest,
  updateStatus,
  deleteById,
  listFriends,
  listReceived,
  listSent,
};
