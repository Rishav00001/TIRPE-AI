const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireApiKey } = require('../middleware/apiKeyAuth');
const { externalRisk, externalPredict } = require('../controllers/externalApiController');

const router = Router();

const riskParamsSchema = z.object({
  location_id: z.coerce.number().int().positive(),
});

const predictSchema = z.object({
  location_id: z.coerce.number().int().positive(),
  weather_score: z.number().min(0).max(1),
  holiday_flag: z.boolean(),
  weekend_flag: z.boolean(),
  social_media_spike_index: z.number().min(0).max(1),
  traffic_index: z.number().min(0).max(1),
  rolling_mean: z.number().min(0).optional(),
});

router.use(requireApiKey);
router.get('/risk/:location_id', validate(riskParamsSchema, 'params'), externalRisk);
router.post('/predict', validate(predictSchema), externalPredict);

module.exports = router;
