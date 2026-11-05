// Tournaments: browse, details, create, and the creator's controls
// (edit, start now, cancel, remove a player, change a match time, start a match now).
const { withTransaction } = require('../config/db');
const tournamentModel = require('../models/tournamentModel');
const matchModel = require('../models/matchModel');
const ruleSetModel = require('../models/ruleSetModel');
const tournamentManager = require('../game/tournamentManager');
const C = require('../game/constants');
const httpError = require('../utils/httpError');
const { toId, oneOf } = require('../utils/validate');

function parseFutureTime(value, field) {
  const time = new Date(value);
  if (!value || Number.isNaN(time.getTime())) throw httpError(400, `${field} is required, e.g. "2026-12-01 18:00:00"`);
  if (time.getTime() <= Date.now()) throw httpError(400, `${field} must be in the future`);
  return time;
}

// Checks the create / edit fields. When editing, missing fields keep their current value.
async function readFields(body, current = {}) {
  const name = body.name ?? current.name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw httpError(400, 'name must be 1-100 characters');

  const description = body.description !== undefined ? body.description : current.description ?? null;
  if (description !== null && (typeof description !== 'string' || description.length > 255)) {
    throw httpError(400, 'description must be text (max 255 characters)');
  }

  const rule_set_id = toId(body.rule_set_id ?? current.rule_set_id ?? 1, 'rule_set_id');
  if (!(await ruleSetModel.findById(rule_set_id))) throw httpError(404, 'Rule set not found');

  const max_participants = oneOf(Number(body.max_participants ?? current.max_participants ?? 8), C.TOURNAMENT_SIZES, 'max_participants');
  const players_per_match = oneOf(Number(body.players_per_match ?? current.players_per_match ?? 4), C.TOURNAMENT_MATCH_SIZES, 'players_per_match');

  const round_break_minutes = Number(body.round_break_minutes ?? current.round_break_minutes ?? 2);
  if (!Number.isInteger(round_break_minutes) || round_break_minutes < 1 || round_break_minutes > 60) {
    throw httpError(400, 'round_break_minutes must be a whole number from 1 to 60');
  }

  const start_time = body.start_time !== undefined || !current.start_time
    ? parseFutureTime(body.start_time, 'start_time')
    : current.start_time;

  return { name: name.trim(), description, rule_set_id, max_participants, players_per_match, round_break_minutes, start_time };
}

async function findOr404(tournamentIdValue) {
  const tournament = await tournamentModel.findById(toId(tournamentIdValue, 'tournament_id'));
  if (!tournament) throw httpError(404, 'Tournament not found');
  return tournament;
}

async function findAsCreator(req) {
  const tournament = await findOr404(req.params.tournament_id);
  if (tournament.creator_id !== req.user.player_id) throw httpError(403, 'Only the tournament creator can do this');
  return tournament;
}

// A waiting match of this tournament (for the creator's match controls).
async function findWaitingMatch(tournament, matchIdValue) {
  const matchId = toId(matchIdValue, 'match_id');
  const slot = await tournamentModel.findMatchSlot(matchId);
  if (!slot || slot.tournament_id !== tournament.tournament_id) throw httpError(404, 'Match not found in this tournament');
  const match = await matchModel.findById(matchId);
  if (match.status !== 'waiting') throw httpError(409, `Match is already ${match.status}`);
  return match;
}

// ---------- browse ----------

// GET /api/tournaments?status=registration
async function list(req, res) {
  const status = req.query.status;
  if (status !== undefined) oneOf(status, ['registration', 'in_progress', 'finished', 'cancelled'], 'status');
  res.json({ success: true, data: await tournamentModel.listAll(status) });
}

// GET /api/tournaments/mine — tournaments I created or joined
async function mine(req, res) {
  res.json({ success: true, data: await tournamentModel.listMine(req.user.player_id) });
}

// GET /api/tournaments/my-matches — my tournament matches that are waiting or being played
async function myMatches(req, res) {
  res.json({ success: true, data: await tournamentModel.listUpcomingForPlayer(req.user.player_id) });
}

// GET /api/tournaments/:tournament_id — tournament + participants + bracket (rounds → matches → seats)
async function getOne(req, res) {
  const tournament = await findOr404(req.params.tournament_id);
  const participants = await tournamentModel.listParticipants(tournament.tournament_id);

  const rounds = [];
  for (const m of await tournamentModel.listMatches(tournament.tournament_id)) {
    let round = rounds.find((r) => r.round_no === m.round_no);
    if (!round) {
      round = { round_no: m.round_no, matches: [] };
      rounds.push(round);
    }
    const seats = await matchModel.listSeats(m.match_id);
    const winner = seats.find((s) => s.finish_position === 1);
    round.matches.push({ ...m, seats, winner_id: winner ? winner.player_id : null });
  }
  const champion = participants.find((p) => p.status === 'champion') || null;

  res.json({ success: true, data: { tournament, participants, rounds, champion } });
}

