const { Router } = require('express');

const healthRoutes = require('./healthRoutes');
const configRoutes = require('./configRoutes');
const locationRoutes = require('./locationRoutes');
const riskRoutes = require('./riskRoutes');
const mitigationRoutes = require('./mitigationRoutes');
const predictRoutes = require('./predictRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const chatRoutes = require('./chatRoutes');
const consoleRoutes = require('./consoleRoutes');
const reportRoutes = require('./reportRoutes');
const feedbackRoutes = require('./feedbackRoutes');
const authRoutes = require('./authRoutes');
const externalRoutes = require('./externalRoutes');
const i18nRoutes = require('./i18nRoutes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/config', configRoutes);
router.use('/locations', locationRoutes);
router.use('/predict', predictRoutes);
router.use('/risk', riskRoutes);
router.use('/mitigation', mitigationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/chat', chatRoutes);
router.use('/console', consoleRoutes);
router.use('/report', reportRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/auth', authRoutes);
router.use('/external', externalRoutes);
router.use('/i18n', i18nRoutes);

module.exports = router;
