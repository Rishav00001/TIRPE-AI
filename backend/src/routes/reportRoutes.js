const { Router } = require('express');
const { getJudgeReport } = require('../controllers/reportController');

const router = Router();

router.get('/judge', getJudgeReport);

module.exports = router;

