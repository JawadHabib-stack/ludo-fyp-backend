// Random room code like "K7QM2X". Letters/numbers that look alike (0/O, 1/I) are left out.
const crypto = require('crypto');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 6; // must match CHAR(6) of room_matches.room_code in schema.sql

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < LENGTH; i++) code += CHARS[crypto.randomInt(CHARS.length)];
  return code;
}

module.exports = { generateRoomCode };
