// Knockout tournaments: start (at start_time or by the creator), schedule every round's matches,
// start each match on time (or early when all its players are in the lobby), advance winners, crown the champion.
const crypto = require('crypto');
const { withTransaction } = require('../config/db');
const tournamentModel = require('../models/tournamentModel');
const inviteModel = require('../models/tournamentInviteModel');
const matchModel = require('../models/matchModel');
const matchSetup = require('./matchSetup');
const gameManager = require('./gameManager');
const engine = require('./ludoEngine');
const { getIO } = require('../sockets/io');
const httpError = require('../utils/httpError');
const C = require('./constants');

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- notifications (Socket.IO, to each player's personal room) ----------

function notifyPlayers(playerIds, event, data) {
  const io = getIO();
  if (!io) return;
  for (const id of playerIds) io.to(`player:${id}`).emit(event, data);
}

// "Something changed, refresh the tournament screen" → all participants + the creator.
async function notifyMembers(tournamentId, reason, extra = {}) {
  const ids = await tournamentModel.listMemberIds(tournamentId);
  notifyPlayers(ids, 'tournament:updated', { tournament_id: tournamentId, reason, ...extra });
}

// ---------- start / rounds ----------

// Starts the tournament now. Called by the creator (Start button) or by tick() at start_time.
// At start_time with fewer than 2 players the tournament is cancelled instead.
async function startTournament(tournamentId, { cancelIfTooFew = false } = {}) {
  const started = await withTransaction(async (conn) => {
    const t = await tournamentModel.lockById(tournamentId, conn);
    if (!t) throw httpError(404, 'Tournament not found');
    if (t.status !== 'registration') throw httpError(409, 'Tournament already started or closed');
    await inviteModel.expireForTournament(tournamentId, conn); // registration is over either way

    if ((await tournamentModel.countParticipants(tournamentId, conn)) < 2) {
      if (!cancelIfTooFew) throw httpError(409, 'At least 2 participants are needed to start');
      await tournamentModel.update(tournamentId, { status: 'cancelled' }, conn);
      return false;
    }
    await tournamentModel.update(tournamentId, { status: 'in_progress', current_round: 1 }, conn);
    return true;
  });

  if (!started) {
    console.log(`Tournament ${tournamentId} cancelled (fewer than 2 participants at start time)`);
    await notifyMembers(tournamentId, 'cancelled');
    return false;
  }
  console.log(`Tournament ${tournamentId} started`);
  await buildRound(tournamentId, 1, C.TOURNAMENT_LOBBY_SECONDS);
  await notifyMembers(tournamentId, 'started');
  return true;
}

// Draws one round: creates its matches (status waiting) with a start time, and tells each player.
async function buildRound(tournamentId, roundNo, delaySeconds) {
  const t = await tournamentModel.findById(tournamentId);
  const players = shuffle(await tournamentModel.listActivePlayerIds(tournamentId));
  const groups = engine.makeTournamentGroups(players, t.players_per_match);

  for (let i = 0; i < groups.length; i++) {
    const matchId = await matchSetup.createWithPlayers({
      match_type: 'tournament',
      rule_set_id: t.rule_set_id,
      game_mode: 'ffa',
      max_players: groups[i].length,
      player_ids: groups[i],
      subtype: { tournament_id: tournamentId, round_no: roundNo, match_no: i + 1, delay_seconds: delaySeconds },
    });
    const match = await matchModel.findById(matchId);
    notifyPlayers(groups[i], 'tournament:match_ready', {
      tournament_id: tournamentId,
      match_id: matchId,
      round_no: roundNo,
      match_no: i + 1,
      scheduled_at: match.scheduled_at,
    });
  }
  console.log(`Tournament ${tournamentId}: round ${roundNo} drawn (${groups.length} matches)`);
}

// Starts a waiting tournament match (tokens created, first turn begins). False if it already started.
async function startTournamentMatch(matchId) {
  try {
    await withTransaction((conn) => matchSetup.prepareForStart(conn, matchId, { fill_with_bots: false }));
  } catch (err) {
    if (err.status === 409) return false; // scheduler, lobby and creator can try at the same moment
    throw err;
  }
  await gameManager.startMatch(matchId);

  const match = await matchModel.findById(matchId);
  const seats = await matchModel.listSeats(matchId);
  notifyPlayers(seats.map((s) => s.player_id), 'tournament:match_started', {
    tournament_id: match.tournament_id,
    match_id: matchId,
    round_no: match.round_no,
  });
  await notifyMembers(match.tournament_id, 'match_started', { match_id: matchId });
  return true;
}

// A player opened the lobby of a waiting tournament match (socket match:join).
// Shows who is here, and starts the match early when every player is present.
async function onLobbyJoin(matchId) {
  const io = getIO();
  const sockets = await io.in(`match:${matchId}`).fetchSockets();
  const present = [...new Set(sockets.map((s) => s.data.player_id))];
  const match = await matchModel.findById(matchId);
  const seats = await matchModel.listSeats(matchId);

  io.to(`match:${matchId}`).emit('tournament:lobby', {
    match_id: matchId,
    scheduled_at: match.scheduled_at,
    player_ids: seats.map((s) => s.player_id),
    present_player_ids: present,
  });
  if (seats.every((s) => present.includes(s.player_id))) await startTournamentMatch(matchId);
}

// Called by gameManager when a tournament match ends.
// When the whole round is done: losers are out, then the next round is scheduled or the champion is crowned.
async function onMatchFinished(matchId) {
  const result = await withTransaction(async (conn) => {
    const slot = await tournamentModel.findMatchSlot(matchId, conn);
    if (!slot) return null;
    const t = await tournamentModel.lockById(slot.tournament_id, conn);
    const base = { tournamentId: t.tournament_id };
    // Round already closed by another match, or tournament cancelled
    if (t.status !== 'in_progress' || t.current_round !== slot.round_no) return base;
    if ((await tournamentModel.countUnfinishedInRound(t.tournament_id, slot.round_no, conn)) > 0) return base;

    await tournamentModel.eliminateRoundLosers(t.tournament_id, slot.round_no, conn);
    const active = await tournamentModel.listActivePlayerIds(t.tournament_id, conn);
    if (active.length <= 1) {
      if (active.length === 1) await tournamentModel.setChampion(t.tournament_id, active[0], conn);
      await tournamentModel.update(t.tournament_id, { status: 'finished' }, conn);
      return { ...base, finished: true, championId: active[0] ?? null };
    }
    await tournamentModel.update(t.tournament_id, { current_round: slot.round_no + 1 }, conn);
    return { ...base, nextRound: slot.round_no + 1, breakSeconds: t.round_break_minutes * 60 };
  });
  if (!result) return;

  await notifyMembers(result.tournamentId, 'match_finished', { match_id: matchId });
  if (result.nextRound) {
    await buildRound(result.tournamentId, result.nextRound, result.breakSeconds);
    await notifyMembers(result.tournamentId, 'round_scheduled', { round_no: result.nextRound });
  }
  if (result.finished) {
    console.log(`Tournament ${result.tournamentId} finished, champion player ${result.championId}`);
    await notifyMembers(result.tournamentId, 'finished', { champion_id: result.championId });
  }
}

// Creator cancels: open matches are stopped, invitations expire, everyone is told.
async function cancelTournament(tournamentId) {
  const matchIds = await withTransaction(async (conn) => {
    const t = await tournamentModel.lockById(tournamentId, conn);
    if (!t) throw httpError(404, 'Tournament not found');
    if (t.status === 'finished' || t.status === 'cancelled') throw httpError(409, `Tournament is already ${t.status}`);
    const ids = await tournamentModel.listOpenMatchIds(tournamentId, conn);
    for (const id of ids) await matchModel.setStatus(id, 'cancelled', conn);
    await tournamentModel.update(tournamentId, { status: 'cancelled' }, conn);
    await inviteModel.expireForTournament(tournamentId, conn);
    return ids;
  });

  const io = getIO();
  for (const id of matchIds) {
    gameManager.clearTimer(id);
    if (io) io.to(`match:${id}`).emit('match:cancelled', { match_id: id });
  }
  console.log(`Tournament ${tournamentId} cancelled by the creator`);
  await notifyMembers(tournamentId, 'cancelled');
}

// Runs every few seconds (server.js): starts tournaments at start_time and matches at scheduled_at.
let ticking = false;
async function tick() {
  if (ticking) return; // previous tick still running
  ticking = true;
  try {
    for (const id of await tournamentModel.listDue()) {
      await startTournament(id, { cancelIfTooFew: true }).catch((err) => {
        if (err.status !== 409) console.error(`Tournament ${id} start failed:`, err);
      });
    }
    for (const matchId of await tournamentModel.listDueMatchIds()) {
      await startTournamentMatch(matchId).catch((err) => console.error(`Tournament match ${matchId} start failed:`, err));
    }
  } finally {
    ticking = false;
  }
}

module.exports = {
  startTournament,
  startTournamentMatch,
  cancelTournament,
  onLobbyJoin,
  onMatchFinished,
  tick,
  notifyMembers,
  notifyPlayers,
};
