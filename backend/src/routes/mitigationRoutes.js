const { Router } = require('express');
const { z } = require('zod');
const { getMitigationByLocation } = require('../controllers/mitigationController');
const { validate } = require('../middleware/validate');
const { SUPPORTED_LANGUAGES } = require('../utils/language');

const router = Router();

const paramsSchema = z.object({
  location_id: z.coerce.number().int().positive(),
});

const querySchema = z.object({
  refresh: z.enum(['true', 'false']).optional(),
  lang: z.enum(SUPPORTED_LANGUAGES).optional(),
});

router.get('/:location_id', validate(paramsSchema, 'params'), validate(querySchema, 'query'), getMitigationByLocation);

module.exports = router;
