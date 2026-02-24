const { Router } = require('express');
const { z } = require('zod');
const { getDashboardData, getLocationRiskSeries } = require('../controllers/dashboardController');
const { validate } = require('../middleware/validate');

const router = Router();

const paramsSchema = z.object({
  location_id: z.coerce.number().int().positive(),
});

router.get('/', getDashboardData);
router.get('/risk-series/:location_id', validate(paramsSchema, 'params'), getLocationRiskSeries);

module.exports = router;
