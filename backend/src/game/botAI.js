// Chooses which token to move, for bot seats and for players whose turn timer ran out.
const engine = require('./ludoEngine');
const C = require('./constants');

// Higher score = better move. Change these weights to make bots smarter or dumber.
function scoreMove(move, mover, allTokens, rules) {
  let score = move.to; // prefer moving tokens that are further ahead
  const canCapture = !rules || !!rules.capture_enabled;
  if (canCapture && engine.findCapture(move, mover, allTokens)) score += 100;
  if (move.to === C.HOME_POS) score += 80;
  if (move.from === C.BASE_POS) score += 60;
  const cell = engine.toGlobalCell(mover.color, move.to);
  if (cell !== null && engine.isSafeCell(cell)) score += 30;
  return score;
}

// easy = random valid move, hard = best scored move. "rules" is the match's rule_sets row.
function chooseMove(validMoves, mover, allTokens, difficulty, rules) {
  if (difficulty === 'easy') {
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }
  let best = validMoves[0];
  for (const move of validMoves) {
    if (scoreMove(move, mover, allTokens, rules) > scoreMove(best, mover, allTokens, rules)) best = move;
  }
  return best;
}

module.exports = { chooseMove, scoreMove };
