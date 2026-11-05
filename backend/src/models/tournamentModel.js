// SQL for tournaments, tournament_participants and tournament_matches.
const { pool } = require('../config/db');

// Tournament + participant count + creator name + rule set name (used by list, detail and "mine").
const TOURNAMENT_COLUMNS = `t.*, cr.username AS creator_username, rs.name AS rule_set_name,
  (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.tournament_id) AS participant_count`;
const TOURNAMENT_FROM = `tournaments t
  JOIN registered_users cr ON cr.player_id = t.creator_id
  JOIN rule_sets rs ON rs.rule_set_id = t.rule_set_id`;
const TOURNAMENT_SELECT = `SELECT ${TOURNAMENT_COLUMNS} FROM ${TOURNAMENT_FROM}`;

async function create(f, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO tournaments
       (creator_id, rule_set_id, name, description, max_participants, players_per_match, start_time, round_break_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [f.creator_id, f.rule_set_id, f.name, f.description, f.max_participants, f.players_per_match, f.start_time, f.round_break_minutes]
  );
  return result.insertId;
}

// Creator edits (only while registration is open). All fields are sent; the controller fills in unchanged ones.
async function updateDetails(tournamentId, f, conn = pool) {
  await conn.query(
    `UPDATE tournaments SET rule_set_id = ?, name = ?, description = ?, max_participants = ?,
            players_per_match = ?, start_time = ?, round_break_minutes = ?
     WHERE tournament_id = ?`,
    [f.rule_set_id, f.name, f.description, f.max_participants, f.players_per_match, f.start_time, f.round_break_minutes, tournamentId]
  );
}

async function listAll(status, conn = pool) {
  const where = status ? 'WHERE t.status = ?' : '';
  const [rows] = await conn.query(`${TOURNAMENT_SELECT} ${where} ORDER BY t.start_time, t.tournament_id`, status ? [status] : []);
  return rows;
}

async function findById(tournamentId, conn = pool) {
  const [rows] = await conn.query(`${TOURNAMENT_SELECT} WHERE t.tournament_id = ?`, [tournamentId]);
  return rows[0] || null;
}

// Tournaments I created or joined, with my part in each.
async function listMine(playerId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT ${TOURNAMENT_COLUMNS}, (t.creator_id = ?) AS is_creator, me.status AS my_status
     FROM ${TOURNAMENT_FROM}
     LEFT JOIN tournament_participants me ON me.tournament_id = t.tournament_id AND me.player_id = ?
     WHERE t.creator_id = ? OR me.player_id IS NOT NULL
     ORDER BY t.start_time DESC`,
    [playerId, playerId, playerId]
  );
  return rows;
}

// Locks the tournament row until the transaction ends (stops double start / double round).
async function lockById(tournamentId, conn) {
  const [rows] = await conn.query('SELECT * FROM tournaments WHERE tournament_id = ? FOR UPDATE', [tournamentId]);
  return rows[0] || null;
}

async function update(tournamentId, { status, current_round }, conn = pool) {
  await conn.query(
    'UPDATE tournaments SET status = COALESCE(?, status), current_round = COALESCE(?, current_round) WHERE tournament_id = ?',
    [status ?? null, current_round ?? null, tournamentId]
  );
}

// Tournaments still open for registration whose start time has passed.
async function listDue(conn = pool) {
  const [rows] = await conn.query(
    "SELECT tournament_id FROM tournaments WHERE status = 'registration' AND start_time <= NOW()"
  );
  return rows.map((r) => r.tournament_id);
}

// ---------- participants ----------

async function listParticipants(tournamentId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT tp.participant_id, tp.player_id, r.username, p.display_name, p.avatar,
            tp.status, tp.eliminated_round, tp.joined_at
     FROM tournament_participants tp
     JOIN registered_users r ON r.player_id = tp.player_id
     JOIN players p ON p.player_id = tp.player_id
     WHERE tp.tournament_id = ?
     ORDER BY tp.joined_at, tp.participant_id`,
    [tournamentId]
  );
  return rows;
}

async function countParticipants(tournamentId, conn = pool) {
  const [rows] = await conn.query('SELECT COUNT(*) AS n FROM tournament_participants WHERE tournament_id = ?', [tournamentId]);
  return rows[0].n;
}

async function findParticipant(tournamentId, playerId, conn = pool) {
  const [rows] = await conn.query(
    'SELECT * FROM tournament_participants WHERE tournament_id = ? AND player_id = ?',
    [tournamentId, playerId]
  );
  return rows[0] || null;
}

async function addParticipant(tournamentId, playerId, conn = pool) {
  await conn.query('INSERT INTO tournament_participants (tournament_id, player_id) VALUES (?, ?)', [tournamentId, playerId]);
  return findParticipant(tournamentId, playerId, conn);
}

async function removeParticipant(tournamentId, playerId, conn = pool) {
  const [result] = await conn.query(
    'DELETE FROM tournament_participants WHERE tournament_id = ? AND player_id = ?',
    [tournamentId, playerId]
  );
  return result.affectedRows;
}

