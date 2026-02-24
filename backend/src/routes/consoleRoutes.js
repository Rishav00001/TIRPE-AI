const { Router } = require('express');
const { getConsoleOverview } = require('../controllers/consoleController');

const router = Router();

router.get('/overview', getConsoleOverview);

module.exports = router;
