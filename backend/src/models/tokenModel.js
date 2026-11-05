// SQL for tokens (Ludo pieces) and moves (dice roll + token move history).
const { pool } = require('../config/db');

// 4 tokens for one seat, all starting in base (position -1).
async function createTokens(matchPlayerId, conn = pool) {
  await conn.query(
    'INSERT INTO tokens (match_player_id, token_no) VALUES (?, 1), (?, 2), (?, 3), (?, 4)',
    [matchPlayerId, matchPlayerId, matchPlayerId, matchPlayerId]
  );
}

// Every token in a match, with the seat info the engine needs (seat_no, color, team_no).
async function listByMatch(matchId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT tk.token_id, tk.match_player_id, tk.token_no, tk.position, mp.seat_no, mp.color, t.team_no
     FROM tokens tk
     JOIN match_players mp ON mp.match_player_id = tk.match_player_id
     LEFT JOIN teams t ON t.team_id = mp.team_id
     WHERE mp.match_id = ?
     ORDER BY mp.seat_no, tk.token_no`,
    [matchId]
  );
  return rows;
}

async function updatePosition(tokenId, position, conn = pool) {
  await conn.query('UPDATE tokens SET position = ? WHERE token_id = ?', [position, tokenId]);
}

async function insertMove(move, conn = pool) {
  const [result] = await conn.query(
    `INSERT INTO moves (match_player_id, token_id, captured_token_id, dice_value, from_position, to_position, is_auto)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      move.match_player_id, move.token_id, move.captured_token_id, move.dice_value,
      move.from_position, move.to_position, move.is_auto ? 1 : 0,
    ]
  );
  return result.insertId;
}

async function listMovesByMatch(matchId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT mv.move_id, mp.seat_no, mp.color, tk.token_no, mv.token_id, mv.dice_value,
            mv.from_position, mv.to_position, mv.captured_token_id, mv.is_auto, mv.created_at
     FROM moves mv
     JOIN match_players mp ON mp.match_player_id = mv.match_player_id
     JOIN tokens tk ON tk.token_id = mv.token_id
     WHERE mp.match_id = ?
     ORDER BY mv.move_id`,
    [matchId]
  );
  return rows;
}

module.exports = { createTokens, listByMatch, updatePosition, insertMove, listMovesByMatch };
