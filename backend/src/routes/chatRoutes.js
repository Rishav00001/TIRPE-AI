const { Router } = require('express');
const { z } = require('zod');
const { askChatbot } = require('../controllers/chatController');
const { validate } = require('../middleware/validate');
const { SUPPORTED_LANGUAGES } = require('../utils/language');

const router = Router();

const chatSchema = z.object({
  message: z.string().trim().min(2).max(1200),
  session_id: z.string().trim().min(8).max(120).optional(),
  page: z.enum(['dashboard', 'analytics']).optional(),
  location_id: z.coerce.number().int().positive().optional(),
  language: z.enum(SUPPORTED_LANGUAGES).optional(),
  route_mode: z.enum(['hybrid', 'maps_strict']).optional(),
  user_location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy_m: z.number().min(0).max(10000).optional(),
  }).optional(),
});

router.post('/', validate(chatSchema), askChatbot);

module.exports = router;
