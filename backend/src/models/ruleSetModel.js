// SQL for rule_sets (Classic, Quick, Demo ...).
const { pool } = require('../config/db');

async function listAll(conn = pool) {
  const [rows] = await conn.query('SELECT * FROM rule_sets ORDER BY rule_set_id');
  return rows;
}

async function findById(ruleSetId, conn = pool) {
  const [rows] = await conn.query('SELECT * FROM rule_sets WHERE rule_set_id = ?', [ruleSetId]);
  return rows[0] || null;
}

module.exports = { listAll, findById };
