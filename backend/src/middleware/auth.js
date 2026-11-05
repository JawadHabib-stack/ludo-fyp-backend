// Route guards: auth (valid JWT) and registeredOnly (no guests).
const jwt = require('jsonwebtoken');
const httpError = require('../utils/httpError');

// Reads "Authorization: Bearer <token>" and puts { player_id, player_type } in req.user.
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw httpError(401, 'Login required');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw httpError(401, 'Invalid or expired token');
  }
  next();
}

// Guests can play bot/online matches and join rooms by code, but not use social or tournament features.
function registeredOnly(req, res, next) {
  if (req.user.player_type !== 'registered') throw httpError(403, 'Create an account to use this feature');
  next();
}

module.exports = { auth, registeredOnly };
