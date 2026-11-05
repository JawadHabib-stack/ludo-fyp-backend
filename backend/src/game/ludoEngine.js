// Pure Ludo rules: valid moves, capture, extra turn, next seat, finish and ranking.
// No database and no sockets here, so every function can be unit tested (tests/ludoEngine.test.js).
// A token is { token_id, seat_no, color, team_no, position }. "rules" is a row from rule_sets.
const C = require('./constants');

// Dice values that let a token leave the base.
function unlockValues(rules) {
  return rules.six_to_unlock ? [6] : [1, 6];
}

// All moves the seat can make with this dice value: [{ token_id, from, to }]
function getValidMoves(seatTokens, dice, rules) {
  const moves = [];
  for (const t of seatTokens) {
    if (t.position === C.BASE_POS) {
      if (unlockValues(rules).includes(dice)) moves.push({ token_id: t.token_id, from: C.BASE_POS, to: 0 });
    } else if (t.position + dice <= C.HOME_POS) {
      // Exact roll needed to reach home, so moves past 56 are not allowed.
      moves.push({ token_id: t.token_id, from: t.position, to: t.position + dice });
    }
  }
  return moves;
}

// Turns a colour-relative position into a shared track cell (0-51). Null for base / home column / home.
function toGlobalCell(color, position) {
  if (position < 0 || position > C.LAST_TRACK_POS) return null;
  return (C.START_OFFSET[color] + position) % C.TRACK_LENGTH;
}

function isSafeCell(globalCell) {
  return C.SAFE_CELLS.includes(globalCell);
}

// Returns the opponent token captured by this move, or null.
// Capture only if exactly ONE opponent token is on a normal (not safe) track cell.
// Two or more tokens on one cell form a safe group. Teammates are never captured.
function findCapture(move, mover, allTokens) {
  const cell = toGlobalCell(mover.color, move.to);
  if (cell === null || isSafeCell(cell)) return null;

  const opponents = allTokens.filter(
    (t) =>
      t.seat_no !== mover.seat_no &&
      !(mover.team_no && t.team_no === mover.team_no) &&
      toGlobalCell(t.color, t.position) === cell
  );
  return opponents.length === 1 ? opponents[0] : null;
}

function isSeatFinished(seatTokens, rules) {
  const home = seatTokens.filter((t) => t.position === C.HOME_POS).length;
  return home >= rules.tokens_to_win;
}

function getsExtraTurn({ dice, captured, reachedHome }, rules) {
  return (
    (dice === 6 && !!rules.extra_turn_on_six) ||
    (!!captured && !!rules.extra_turn_on_capture) ||
    (!!reachedHome && !!rules.extra_turn_on_home)
  );
}

// Next seat clockwise among the seats still playing (wraps around to the lowest seat).
function getNextSeat(currentSeat, activeSeatNos) {
  const sorted = [...activeSeatNos].sort((a, b) => a - b);
  const next = sorted.find((s) => s > currentSeat);
  return next !== undefined ? next : sorted[0];
}

// How far a seat got: base counts 0, start cell 1, ..., home 57 for each token.
function progressScore(seatTokens) {
  return seatTokens.reduce((sum, t) => sum + t.position + 1, 0);
}

// Final positions. FFA: winner = 1, others by progress (ties: lower seat first). 2v2: winners 1, losers 2.
function rankSeats(seats, tokens, winnerSeatNos, gameMode) {
  if (gameMode === '2v2') {
    return seats.map((s) => ({ seat_no: s.seat_no, finish_position: winnerSeatNos.includes(s.seat_no) ? 1 : 2 }));
  }
  const others = seats
    .filter((s) => !winnerSeatNos.includes(s.seat_no))
    .map((s) => ({ seat_no: s.seat_no, score: progressScore(tokens.filter((t) => t.seat_no === s.seat_no)) }))
    .sort((a, b) => b.score - a.score || a.seat_no - b.seat_no);

  return [
    ...winnerSeatNos.map((seat_no) => ({ seat_no, finish_position: 1 })),
    ...others.map((o, i) => ({ seat_no: o.seat_no, finish_position: i + 2 })),
  ];
}

// Splits the players of a tournament round into matches (players already shuffled).
// 1v1 (perMatch 2): pairs; with an odd number the last player joins a pair → one 3-player match, so no byes.
// 4-player (perMatch 4): as few matches as possible, sizes as equal as possible (5 → 3 + 2).
function makeTournamentGroups(playerIds, perMatch) {
  const n = playerIds.length;
  const groupCount = Math.max(1, perMatch === 2 ? Math.floor(n / 2) : Math.ceil(n / perMatch));
  const groups = Array.from({ length: groupCount }, () => []);
  playerIds.forEach((id, i) => groups[i % groupCount].push(id));
  return groups;
}

module.exports = {
  makeTournamentGroups,
  unlockValues,
  getValidMoves,
  toGlobalCell,
  isSafeCell,
  findCapture,
  isSeatFinished,
  getsExtraTurn,
  getNextSeat,
  progressScore,
  rankSeats,
};
