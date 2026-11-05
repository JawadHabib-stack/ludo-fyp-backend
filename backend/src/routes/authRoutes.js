// /api/auth — guest login, register, login, me.
const router = require('express').Router();
const { auth } = require('../middleware/auth');
const c = require('../controllers/authController');

router.post('/guest', c.guest);
router.post('/register', c.register);
router.post('/login', c.login);
router.get('/me', auth, c.me);

module.exports = router;
