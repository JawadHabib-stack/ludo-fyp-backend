// /api/rule-sets — public list of rule sets.
const router = require('express').Router();
const c = require('../controllers/ruleSetController');

router.get('/', c.listRuleSets);

module.exports = router;
