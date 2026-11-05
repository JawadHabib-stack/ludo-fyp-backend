// Small input checks used by controllers. Each one throws a 400 error with a clear message.
const httpError = require('./httpError');

// "12" or 12 → 12. Anything that is not a positive whole number → 400.
function toId(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `${field} must be a positive whole number`);
  return n;
}

// Value must be one of the allowed options, e.g. oneOf(mode, ['ffa', '2v2'], 'game_mode').
function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw httpError(400, `${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

module.exports = { toId, oneOf };
