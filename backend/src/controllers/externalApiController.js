const { getLocationById } = require('../repositories/locationRepository');
const { evaluateLocationRisk } = require('../services/riskService');
const { predictFootfall } = require('../services/aiService');
const { appendLog } = require('../services/opsLogService');

async function externalRisk(req, res) {
  const locationId = Number(req.params.location_id);
  const location = await getLocationById(locationId);
  if (!location) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Location ${locationId} was not found`,
    });
  }

  const risk = await evaluateLocationRisk(location, {
    refreshRisk: true,
    refreshEnvironment: true,
    language: req.query.lang,
  });

  appendLog({
    level: 'INFO',
    scope: 'external-api',
    message: 'External risk API consumed',
    meta: {
      location_id: locationId,
      key_id: req.apiConsumer?.key_id,
      consumer_user: req.apiConsumer?.user?.username,
    },
  });

  return res.json({
    data: risk,
    api_consumer: {
      key_id: req.apiConsumer?.key_id,
      key_name: req.apiConsumer?.key_name,
      user: req.apiConsumer?.user?.username,
    },
  });
}

async function externalPredict(req, res) {
  const prediction = await predictFootfall(req.body);

  appendLog({
    level: 'INFO',
    scope: 'external-api',
    message: 'External predict API consumed',
    meta: {
      key_id: req.apiConsumer?.key_id,
      consumer_user: req.apiConsumer?.user?.username,
      location_id: req.body.location_id,
    },
  });

  return res.json({
    data: prediction,
    api_consumer: {
      key_id: req.apiConsumer?.key_id,
      key_name: req.apiConsumer?.key_name,
      user: req.apiConsumer?.user?.username,
    },
  });
}

module.exports = {
  externalRisk,
  externalPredict,
};
