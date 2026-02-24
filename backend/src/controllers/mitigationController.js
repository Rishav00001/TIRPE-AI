const { getLocationById, listLocations } = require('../repositories/locationRepository');
const { evaluateLocationRisk } = require('../services/riskService');
const { getMitigationPlan, buildAlternatives } = require('../services/mitigationService');
const { getCache, setCache } = require('../config/redis');
const { appendLog } = require('../services/opsLogService');
const { normalizeLanguage } = require('../utils/language');

async function getMitigationByLocation(req, res) {
  const { location_id: locationId } = req.params;
  const bypassCache = req.query.refresh === 'true';
  const language = normalizeLanguage(req.query.lang);
  const cacheKey = `mitigation:${locationId}:${language}`;

  if (!bypassCache) {
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({
        data: cached,
        cached: true,
      });
    }
  }

  const currentLocation = await getLocationById(locationId);
  if (!currentLocation) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Location ${locationId} was not found`,
    });
  }

  const allLocations = await listLocations();
  const riskRecords = await Promise.all(allLocations.map((location) => evaluateLocationRisk(location, { language })));
  const riskMap = new Map(riskRecords.map((entry) => [entry.location_id, entry]));

  const currentRisk = riskMap.get(Number(locationId));
  const alternatives = buildAlternatives(currentLocation, allLocations, riskMap)
    .filter((candidate) => candidate.risk_score < currentRisk.risk_score);

  const mitigation = getMitigationPlan(currentLocation, currentRisk, alternatives, language);

  await setCache(cacheKey, mitigation, 300);

  appendLog({
    level: currentRisk.risk_level === 'RED' ? 'WARN' : 'INFO',
    scope: 'mitigation',
    message: `Mitigation generated for ${currentLocation.name}`,
    meta: {
      location_id: currentLocation.id,
      risk_level: currentRisk.risk_level,
      actions_count: mitigation.actions.length,
      alternatives_count: mitigation.alternate_locations.length,
      language,
    },
  });

  return res.json({
    data: mitigation,
    cached: false,
  });
}

module.exports = {
  getMitigationByLocation,
};
