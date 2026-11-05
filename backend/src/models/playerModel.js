// SQL for players and its two subtypes: guest_users and registered_users.
const { pool } = require('../config/db');

// Columns that are safe to send to the app (never password_hash).
const PUBLIC_COLUMNS = `p.player_id, p.display_name, p.avatar, p.player_type,
  r.username, r.email, r.games_played, r.games_won`;

async function findById(playerId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM players p LEFT JOIN registered_users r ON r.player_id = p.player_id
     WHERE p.player_id = ?`,
    [playerId]
  );
  return rows[0] || null;
}

// Guest = players row + guest_users row (call inside a transaction).
async function createGuest(displayName, deviceId, conn = pool) {
  const [result] = await conn.query(
    "INSERT INTO players (display_name, player_type) VALUES (?, 'guest')",
    [displayName]
  );
  await conn.query('INSERT INTO guest_users (player_id, device_id) VALUES (?, ?)', [result.insertId, deviceId]);
  return result.insertId;
}

async function findGuestByDevice(deviceId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT p.player_id, p.display_name, p.avatar, p.player_type
     FROM guest_users g JOIN players p ON p.player_id = g.player_id
     WHERE g.device_id = ?`,
    [deviceId]
  );
  return rows[0] || null;
}

// Registered user = players row + registered_users row (call inside a transaction).
async function createRegistered({ display_name, username, email, password_hash }, conn = pool) {
  const [result] = await conn.query(
    "INSERT INTO players (display_name, player_type) VALUES (?, 'registered')",
    [display_name]
  );
  await conn.query(
    'INSERT INTO registered_users (player_id, username, email, password_hash) VALUES (?, ?, ?, ?)',
    [result.insertId, username, email, password_hash]
  );
  return result.insertId;
}

// Used only by login: this is the one query that returns password_hash.
async function findRegisteredByLogin(login, conn = pool) {
  const [rows] = await conn.query(
    `SELECT p.player_id, p.display_name, p.avatar, p.player_type, r.username, r.password_hash
     FROM players p JOIN registered_users r ON r.player_id = p.player_id
     WHERE r.username = ? OR r.email = ?`,
    [login, login]
  );
  return rows[0] || null;
}

async function findRegisteredByUsername(username, conn = pool) {
  const [rows] = await conn.query(
    `SELECT p.player_id, p.display_name, p.avatar, r.username
     FROM players p JOIN registered_users r ON r.player_id = p.player_id
     WHERE r.username = ?`,
    [username]
  );
  return rows[0] || null;
}

async function findUsernameOrEmail(username, email, conn = pool) {
  const [rows] = await conn.query(
    'SELECT username, email FROM registered_users WHERE username = ? OR email = ?',
    [username, email]
  );
  return rows;
}

// Only changes the fields that were sent (NULL keeps the old value).
async function updateProfile(playerId, { display_name, avatar }, conn = pool) {
  await conn.query(
    'UPDATE players SET display_name = COALESCE(?, display_name), avatar = COALESCE(?, avatar) WHERE player_id = ?',
    [display_name ?? null, avatar ?? null, playerId]
  );
}

// Registered users whose username starts with the search text.
async function searchRegistered(text, excludePlayerId, conn = pool) {
  const escaped = text.replace(/[\\%_]/g, '\\$&'); // treat % and _ as normal characters
  const [rows] = await conn.query(
    `SELECT p.player_id, r.username, p.display_name, p.avatar
     FROM registered_users r JOIN players p ON p.player_id = r.player_id
     WHERE r.username LIKE CONCAT(?, '%') AND r.player_id <> ?
     ORDER BY r.username LIMIT 20`,
    [escaped, excludePlayerId]
  );
  return rows;
}

async function leaderboard(conn = pool) {
  const [rows] = await conn.query(
    `SELECT p.player_id, r.username, p.display_name, p.avatar, r.games_played, r.games_won
     FROM registered_users r JOIN players p ON p.player_id = r.player_id
     ORDER BY r.games_won DESC, r.games_played ASC, r.username ASC
     LIMIT 20`
  );
  return rows;
}

// Called when a match ends: +1 game played, and +1 win for the winner.
async function addGameResult(playerId, won, conn = pool) {
  await conn.query(
    'UPDATE registered_users SET games_played = games_played + 1, games_won = games_won + ? WHERE player_id = ?',
    [won ? 1 : 0, playerId]
  );
}

module.exports = {
  findById,
  createGuest,
  findGuestByDevice,
  createRegistered,
  findRegisteredByLogin,
  findRegisteredByUsername,
  findUsernameOrEmail,
  updateProfile,
  searchRegistered,
  leaderboard,
  addGameResult,
};
