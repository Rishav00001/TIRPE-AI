const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { SUPPORTED_LANGUAGES } = require('../utils/language');
const { translateUiPack } = require('../controllers/i18nController');

const router = Router();

const schema = z.object({
  language: z.enum(SUPPORTED_LANGUAGES),
  entries: z.record(z.string(), z.string()).default({}),
  refresh: z.boolean().optional(),
});

router.post('/pack', validate(schema), translateUiPack);

module.exports = router;
