const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const {
  signup,
  login,
  me,
  listKeys,
  createKey,
  revokeKey,
} = require('../controllers/authController');

const router = Router();

const authSchema = z.object({
  username: z.string().trim().min(3).max(80),
  password: z.string().min(4).max(120),
  display_name: z.string().trim().min(2).max(120).optional(),
});

const createKeySchema = z.object({
  key_name: z.string().trim().min(3).max(120),
  scopes: z.array(z.string().trim().min(3).max(64)).max(12).optional(),
});

const keyParamsSchema = z.object({
  key_id: z.coerce.number().int().positive(),
});

router.post('/signup', validate(authSchema), signup);
router.post('/login', validate(authSchema), login);
router.get('/me', requireAuth, me);

router.get('/api-keys', requireAuth, listKeys);
router.post('/api-keys', requireAuth, validate(createKeySchema), createKey);
router.delete('/api-keys/:key_id', requireAuth, validate(keyParamsSchema, 'params'), revokeKey);

module.exports = router;
