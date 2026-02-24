const { getModelStatus } = require('../services/modelOrchestrator');
const env = require('../config/env');

function getHealth(req, res) {
  res.json({
    status: 'ok',
    service: 'tirpe-backend',
    timestamp: new Date().toISOString(),
    ai_provider: env.AI_PROVIDER,
    model: getModelStatus(),
  });
}

module.exports = {
  getHealth,
};
