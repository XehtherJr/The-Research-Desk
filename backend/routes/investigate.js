const express = require('express');
const { investigate } = require('../services/investigation-engine');
const { saveInvestigation, getInvestigation } = require('../services/investigation-store');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const investigation = await investigate(req.body?.paper || req.body || {});
    saveInvestigation(investigation);
    res.json(investigation);
  } catch (error) {
    const status = /required|could not be resolved/i.test(error.message) ? 400 : 502;
    res.status(status).json({ error: error.message });
  }
});

router.get('/:id', (req, res) => {
  const investigation = getInvestigation(req.params.id);
  if (!investigation) {
    return res.status(404).json({ error: 'Investigation not found' });
  }
  res.json(investigation);
});

module.exports = router;