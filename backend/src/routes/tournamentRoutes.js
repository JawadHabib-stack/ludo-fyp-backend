// /api/tournaments — browse (public), join / invite (registered), creator controls (creator only).
// Fixed paths (/mine, /invitations ...) must come before /:tournament_id.
const router = require('express').Router();
const { auth, registeredOnly } = require('../middleware/auth');
const c = require('../controllers/tournamentController');
const j = require('../controllers/tournamentJoinController');

const reg = [auth, registeredOnly];

// Browse
router.get('/', c.list);
router.get('/mine', reg, c.mine);
router.get('/my-matches', reg, c.myMatches);

// Invitations I received
router.get('/invitations', reg, j.listInvitations);
router.put('/invitations/:invitation_id', reg, j.respondInvitation);

// Create + details
router.post('/', reg, c.create);
router.get('/:tournament_id', c.getOne);

// Players
router.post('/:tournament_id/register', reg, j.register);
router.delete('/:tournament_id/register', reg, j.withdraw);
router.post('/:tournament_id/invitations', reg, j.invite);

// Creator controls
router.put('/:tournament_id', reg, c.update);
router.post('/:tournament_id/start', reg, c.start);
router.post('/:tournament_id/cancel', reg, c.cancel);
router.delete('/:tournament_id/participants/:player_id', reg, c.removeParticipant);
router.put('/:tournament_id/matches/:match_id/schedule', reg, c.rescheduleMatch);
router.post('/:tournament_id/matches/:match_id/start', reg, c.startMatchNow);

module.exports = router;