async function listActivePlayerIds(tournamentId, conn = pool) {
  const [rows] = await conn.query(
    "SELECT player_id FROM tournament_participants WHERE tournament_id = ? AND status = 'active'",
    [tournamentId]
  );
  return rows.map((r) => r.player_id);
}

// Everyone who should hear about changes: all participants + the creator.
async function listMemberIds(tournamentId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT player_id FROM tournament_participants WHERE tournament_id = ?
     UNION SELECT creator_id FROM tournaments WHERE tournament_id = ?`,
    [tournamentId, tournamentId]
  );
  return rows.map((r) => r.player_id);
}

// Everyone who played in this round and did not finish 1st in their match is out.
async function eliminateRoundLosers(tournamentId, roundNo, conn = pool) {
  await conn.query(
    `UPDATE tournament_participants tp
     JOIN match_players mp ON mp.player_id = tp.player_id
     JOIN tournament_matches tm ON tm.match_id = mp.match_id
     SET tp.status = 'eliminated', tp.eliminated_round = ?
     WHERE tp.tournament_id = ? AND tm.tournament_id = ? AND tm.round_no = ?
       AND tp.status = 'active' AND (mp.finish_position IS NULL OR mp.finish_position <> 1)`,
    [roundNo, tournamentId, tournamentId, roundNo]
  );
}

// Champion: participant status + +1 tournament win on the profile.
async function setChampion(tournamentId, playerId, conn = pool) {
  await conn.query(
    "UPDATE tournament_participants SET status = 'champion' WHERE tournament_id = ? AND player_id = ?",
    [tournamentId, playerId]
  );
  await conn.query('UPDATE registered_users SET tournaments_won = tournaments_won + 1 WHERE player_id = ?', [playerId]);
}

// ---------- tournament matches ----------

async function findMatchSlot(matchId, conn = pool) {
  const [rows] = await conn.query('SELECT * FROM tournament_matches WHERE match_id = ?', [matchId]);
  return rows[0] || null;
}

async function listMatches(tournamentId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT tm.match_id, tm.round_no, tm.match_no, tm.scheduled_at, m.status, m.started_at, m.ended_at
     FROM tournament_matches tm JOIN matches m ON m.match_id = tm.match_id
     WHERE tm.tournament_id = ?
     ORDER BY tm.round_no, tm.match_no`,
    [tournamentId]
  );
  return rows;
}

// My tournament matches that are waiting or being played (the "upcoming matches" screen).
async function listUpcomingForPlayer(playerId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT tm.tournament_id, t.name AS tournament_name, tm.match_id, tm.round_no, tm.match_no,
            tm.scheduled_at, m.status
     FROM tournament_matches tm
     JOIN matches m ON m.match_id = tm.match_id
     JOIN tournaments t ON t.tournament_id = tm.tournament_id
     JOIN match_players mp ON mp.match_id = tm.match_id
     WHERE mp.player_id = ? AND m.status IN ('waiting', 'in_progress')
     ORDER BY tm.scheduled_at`,
    [playerId]
  );
  return rows;
}

// Waiting tournament matches whose start time has come.
async function listDueMatchIds(conn = pool) {
  const [rows] = await conn.query(
    `SELECT tm.match_id FROM tournament_matches tm JOIN matches m ON m.match_id = tm.match_id
     WHERE m.status = 'waiting' AND tm.scheduled_at <= NOW()`
  );
  return rows.map((r) => r.match_id);
}

async function setMatchSchedule(matchId, scheduledAt, conn = pool) {
  await conn.query('UPDATE tournament_matches SET scheduled_at = ? WHERE match_id = ?', [scheduledAt, matchId]);
}

// Match ids of this tournament that are not over yet (used when the creator cancels).
async function listOpenMatchIds(tournamentId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT tm.match_id FROM tournament_matches tm JOIN matches m ON m.match_id = tm.match_id
     WHERE tm.tournament_id = ? AND m.status IN ('waiting', 'in_progress')`,
    [tournamentId]
  );
  return rows.map((r) => r.match_id);
}

async function countUnfinishedInRound(tournamentId, roundNo, conn = pool) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM tournament_matches tm JOIN matches m ON m.match_id = tm.match_id
     WHERE tm.tournament_id = ? AND tm.round_no = ? AND m.status NOT IN ('finished', 'cancelled')`,
    [tournamentId, roundNo]
  );
  return rows[0].n;
}

module.exports = {
  create,
  updateDetails,
  listAll,
  findById,
  listMine,
  lockById,
  update,
  listDue,
  listParticipants,
  countParticipants,
  findParticipant,
  addParticipant,
  removeParticipant,
  listActivePlayerIds,
  listMemberIds,
  eliminateRoundLosers,
  setChampion,
  findMatchSlot,
  listMatches,
  listUpcomingForPlayer,
  listDueMatchIds,
  setMatchSchedule,
  listOpenMatchIds,
  countUnfinishedInRound,
};