// ---------- creator actions ----------

// POST /api/tournaments  { name, description?, rule_set_id, max_participants, players_per_match,
//                          start_time, round_break_minutes, join? }
async function create(req, res) {
  const body = req.body || {};
  const fields = await readFields(body);
  const join = body.join !== false; // the creator also plays, unless join: false

  const tournamentId = await withTransaction(async (conn) => {
    const id = await tournamentModel.create({ ...fields, creator_id: req.user.player_id }, conn);
    if (join) await tournamentModel.addParticipant(id, req.user.player_id, conn);
    return id;
  });
  res.status(201).json({ success: true, data: await tournamentModel.findById(tournamentId) });
}

// PUT /api/tournaments/:tournament_id — edit while registration is open (send only the fields to change)
async function update(req, res) {
  const tournament = await findAsCreator(req);
  const fields = await readFields(req.body || {}, tournament);

  await withTransaction(async (conn) => {
    const t = await tournamentModel.lockById(tournament.tournament_id, conn);
    if (t.status !== 'registration') throw httpError(409, 'A tournament can only be edited before it starts');
    const count = await tournamentModel.countParticipants(t.tournament_id, conn);
    if (fields.max_participants < count) {
      throw httpError(400, `max_participants can't be lower than the ${count} players already joined`);
    }
    await tournamentModel.updateDetails(t.tournament_id, fields, conn);
  });

  await tournamentManager.notifyMembers(tournament.tournament_id, 'edited');
  res.json({ success: true, data: await tournamentModel.findById(tournament.tournament_id) });
}

// POST /api/tournaments/:tournament_id/start — start now instead of waiting for start_time
async function start(req, res) {
  const tournament = await findAsCreator(req);
  await tournamentManager.startTournament(tournament.tournament_id);
  res.json({ success: true, data: await tournamentModel.findById(tournament.tournament_id) });
}

// POST /api/tournaments/:tournament_id/cancel
async function cancel(req, res) {
  const tournament = await findAsCreator(req);
  await tournamentManager.cancelTournament(tournament.tournament_id);
  res.json({ success: true, data: await tournamentModel.findById(tournament.tournament_id) });
}

// DELETE /api/tournaments/:tournament_id/participants/:player_id — creator removes a player before the start
async function removeParticipant(req, res) {
  const tournament = await findAsCreator(req);
  const playerId = toId(req.params.player_id, 'player_id');

  await withTransaction(async (conn) => {
    const t = await tournamentModel.lockById(tournament.tournament_id, conn);
    if (t.status !== 'registration') throw httpError(409, 'Players can only be removed before the tournament starts');
    if (!(await tournamentModel.removeParticipant(t.tournament_id, playerId, conn))) {
      throw httpError(404, 'This player is not in the tournament');
    }
  });

  tournamentManager.notifyPlayers([playerId], 'tournament:updated', { tournament_id: tournament.tournament_id, reason: 'removed' });
  await tournamentManager.notifyMembers(tournament.tournament_id, 'player_left', { player_id: playerId });
  res.json({ success: true, data: { removed: true } });
}

// PUT /api/tournaments/:tournament_id/matches/:match_id/schedule  { scheduled_at }
async function rescheduleMatch(req, res) {
  const tournament = await findAsCreator(req);
  const match = await findWaitingMatch(tournament, req.params.match_id);
  const scheduledAt = parseFutureTime((req.body || {}).scheduled_at, 'scheduled_at');

  await tournamentModel.setMatchSchedule(match.match_id, scheduledAt);
  const updated = await matchModel.findById(match.match_id);
  const seats = await matchModel.listSeats(match.match_id);
  tournamentManager.notifyPlayers(seats.map((s) => s.player_id), 'tournament:match_ready', {
    tournament_id: tournament.tournament_id,
    match_id: match.match_id,
    round_no: updated.round_no,
    match_no: updated.match_no,
    scheduled_at: updated.scheduled_at,
  });
  await tournamentManager.notifyMembers(tournament.tournament_id, 'rescheduled', { match_id: match.match_id });
  res.json({ success: true, data: { match_id: match.match_id, scheduled_at: updated.scheduled_at } });
}

// POST /api/tournaments/:tournament_id/matches/:match_id/start — start a waiting match right now
async function startMatchNow(req, res) {
  const tournament = await findAsCreator(req);
  const match = await findWaitingMatch(tournament, req.params.match_id);
  if (!(await tournamentManager.startTournamentMatch(match.match_id))) throw httpError(409, 'Match already started');
  res.json({ success: true, data: { match_id: match.match_id, status: 'in_progress' } });
}

module.exports = { list, mine, myMatches, getOne, create, update, start, cancel, removeParticipant, rescheduleMatch, startMatchNow };
