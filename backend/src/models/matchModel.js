// SQL for matches, its 4 subtype tables, teams and match_players (seats).
const { pool } = require('../config/db');

// ---------- matches + subtypes ----------

async function createMatch({ rule_set_id, match_type, game_mode, max_players }, conn = pool) {
  const [result] = await conn.query(
    'INSERT INTO matches (rule_set_id, match_type, game_mode, max_players) VALUES (?, ?, ?, ?)',
    [rule_set_id, match_type, game_mode, max_players]
  );
  return result.insertId;
}

// Inserts the subtype row (bot_matches / online_matches / room_matches / tournament_matches).
async function createSubtype(matchType, matchId, fields, conn = pool) {
  if (matchType === 'bot') {
    await conn.query('INSERT INTO bot_matches (match_id, difficulty) VALUES (?, ?)', [matchId, fields.difficulty]);
  } else if (matchType === 'online') {
    await conn.query('INSERT INTO online_matches (match_id, queue_key) VALUES (?, ?)', [matchId, fields.queue_key]);
  } else if (matchType === 'room') {
    await conn.query('INSERT INTO room_matches (match_id, host_id, room_code) VALUES (?, ?, ?)', [
      matchId, fields.host_id, fields.room_code,
    ]);
  } else if (matchType === 'tournament') {
    // scheduled_at = now + delay_seconds (worked out by MySQL)
    await conn.query(
      `INSERT INTO tournament_matches (match_id, tournament_id, round_no, match_no, scheduled_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [matchId, fields.tournament_id, fields.round_no, fields.match_no, fields.delay_seconds]
    );
  } else {
    throw new Error(`Unknown match_type "${matchType}"`);
  }
}

// Match row (+ room_code / host_id for rooms, + tournament info for tournament matches).
async function findById(matchId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT m.*, rm.room_code, rm.host_id,
            tm.tournament_id, tm.round_no, tm.match_no, tm.scheduled_at
     FROM matches m
     LEFT JOIN room_matches rm ON rm.match_id = m.match_id
     LEFT JOIN tournament_matches tm ON tm.match_id = m.match_id
     WHERE m.match_id = ?`,
    [matchId]
  );
  return rows[0] || null;
}

// Locks the match row until the transaction ends, so two moves can't happen at once.
async function lockById(matchId, conn) {
  const [rows] = await conn.query('SELECT * FROM matches WHERE match_id = ? FOR UPDATE', [matchId]);
  return rows[0] || null;
}

async function updateTurn(matchId, currentSeat, diceValue, conn = pool) {
  await conn.query('UPDATE matches SET current_seat = ?, dice_value = ? WHERE match_id = ?', [
    currentSeat, diceValue, matchId,
  ]);
}

async function startMatchRow(matchId, firstSeat, conn = pool) {
  await conn.query(
    "UPDATE matches SET status = 'in_progress', current_seat = ?, dice_value = NULL, started_at = NOW() WHERE match_id = ?",
    [firstSeat, matchId]
  );
}

async function finishMatchRow(matchId, conn = pool) {
  await conn.query(
    "UPDATE matches SET status = 'finished', ended_at = NOW(), current_seat = NULL, dice_value = NULL WHERE match_id = ?",
    [matchId]
  );
}

async function setStatus(matchId, status, conn = pool) {
  await conn.query('UPDATE matches SET status = ? WHERE match_id = ?', [status, matchId]);
}

// ---------- seats (match_players) + teams ----------

// Seats with a display name (player name or bot name) and team number.
async function listSeats(matchId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT mp.match_player_id, mp.seat_no, mp.color, mp.player_id, mp.bot_id, mp.finish_position,
            t.team_no, COALESCE(p.display_name, b.name) AS display_name,
            p.player_type, b.difficulty AS bot_difficulty
     FROM match_players mp
     LEFT JOIN players p ON p.player_id = mp.player_id
     LEFT JOIN bots b ON b.bot_id = mp.bot_id
     LEFT JOIN teams t ON t.team_id = mp.team_id
     WHERE mp.match_id = ?
     ORDER BY mp.seat_no`,
    [matchId]
  );
  return rows;
}

async function findSeatByPlayer(matchId, playerId, conn = pool) {
  const [rows] = await conn.query('SELECT * FROM match_players WHERE match_id = ? AND player_id = ?', [
    matchId, playerId,
  ]);
  return rows[0] || null;
}

async function addSeat({ match_id, seat_no, color, player_id = null, bot_id = null }, conn = pool) {
  const [result] = await conn.query(
    'INSERT INTO match_players (match_id, seat_no, color, player_id, bot_id) VALUES (?, ?, ?, ?, ?)',
    [match_id, seat_no, color, player_id, bot_id]
  );
  return result.insertId;
}

async function removeSeat(matchId, playerId, conn = pool) {
  await conn.query('DELETE FROM match_players WHERE match_id = ? AND player_id = ?', [matchId, playerId]);
}

async function setFinishPosition(matchPlayerId, position, conn = pool) {
  await conn.query('UPDATE match_players SET finish_position = ? WHERE match_player_id = ?', [position, matchPlayerId]);
}

async function createTeam(matchId, teamNo, conn = pool) {
  const [result] = await conn.query('INSERT INTO teams (match_id, team_no) VALUES (?, ?)', [matchId, teamNo]);
  return result.insertId;
}

async function setTeam(matchPlayerId, teamId, conn = pool) {
  await conn.query('UPDATE match_players SET team_id = ? WHERE match_player_id = ?', [teamId, matchPlayerId]);
}

// ---------- history ----------

async function listFinishedByPlayer(playerId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT m.match_id, m.match_type, m.game_mode, m.ended_at, mp.color, mp.finish_position
     FROM match_players mp JOIN matches m ON m.match_id = mp.match_id
     WHERE mp.player_id = ? AND m.status = 'finished'
     ORDER BY m.ended_at DESC, m.match_id DESC
     LIMIT 20`,
    [playerId]
  );
  return rows;
}

module.exports = {
  createMatch,
  createSubtype,
  findById,
  lockById,
  updateTurn,
  startMatchRow,
  finishMatchRow,
  setStatus,
  listSeats,
  findSeatByPlayer,
  addSeat,
  removeSeat,
  setFinishPosition,
  createTeam,
  setTeam,
  listFinishedByPlayer,
};
