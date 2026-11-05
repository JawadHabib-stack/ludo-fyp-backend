// Guest login, sign up, login and "who am I".
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { withTransaction } = require('../config/db');
const playerModel = require('../models/playerModel');
const httpError = require('../utils/httpError');

function makeToken(player) {
  return jwt.sign(
    { player_id: player.player_id, player_type: player.player_type },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

function publicPlayer(p) {
  return { player_id: p.player_id, display_name: p.display_name, avatar: p.avatar, player_type: p.player_type };
}

function cleanDisplayName(name) {
  if (name === undefined || name === null || name === '') return null;
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 50) {
    throw httpError(400, 'display_name must be 1-50 characters');
  }
  return name.trim();
}

// POST /api/auth/guest — same device_id always returns the same guest player.
async function guest(req, res) {
  const { device_id, display_name } = req.body || {};
  if (typeof device_id !== 'string' || device_id.length < 1 || device_id.length > 100) {
    throw httpError(400, 'device_id is required (max 100 characters)');
  }

  let player = await playerModel.findGuestByDevice(device_id);
  if (!player) {
    const name = cleanDisplayName(display_name) || `Guest${Math.floor(1000 + Math.random() * 9000)}`;
    const playerId = await withTransaction((conn) => playerModel.createGuest(name, device_id, conn));
    player = await playerModel.findById(playerId);
  }

  res.json({ success: true, data: { token: makeToken(player), player: publicPlayer(player) } });
}

// POST /api/auth/register
async function register(req, res) {
  const { username, email, password, display_name } = req.body || {};
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,30}$/.test(username)) {
    throw httpError(400, 'username must be 3-30 letters, numbers or _');
  }
  if (typeof email !== 'string' || !email.includes('@') || email.length > 100) {
    throw httpError(400, 'A valid email is required');
  }
  if (typeof password !== 'string' || password.length < 6) {
    throw httpError(400, 'password must be at least 6 characters');
  }
  const cleanEmail = email.trim().toLowerCase();

  const taken = await playerModel.findUsernameOrEmail(username, cleanEmail);
  if (taken.some((row) => row.username.toLowerCase() === username.toLowerCase())) {
    throw httpError(409, 'Username is already taken');
  }
  if (taken.length > 0) throw httpError(409, 'Email is already registered');

  const password_hash = await bcrypt.hash(password, 10);
  const playerId = await withTransaction((conn) =>
    playerModel.createRegistered(
      { display_name: cleanDisplayName(display_name) || username, username, email: cleanEmail, password_hash },
      conn
    )
  );
  const player = await playerModel.findById(playerId);

  res.status(201).json({ success: true, data: { token: makeToken(player), player: publicPlayer(player) } });
}

// POST /api/auth/login — "login" can be the username or the email.
async function login(req, res) {
  const { login, password } = req.body || {};
  if (typeof login !== 'string' || typeof password !== 'string') {
    throw httpError(400, 'login and password are required');
  }

  const user = await playerModel.findRegisteredByLogin(login.trim());
  // Same message for both cases, so nobody can find out which usernames exist.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw httpError(401, 'Invalid username or password');
  }

  res.json({ success: true, data: { token: makeToken(user), player: publicPlayer(user) } });
}

// GET /api/auth/me
async function me(req, res) {
  const player = await playerModel.findById(req.user.player_id);
  if (!player) throw httpError(404, 'Player not found');
  res.json({ success: true, data: player });
}

module.exports = { guest, register, login, me };
