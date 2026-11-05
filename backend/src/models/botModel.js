// SQL for bots (computer opponents).
const { pool } = require('../config/db');

// Random bots of one difficulty. If there are not enough, the list repeats.
async function pickBots(difficulty, count, conn = pool) {
  if (count <= 0) return [];
  const [rows] = await conn.query('SELECT * FROM bots WHERE difficulty = ? ORDER BY RAND()', [difficulty]);
  if (rows.length === 0) throw new Error(`No bots with difficulty "${difficulty}" in the bots table`);
  return Array.from({ length: count }, (_, i) => rows[i % rows.length]);
}

module.exports = { pickBots };
