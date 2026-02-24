const { Router } = require('express');
const { getRuntimeConfig } = require('../controllers/runtimeConfigController');

const router = Router();

router.get('/', getRuntimeConfig);

module.exports = router;
