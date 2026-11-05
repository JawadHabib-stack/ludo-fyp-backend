// /api/users — profile, match history, search, leaderboard.
const router = require('express').Router();
const { auth, registeredOnly } = require('../middleware/auth');
const c = require('../controllers/userController');

router.get('/leaderboard', c.leaderboard);
router.put('/me', auth, c.updateMe);
router.get('/me/matches', auth, c.myMatches);
router.get('/search', auth, registeredOnly, c.search);

module.exports = router;
