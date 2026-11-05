// Turn loop for every match: roll dice, move tokens, turn timers, bot turns, finishing a match.
// MySQL holds the game state. Only the turn timers live in memory (the timers Map below).
const crypto = require('crypto');
const { withTransaction } = require('../config/db');
const matchModel = require('../models/matchModel');
const tokenModel = require('../models/tokenModel');
const ruleSetModel = require('../models/ruleSetModel');
const playerModel = require('../models/playerModel');
const { getIO } = require('../sockets/io');
const httpError = require('../utils/httpError');
const engine = require('./ludoEngine');
const botAI = require('./botAI');
const C = require('./constants');

const timers = new Map(); // match_id -> { timeout, deadline }

function emitToMatch(matchId, event, data) {
  const io = getIO();
  if (io) io.to(`match:${matchId}`).emit(event, data);
}

function clearTimer(matchId) {
  const timer = timers.get(matchId);
  if (timer) clearTimeout(timer.timeout);
  timers.delete(matchId);
}

// Runs fn after ms. Errors are logged instead of crashing the server.
function setMatchTimer(matchId, ms, deadline, fn) {
  clearTimer(matchId);
  const timeout = setTimeout(() => {
    fn().catch((err) => {
      console.error(`[match ${matchId}] timer error:`, err.message);
      // If nothing newer was scheduled, retry the turn so the match can never get stuck.
      if (timers.get(matchId)?.timeout === timeout) retryTurnSoon(matchId);
    });
  }, ms);
  timers.set(matchId, { timeout, deadline });
}

