// /api/friends — friend list and requests (registered users only).
const router = require('express').Router();
const { auth, registeredOnly } = require('../middleware/auth');
const c = require('../controllers/friendController');

router.use(auth, registeredOnly);
router.get('/', c.listFriends);
router.get('/requests', c.listRequests);
router.post('/requests', c.sendRequest);
router.put('/requests/:friendship_id', c.respondToRequest);
router.delete('/:player_id', c.removeFriend);

module.exports = router;
