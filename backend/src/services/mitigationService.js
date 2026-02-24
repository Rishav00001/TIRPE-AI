const { haversineDistanceKm } = require('../utils/geospatial');

const { getMitigationCopy, normalizeLanguage } = require('../utils/language');

function baseMitigationActions(copy) {
  return [
    copy.action_staggered,
    copy.action_shuttle,
    copy.action_parking,
  ];
}

function addEnvironmentalActions(actions, currentRisk, copy) {
  const aqiIndex = currentRisk?.environment?.aqi?.index || 0;
  const weatherSeverity = currentRisk?.environment?.weather?.severity_index || 0;

  if (aqiIndex >= 4) {
    actions.push(copy.action_aqi);
  }

  if (weatherSeverity >= 0.7) {
    actions.push(copy.action_weather);
  }
}

function getMitigationPlan(currentLocation, currentRisk, alternatives, language = 'en') {
  const normalized = normalizeLanguage(language);
  const copy = getMitigationCopy(normalized);

  const response = {
    location_id: currentLocation.id,
    location_name: currentLocation.name,
    risk_score: currentRisk.risk_score,
    risk_level: currentRisk.risk_level,
    language: normalized,
    actions: [],
    alternate_locations: [],
    advisory: copy.advisory_controlled,
  };

  const actions = [];
  addEnvironmentalActions(actions, currentRisk, copy);

  if (currentRisk.risk_score <= 70) {
    response.actions = actions.length
      ? [copy.monitor, ...actions]
      : [copy.monitor_min];
    return response;
  }

  response.advisory = copy.advisory_red;
  response.actions = [...baseMitigationActions(copy), ...actions];
  response.alternate_locations = alternatives.slice(0, 3);

  return response;
}

function buildAlternatives(currentLocation, allLocations, riskByLocationId) {
  return allLocations
    .filter((location) => location.id !== currentLocation.id)
    .map((location) => {
      const locationRisk = riskByLocationId.get(location.id);
      return {
        location_id: location.id,
        name: location.name,
        risk_score: locationRisk ? locationRisk.risk_score : null,
        distance_km: Number(haversineDistanceKm(currentLocation, location).toFixed(2)),
      };
    })
    .filter((item) => item.risk_score !== null)
    .sort((a, b) => {
      if (a.risk_score !== b.risk_score) {
        return a.risk_score - b.risk_score;
      }
      return a.distance_km - b.distance_km;
    })
    .filter((item) => item.risk_score < 70 || item.distance_km <= 120);
}

module.exports = {
  getMitigationPlan,
  buildAlternatives,
};
