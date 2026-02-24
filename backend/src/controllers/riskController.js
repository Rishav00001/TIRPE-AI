const { getLocationById } = require('../repositories/locationRepository');
const { evaluateLocationRisk } = require('../services/riskService');
const { getCache, setCache } = require('../config/redis');
const { appendLog } = require('../services/opsLogService');
const { normalizeLanguage } = require('../utils/language');

async function getRiskByLocation(req, res) {
  const { location_id: locationId } = req.params;
  const bypassCache = req.query.refresh === 'true';
  const language = normalizeLanguage(req.query.lang);
  const cacheKey = `risk:${locationId}:${language}`;

  if (!bypassCache) {
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({
        data: cached,
        cached: true,
      });
    }
  }

  const location = await getLocationById(locationId);
  if (!location) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Location ${locationId} was not found`,
    });
  }

  const riskResult = await evaluateLocationRisk(location, {
    refreshRisk: bypassCache,
    refreshEnvironment: bypassCache,
    language,
  });
  await setCache(cacheKey, riskResult, 300);

  appendLog({
    level: riskResult.risk_level === 'RED' ? 'WARN' : 'INFO',
    scope: 'risk',
    message: `Risk evaluated for ${location.name}`,
      meta: {
        location_id: location.id,
        risk_score: riskResult.risk_score,
        risk_level: riskResult.risk_level,
        weather_source: riskResult.weather_source,
        traffic_source: riskResult.traffic_source,
        language,
      },
    });

  return res.json({
    data: riskResult,
    cached: false,
  });
}

module.exports = {
  getRiskByLocation,
};
