// Unit tests for the pure Ludo rules in src/game/ludoEngine.js and src/game/botAI.js. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/game/ludoEngine');
const botAI = require('../src/game/botAI');

const CLASSIC = {
  six_to_unlock: 1, extra_turn_on_six: 1, extra_turn_on_capture: 1, extra_turn_on_home: 1,
  capture_enabled: 1, tokens_to_win: 4,
};
const QUICK = { ...CLASSIC, six_to_unlock: 0, tokens_to_win: 1 };

// Helper: make a token object like the ones gameManager loads from the DB.
let nextId = 1;
function tok(seat_no, color, position, team_no = null) {
  return { token_id: nextId++, seat_no, color, position, team_no };
}

test('unlock: a 6 unlocks with Classic, a 5 does not', () => {
  const t = tok(1, 'red', -1);
  assert.deepEqual(engine.getValidMoves([t], 6, CLASSIC), [{ token_id: t.token_id, from: -1, to: 0 }]);
  assert.deepEqual(engine.getValidMoves([t], 5, CLASSIC), []);
});

test('unlock: a 1 unlocks when six_to_unlock = 0', () => {
  const t = tok(1, 'red', -1);
  assert.equal(engine.getValidMoves([t], 1, QUICK).length, 1);
  assert.equal(engine.getValidMoves([t], 1, CLASSIC).length, 0);
});

test('home needs an exact roll', () => {
  const t = tok(1, 'red', 53);
  assert.deepEqual(engine.getValidMoves([t], 3, CLASSIC), [{ token_id: t.token_id, from: 53, to: 56 }]);
  assert.deepEqual(engine.getValidMoves([t], 4, CLASSIC), []);
});

test('a token already home cannot move', () => {
  assert.deepEqual(engine.getValidMoves([tok(1, 'red', 56)], 6, CLASSIC), []);
});

test('global cell is relative to each colour start', () => {
  assert.equal(engine.toGlobalCell('green', 0), 13);
  assert.equal(engine.toGlobalCell('red', 50), 50);
  assert.equal(engine.toGlobalCell('blue', 20), 7);   // (39 + 20) % 52
  assert.equal(engine.toGlobalCell('red', -1), null); // base
  assert.equal(engine.toGlobalCell('red', 52), null); // home column
});

test('capture: landing on a single opponent on a normal cell', () => {
  const mover = { seat_no: 1, color: 'red', team_no: null };
  const victim = tok(2, 'green', 0 + 52 - 13 + 5); // green position 44 = global 5
  assert.equal(engine.toGlobalCell('green', victim.position), 5);
  const move = { token_id: 999, from: 2, to: 5 };
  assert.equal(engine.findCapture(move, mover, [victim]), victim);
});

test('capture: not on a safe cell', () => {
  const mover = { seat_no: 1, color: 'red', team_no: null };
  const victim = tok(2, 'green', 52 - 13 + 8); // global 8 = star (safe)
  assert.equal(engine.toGlobalCell('green', victim.position), 8);
  assert.equal(engine.findCapture({ token_id: 999, from: 3, to: 8 }, mover, [victim]), null);
});

test('capture: not when two opponent tokens share the cell', () => {
  const mover = { seat_no: 1, color: 'red', team_no: null };
  const a = tok(2, 'green', 44);
  const b = tok(2, 'green', 44);
  assert.equal(engine.findCapture({ token_id: 999, from: 2, to: 5 }, mover, [a, b]), null);
});

test('capture: never a teammate', () => {
  const mover = { seat_no: 1, color: 'red', team_no: 1 };
  const mate = tok(3, 'yellow', 52 - 26 + 5, 1); // yellow position 31 = global 5
  assert.equal(engine.toGlobalCell('yellow', mate.position), 5);
  assert.equal(engine.findCapture({ token_id: 999, from: 2, to: 5 }, mover, [mate]), null);
});

test('capture: never inside the home column', () => {
  const mover = { seat_no: 1, color: 'red', team_no: null };
  const other = tok(2, 'green', 51);
  assert.equal(engine.findCapture({ token_id: 999, from: 49, to: 51 }, mover, [other]), null);
});

test('extra turn: each rule-set flag works on its own', () => {
  const none = { ...CLASSIC, extra_turn_on_six: 0, extra_turn_on_capture: 0, extra_turn_on_home: 0 };
  assert.equal(engine.getsExtraTurn({ dice: 6, captured: false, reachedHome: false }, CLASSIC), true);
  assert.equal(engine.getsExtraTurn({ dice: 6, captured: false, reachedHome: false }, none), false);
  assert.equal(engine.getsExtraTurn({ dice: 3, captured: true, reachedHome: false }, CLASSIC), true);
  assert.equal(engine.getsExtraTurn({ dice: 3, captured: true, reachedHome: false }, none), false);
  assert.equal(engine.getsExtraTurn({ dice: 3, captured: false, reachedHome: true }, CLASSIC), true);
  assert.equal(engine.getsExtraTurn({ dice: 3, captured: false, reachedHome: true }, none), false);
  assert.equal(engine.getsExtraTurn({ dice: 3, captured: false, reachedHome: false }, CLASSIC), false);
});

