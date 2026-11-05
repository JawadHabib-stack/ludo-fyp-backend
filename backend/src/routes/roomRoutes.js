// /api/rooms — custom rooms and room invitations.
const router = require('express').Router();
const { auth, registeredOnly } = require('../middleware/auth');
const c = require('../controllers/roomController');

router.use(auth);
router.post('/', registeredOnly, c.createRoom);
router.get('/invitations', registeredOnly, c.listInvitations);
router.put('/invitations/:invitation_id', registeredOnly, c.respondInvitation);
router.get('/code/:room_code', c.getRoom);
router.post('/join', c.joinRoom);
router.post('/:match_id/leave', c.leaveRoom);
router.post('/:match_id/start', registeredOnly, c.startRoom);
router.post('/:match_id/invitations', registeredOnly, c.invite);

module.exports = router;
