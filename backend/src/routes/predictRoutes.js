const { Router } = require('express');
const { z } = require('zod');
const { predict } = require('../controllers/predictController');
const { validate } = require('../middleware/validate');

const router = Router();

const predictSchema = z.object({
  location_id: z.coerce.number().int().positive(),
  weather_score: z.number().min(0).max(1),
  holiday_flag: z.boolean(),
  weekend_flag: z.boolean(),
  social_media_spike_index: z.number().min(0).max(1),
  traffic_index: z.number().min(0).max(1),
  rolling_mean: z.number().min(0).optional(),
});

router.post('/', validate(predictSchema), predict);

module.exports = router;
