// Lists the rule sets (game modes like Classic / Quick / Demo).
const ruleSetModel = require('../models/ruleSetModel');

// GET /api/rule-sets
async function listRuleSets(req, res) {
  res.json({ success: true, data: await ruleSetModel.listAll() });
}

module.exports = { listRuleSets };
