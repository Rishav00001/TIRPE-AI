const { Router } = require('express');
const { z } = require('zod');
const { getAnalyticsByLocation } = require('../controllers/analyticsController');
const { validate } = require('../middleware/validate');
const { SUPPORTED_LANGUAGES } = require('../utils/language');

const router = Router();

const paramsSchema = z.object({
  location_id: z.coerce.number().int().positive(),
});

const querySchema = z.object({
  refresh: z.enum(['true', 'false']).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  window: z.enum(['selected_month', 'last_30_days', 'next_10_days']).optional(),
  lang: z.enum(SUPPORTED_LANGUAGES).optional(),
});

router.get('/:location_id', validate(paramsSchema, 'params'), validate(querySchema, 'query'), getAnalyticsByLocation);

module.exports = router;