test('next seat: goes clockwise and wraps, skipping missing/finished seats', () => {
  assert.equal(engine.getNextSeat(4, [1, 3, 4]), 1);
  assert.equal(engine.getNextSeat(1, [1, 3]), 3);
  assert.equal(engine.getNextSeat(3, [1, 3]), 1);
  assert.equal(engine.getNextSeat(2, [1, 3, 4]), 3); // seat 2 just finished, not in the list
});

test('seat finished: depends on tokens_to_win', () => {
  const tokens = [tok(1, 'red', 56), tok(1, 'red', 56), tok(1, 'red', 56), tok(1, 'red', 10)];
  assert.equal(engine.isSeatFinished(tokens, CLASSIC), false);
  assert.equal(engine.isSeatFinished(tokens, QUICK), true);
  tokens[3].position = 56;
  assert.equal(engine.isSeatFinished(tokens, CLASSIC), true);
});

test('ranking: free-for-all winner first, others by progress', () => {
  const seats = [{ seat_no: 1 }, { seat_no: 2 }, { seat_no: 3 }];
  const tokens = [tok(1, 'red', 56), tok(2, 'green', 5), tok(3, 'yellow', 30)];
  assert.deepEqual(engine.rankSeats(seats, tokens, [1], 'ffa'), [
    { seat_no: 1, finish_position: 1 },
    { seat_no: 3, finish_position: 2 },
    { seat_no: 2, finish_position: 3 },
  ]);
});

test('ranking: 2v2 winning team is 1, other team is 2', () => {
  const seats = [{ seat_no: 1 }, { seat_no: 2 }, { seat_no: 3 }, { seat_no: 4 }];
  const ranking = engine.rankSeats(seats, [], [2, 4], '2v2');
  assert.deepEqual(ranking.map((r) => r.finish_position), [2, 1, 2, 1]);
});

test('tournament groups: 1v1 pairs players, odd one out makes a 3-player match (no byes)', () => {
  const sizes = (n, per) => engine.makeTournamentGroups([...Array(n).keys()], per).map((g) => g.length);
  assert.deepEqual(sizes(8, 2), [2, 2, 2, 2]);
  assert.deepEqual(sizes(4, 2), [2, 2]);
  assert.deepEqual(sizes(2, 2), [2]);
  assert.deepEqual(sizes(5, 2), [3, 2]);
  assert.deepEqual(sizes(3, 2), [3]);
});

test('tournament groups: 4-player matches use as few matches as possible, never 1 player alone', () => {
  const sizes = (n, per) => engine.makeTournamentGroups([...Array(n).keys()], per).map((g) => g.length);
  assert.deepEqual(sizes(16, 4), [4, 4, 4, 4]);
  assert.deepEqual(sizes(8, 4), [4, 4]);
  assert.deepEqual(sizes(5, 4), [3, 2]);
  assert.deepEqual(sizes(2, 4), [2]);
  // every player is in exactly one group
  assert.deepEqual(engine.makeTournamentGroups([1, 2, 3, 4, 5, 6], 4).flat().sort(), [1, 2, 3, 4, 5, 6]);
});

test('bot (hard) prefers a capture', () => {
  const mover = { seat_no: 1, color: 'red', team_no: null };
  const victim = tok(2, 'green', 44); // global 5
  const moves = [
    { token_id: 1, from: 10, to: 13 }, // safe cell
    { token_id: 2, from: 2, to: 5 },   // capture
  ];
  assert.equal(botAI.chooseMove(moves, mover, [victim], 'hard').token_id, 2);
});

test('bot (hard) gives no capture bonus when the rule set has capture off', () => {
  const mover = { seat_no: 1, color: 'red', team_no: null };
  const victim = tok(2, 'green', 44); // global 5
  const moves = [
    { token_id: 1, from: 10, to: 13 }, // safe cell: 13 + 30
    { token_id: 2, from: 2, to: 5 },   // would capture, but capture is off: only 5
  ];
  const noCapture = { ...CLASSIC, capture_enabled: 0 };
  assert.equal(botAI.chooseMove(moves, mover, [victim], 'hard', noCapture).token_id, 1);
});

test('bot (easy) always returns one of the valid moves', () => {
  const moves = [{ token_id: 1, from: 0, to: 3 }, { token_id: 2, from: 4, to: 7 }];
  for (let i = 0; i < 20; i++) assert.ok(moves.includes(botAI.chooseMove(moves, { seat_no: 1, color: 'red' }, [], 'easy')));
});