function retryTurnSoon(matchId) {
  setMatchTimer(matchId, 1000, null, () => startTurn(matchId));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Full state sent to the app: match + rule set, seats, tokens, turn deadline.
async function getState(matchId) {
  const match = await matchModel.findById(matchId);
  if (!match) return null;
  const rule_set = await ruleSetModel.findById(match.rule_set_id);
  const seats = await matchModel.listSeats(matchId);
  const tokens = await tokenModel.listByMatch(matchId);
  const timer = timers.get(matchId);
  return { match: { ...match, rule_set }, seats, tokens, turn_deadline: timer ? timer.deadline : null };
}

// Loads everything for a roll/move and LOCKS the match row until the transaction ends.
async function loadLocked(conn, matchId) {
  const match = await matchModel.lockById(matchId, conn);
  if (!match) throw httpError(404, 'Match not found');
  const rules = await ruleSetModel.findById(match.rule_set_id, conn);
  const seats = await matchModel.listSeats(matchId, conn);
  const tokens = await tokenModel.listByMatch(matchId, conn);
  return { match, rules, seats, tokens };
}

function checkTurn(match, seatNo) {
  if (match.status !== 'in_progress') throw httpError(409, 'Match is not running');
  if (match.current_seat !== seatNo) throw httpError(409, 'Not your turn');
}

function seatTokensOf(tokens, seatNo) {
  return tokens.filter((t) => t.seat_no === seatNo);
}

// Seats that have not finished yet (in 2v2 a finished seat is skipped).
function activeSeatNos(seats, tokens, rules) {
  return seats.filter((s) => !engine.isSeatFinished(seatTokensOf(tokens, s.seat_no), rules)).map((s) => s.seat_no);
}

// Called once after matchSetup. Sends the state, then the first turn starts after a short delay.
async function startMatch(matchId) {
  const state = await getState(matchId);
  emitToMatch(matchId, 'match:state', state);
  console.log(`Match ${matchId} started (${state.match.match_type}, ${state.seats.length} seats)`);
  setMatchTimer(matchId, C.START_DELAY_MS, null, () => startTurn(matchId));
}

// Tells everyone whose turn it is and starts the timer (bot: short delay, human: turn_seconds).
async function startTurn(matchId) {
  const match = await matchModel.findById(matchId);
  if (!match || match.status !== 'in_progress') return clearTimer(matchId);

  const seatNo = match.current_seat;
  const seat = (await matchModel.listSeats(matchId)).find((s) => s.seat_no === seatNo);
  const rules = await ruleSetModel.findById(match.rule_set_id);

  if (seat.bot_id) {
    setMatchTimer(matchId, C.BOT_DELAY_MS, null, () => autoPlay(matchId, seatNo));
    emitToMatch(matchId, 'game:turn', { seat_no: seatNo, deadline: null });
  } else {
    const ms = rules.turn_seconds * 1000;
    const deadline = Date.now() + ms;
    setMatchTimer(matchId, ms, deadline, () => autoPlay(matchId, seatNo));
    emitToMatch(matchId, 'game:turn', { seat_no: seatNo, deadline });
  }
}

// Server rolls the dice. If no token can move, the turn passes straight away.
async function rollDice(matchId, seatNo) {
  const result = await withTransaction(async (conn) => {
    const { match, rules, seats, tokens } = await loadLocked(conn, matchId);
    checkTurn(match, seatNo);
    if (match.dice_value !== null) throw httpError(409, 'Already rolled, move a token');

    const dice = crypto.randomInt(1, 7); // 1..6
    const moves = engine.getValidMoves(seatTokensOf(tokens, seatNo), dice, rules);
    if (moves.length === 0) {
      const next = engine.getNextSeat(seatNo, activeSeatNos(seats, tokens, rules));
      await matchModel.updateTurn(matchId, next, null, conn);
    } else {
      await matchModel.updateTurn(matchId, seatNo, dice, conn); // remember the dice until the move
    }
    return { dice_value: dice, moves };
  });

  const validTokenIds = result.moves.map((m) => m.token_id);
  emitToMatch(matchId, 'game:rolled', { seat_no: seatNo, dice_value: result.dice_value, valid_token_ids: validTokenIds });

  if (result.moves.length === 0) {
    setMatchTimer(matchId, C.NO_MOVE_DELAY_MS, null, () => startTurn(matchId));
  }
  return { dice_value: result.dice_value, valid_token_ids: validTokenIds, moves: result.moves };
}

// Moves one token with the rolled dice: capture, save the move, check for a winner, pick the next turn.
async function moveToken(matchId, seatNo, tokenId, isAuto = false) {
  const result = await withTransaction(async (conn) => {
    const { match, rules, seats, tokens } = await loadLocked(conn, matchId);
    checkTurn(match, seatNo);
    if (match.dice_value === null) throw httpError(409, 'Roll the dice first');

    const seat = seats.find((s) => s.seat_no === seatNo);
    const move = engine
      .getValidMoves(seatTokensOf(tokens, seatNo), match.dice_value, rules)
      .find((m) => m.token_id === tokenId);
    if (!move) throw httpError(400, 'Invalid move');

    const mover = { seat_no: seatNo, color: seat.color, team_no: seat.team_no };
    const captured = rules.capture_enabled ? engine.findCapture(move, mover, tokens) : null;

    // Save to the DB
    await tokenModel.updatePosition(move.token_id, move.to, conn);
    if (captured) await tokenModel.updatePosition(captured.token_id, C.BASE_POS, conn);
    await tokenModel.insertMove(
      {
        match_player_id: seat.match_player_id,
        token_id: move.token_id,
        captured_token_id: captured ? captured.token_id : null,
        dice_value: match.dice_value,
        from_position: move.from,
        to_position: move.to,
        is_auto: isAuto,
      },
      conn
    );

    // Same change in memory, to check the winner and the next turn
    tokens.find((t) => t.token_id === move.token_id).position = move.to;
    if (captured) tokens.find((t) => t.token_id === captured.token_id).position = C.BASE_POS;

    const finished = (n) => engine.isSeatFinished(seatTokensOf(tokens, n), rules);
    let winners = null;
    if (finished(seatNo)) {
      if (match.game_mode === '2v2') {
        const mate = seats.find((s) => s.seat_no !== seatNo && s.team_no === seat.team_no);
        if (mate && finished(mate.seat_no)) winners = [seatNo, mate.seat_no];
      } else {
        winners = [seatNo];
      }
    }

    let extraTurn = false;
    let rankings = null;
    if (winners) {
      rankings = await finishMatch(conn, match, seats, tokens, winners);
    } else {
      const active = activeSeatNos(seats, tokens, rules);
      extraTurn =
        active.includes(seatNo) &&
        engine.getsExtraTurn({ dice: match.dice_value, captured: !!captured, reachedHome: move.to === C.HOME_POS }, rules);
      const next = extraTurn ? seatNo : engine.getNextSeat(seatNo, active);
      await matchModel.updateTurn(matchId, next, null, conn);
    }

    return {
      moved: {
        seat_no: seatNo,
        token_id: move.token_id,
        from_position: move.from,
        to_position: move.to,
        captured_token_id: captured ? captured.token_id : null,
        extra_turn: extraTurn,
        is_auto: isAuto,
      },
      rankings,
      match_type: match.match_type,
    };
  });

  // The turn is over: stop the old timer now, so it can't auto-play the next (or extra) turn.
  clearTimer(matchId);
  emitToMatch(matchId, 'game:moved', result.moved);

  if (result.rankings) {
    emitToMatch(matchId, 'match:finished', { match_id: matchId, rankings: result.rankings });
    console.log(`Match ${matchId} finished`);
    if (result.match_type === 'tournament') {
      // Required here (not at the top) because tournamentManager also requires this file.
      const tournamentManager = require('./tournamentManager');
      tournamentManager.onMatchFinished(matchId).catch((err) => console.error('Tournament update failed:', err));
    }
  } else {
    startTurn(matchId).catch((err) => {
      console.error(`[match ${matchId}] startTurn failed:`, err.message);
      retryTurnSoon(matchId);
    });
  }
  return result.moved;
}

// Saves finish positions, ends the match and updates stats of registered players (same transaction).
async function finishMatch(conn, match, seats, tokens, winnerSeatNos) {
  const ranking = engine.rankSeats(seats, tokens, winnerSeatNos, match.game_mode);
  const rankings = [];
  for (const r of ranking) {
    const seat = seats.find((s) => s.seat_no === r.seat_no);
    await matchModel.setFinishPosition(seat.match_player_id, r.finish_position, conn);
    if (seat.player_type === 'registered') {
      await playerModel.addGameResult(seat.player_id, r.finish_position === 1, conn);
    }
    rankings.push({
      seat_no: seat.seat_no,
      player_id: seat.player_id,
      bot_id: seat.bot_id,
      display_name: seat.display_name,
      finish_position: r.finish_position,
    });
  }
  await matchModel.finishMatchRow(match.match_id, conn);
  return rankings;
}

// Plays a turn for a bot, or for a human whose timer ran out (that move is saved with is_auto = 1).
async function autoPlay(matchId, seatNo) {
  const match = await matchModel.findById(matchId);
  if (!match || match.status !== 'in_progress' || match.current_seat !== seatNo) return;

  const seat = (await matchModel.listSeats(matchId)).find((s) => s.seat_no === seatNo);
  const rules = await ruleSetModel.findById(match.rule_set_id);
  const isBot = !!seat.bot_id;

  let validMoves;
  if (match.dice_value === null) {
    const rolled = await rollDice(matchId, seatNo);
    if (rolled.moves.length === 0) return; // turn already passed
    validMoves = rolled.moves;
    if (isBot) await sleep(C.BOT_DELAY_MS); // let players see the bot's dice
  } else {
    // A human rolled but did not move in time
    const tokens = await tokenModel.listByMatch(matchId);
    validMoves = engine.getValidMoves(seatTokensOf(tokens, seatNo), match.dice_value, rules);
  }

  const allTokens = await tokenModel.listByMatch(matchId);
  const mover = { seat_no: seatNo, color: seat.color, team_no: seat.team_no };
  const pick = botAI.chooseMove(validMoves, mover, allTokens, isBot ? seat.bot_difficulty : 'hard', rules);
  await moveToken(matchId, seatNo, pick.token_id, !isBot);
}

// Called when a player (re)joins: restarts the turn timer if it was lost (e.g. after a server restart).
async function ensureTimer(matchId) {
  if (timers.has(matchId)) return;
  const match = await matchModel.findById(matchId);
  if (match && match.status === 'in_progress') await startTurn(matchId);
}

module.exports = { getState, startMatch, startTurn, rollDice, moveToken, ensureTimer, clearTimer };
