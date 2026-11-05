// /api/matches — bot match creation, match state, move history.
const router = require('express').Router();
const { auth } = require('../middleware/auth');
const c = require('../controllers/matchController');

router.use(auth);
router.post('/bot', c.createBotMatch);
router.get('/:match_id', c.getMatch);
router.get('/:match_id/moves', c.getMoves);

module.exports = router;
