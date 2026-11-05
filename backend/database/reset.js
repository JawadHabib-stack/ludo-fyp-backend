// npm run db:reset — DROPS and recreates the database, then loads schema.sql, seed.sql and demo users.
// WARNING: deletes all data in DB_NAME. Only use on your local development database.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB_NAME = process.env.DB_NAME;
const DEMO_PASSWORD = 'password123';
const DEMO_USERS = ['demo1', 'demo2', 'demo3', 'demo4'];

async function main() {
  // Only allow simple names, because the DB name is put directly into DROP/CREATE DATABASE.
  if (!/^[A-Za-z0-9_]+$/.test(DB_NAME || '')) {
    throw new Error('DB_NAME in .env must contain only letters, numbers and _');
  }

  // multipleStatements is ON only in this script, so whole .sql files can run at once.
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    await conn.query(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${DB_NAME}\``);

    await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    await conn.query(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));

    // Demo users: demo1..demo4, password "password123"
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const ids = {};
    for (const username of DEMO_USERS) {
      const [result] = await conn.query(
        "INSERT INTO players (display_name, player_type) VALUES (?, 'registered')",
        [username]
      );
      ids[username] = result.insertId;
      await conn.query(
        'INSERT INTO registered_users (player_id, username, email, password_hash) VALUES (?, ?, ?, ?)',
        [result.insertId, username, `${username}@ludo.test`, hash]
      );
    }

    // Demo friendships: demo1 is friends with demo2 and demo3
    await conn.query(
      "INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'accepted'), (?, ?, 'accepted')",
      [ids.demo1, ids.demo2, ids.demo1, ids.demo3]
    );

    // Demo tournament: created by demo1 (who also joined), 4 players, 1v1 knockout, Demo rules, starts tomorrow.
    const [cup] = await conn.query(
      `INSERT INTO tournaments
         (creator_id, rule_set_id, name, description, max_participants, players_per_match, start_time, round_break_minutes)
       VALUES (?, 3, 'Demo Cup', '1v1 knockout: semi-finals and a final', 4, 2, DATE_ADD(NOW(), INTERVAL 1 DAY), 1)`,
      [ids.demo1]
    );
    await conn.query('INSERT INTO tournament_participants (tournament_id, player_id) VALUES (?, ?)', [cup.insertId, ids.demo1]);

    const [tables] = await conn.query('SHOW TABLES');
    console.log(`Database "${DB_NAME}" reset: ${tables.length} tables, seed + ${DEMO_USERS.length} demo users + Demo Cup loaded.`);
    console.log(`Demo logins: ${DEMO_USERS.join(', ')} / ${DEMO_PASSWORD}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Database reset failed:', err.message);
  process.exit(1);
});
