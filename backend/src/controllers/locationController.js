const { listLocations } = require('../repositories/locationRepository');
const { evaluateLocationRisk } = require('../services/riskService');
const { normalizeLanguage } = require('../utils/language');

async function getLocations(req, res) {
  const locations = await listLocations();
  const includeRisk = req.query.includeRisk === 'true';
  const language = normalizeLanguage(req.query.lang);

  if (!includeRisk) {
    return res.json({
      data: locations,
    });
  }

  const assessed = await Promise.all(
    locations.map(async (location) => {
      const risk = await evaluateLocationRisk(location, { language });
      return {
        ...location,
        risk,
      };
    }),
  );

  return res.json({
    data: assessed,
  });
}

module.exports = {
  getLocations,
};
