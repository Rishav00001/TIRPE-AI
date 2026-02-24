const { Router } = require('express');
const { z } = require('zod');
const { getLocations } = require('../controllers/locationController');
const { validate } = require('../middleware/validate');
const { SUPPORTED_LANGUAGES } = require('../utils/language');

const router = Router();

const querySchema = z.object({
  includeRisk: z.enum(['true', 'false']).optional(),
  lang: z.enum(SUPPORTED_LANGUAGES).optional(),
});

router.get('/', validate(querySchema, 'query'), getLocations);

module.exports = router;
