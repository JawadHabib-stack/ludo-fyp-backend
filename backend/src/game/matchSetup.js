// Creates matches: match row + subtype row, seats (humans and bots), 2v2 teams and 4 tokens per seat.
// Used by bot, room, online and tournament matches.
const { withTransaction } = require('../config/db');
const matchModel = require('../models/matchModel');
const tokenModel = require('../models/tokenModel');
const botModel = require('../models/botModel');
const httpError = require('../utils/httpError');
const C = require('./constants');

// Match row + its subtype row. Returns match_id. (Call inside a transaction.)
async function createMatch(conn, { match_type, rule_set_id, game_mode, max_players, subtype }) {
  const matchId = await matchModel.createMatch({ rule_set_id, match_type, game_mode, max_players }, conn);
  await matchModel.createSubtype(match_type, matchId, subtype || {}, conn);
  return matchId;
}

// Gives a human the next free seat. If they already sit in this match, returns their seat.
async function addHumanSeat(conn, matchId, playerId) {
  const match = await matchModel.lockById(matchId, conn);
  if (!match) throw httpError(404, 'Match not found');

  const existing = await matchModel.findSeatByPlayer(matchId, playerId, conn);
  if (existing) return existing.seat_no;
  if (match.status !== 'waiting') throw httpError(409, 'Match already started');

  const seats = await matchModel.listSeats(matchId, conn);
  const freeSeat = C.SEATS_FOR_PLAYERS[match.max_players].find((n) => !seats.some((s) => s.seat_no === n));
  if (!freeSeat) throw httpError(409, 'Match is full');

  await matchModel.addSeat({ match_id: matchId, seat_no: freeSeat, color: C.SEAT_COLORS[freeSeat], player_id: playerId }, conn);
  return freeSeat;
}

// Fills empty seats with bots (optional), makes 2v2 teams, creates tokens and sets status in_progress.
async function prepareForStart(conn, matchId, { fill_with_bots, difficulty = 'easy' }) {
  const match = await matchModel.lockById(matchId, conn);
  if (!match) throw httpError(404, 'Match not found');
  if (match.status !== 'waiting') throw httpError(409, 'Match already started');

  let seats = await matchModel.listSeats(matchId, conn);
  if (fill_with_bots) {
    const emptySeats = C.SEATS_FOR_PLAYERS[match.max_players].filter((n) => !seats.some((s) => s.seat_no === n));
    const bots = await botModel.pickBots(difficulty, emptySeats.length, conn);
    for (let i = 0; i < emptySeats.length; i++) {
      await matchModel.addSeat(
        { match_id: matchId, seat_no: emptySeats[i], color: C.SEAT_COLORS[emptySeats[i]], bot_id: bots[i].bot_id },
        conn
      );
    }
    seats = await matchModel.listSeats(matchId, conn);
  }

  if (seats.length < 2) throw httpError(400, 'At least 2 players are needed to start');

  if (match.game_mode === '2v2') {
    if (seats.length !== 4) throw httpError(400, '2v2 needs exactly 4 players');
    const teamIds = { 1: await matchModel.createTeam(matchId, 1, conn), 2: await matchModel.createTeam(matchId, 2, conn) };
    for (const s of seats) await matchModel.setTeam(s.match_player_id, teamIds[C.TEAM_OF_SEAT[s.seat_no]], conn);
  }

  for (const s of seats) await tokenModel.createTokens(s.match_player_id, conn);
  await matchModel.startMatchRow(matchId, Math.min(...seats.map((s) => s.seat_no)), conn);
}

// Match + seats only, status stays 'waiting' (tournament matches start later at their scheduled time).
async function createWithPlayers({ match_type, rule_set_id, game_mode, max_players, player_ids, subtype }) {
  return withTransaction(async (conn) => {
    const matchId = await createMatch(conn, { match_type, rule_set_id, game_mode, max_players, subtype });
    for (const playerId of player_ids) await addHumanSeat(conn, matchId, playerId);
    return matchId;
  });
}

// All steps in one transaction (bot and online matches). Returns match_id.
// After this, call gameManager.startMatch(match_id) to begin the turns.
async function setupAndStart({ match_type, rule_set_id, game_mode, max_players, player_ids, subtype, fill_with_bots, difficulty }) {
  return withTransaction(async (conn) => {
    const matchId = await createMatch(conn, { match_type, rule_set_id, game_mode, max_players, subtype });
    for (const playerId of player_ids) await addHumanSeat(conn, matchId, playerId);
    await prepareForStart(conn, matchId, { fill_with_bots, difficulty });
    return matchId;
  });
}

module.exports = { createMatch, addHumanSeat, prepareForStart, createWithPlayers, setupAndStart };
