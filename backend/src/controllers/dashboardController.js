const { listLocations, getLocationById } = require('../repositories/locationRepository');
const { getRiskTrend24h } = require('../repositories/footfallRepository');
const { getRecentSnapshots } = require('../repositories/riskSnapshotRepository');
const { evaluateLocationRisk, calculateRiskScore, getRiskLevel } = require('../services/riskService');
const { normalizeLanguage } = require('../utils/language');

async function getDashboardData(req, res) {
  const language = normalizeLanguage(req.query.lang);
  const locations = await listLocations();

  const riskAssessments = await Promise.all(locations.map((location) => evaluateLocationRisk(location, { language })));
  const riskTrendRows = await getRiskTrend24h();

  const riskTrend = riskTrendRows.map((row) => {
    const score = calculateRiskScore({
      predictedFootfall: Number(row.actual_footfall),
      capacity: Number(row.capacity),
      weatherScore: Number(row.weather_score),
      trafficIndex: Number(row.traffic_index),
      socialMediaSpikeIndex: Number(row.social_media_spike_index),
    });

    return {
      timestamp: row.timestamp,
      location_id: row.location_id,
      location_name: row.name,
      risk_score: score,
      risk_level: getRiskLevel(score),
    };
  });

  const mapPoints = riskAssessments.map((assessment) => {
    const location = locations.find((item) => item.id === assessment.location_id);
    const crowdChance = Math.max(
      0,
      Math.min(
        100,
        Number((assessment.risk_score * 0.6 + Number(assessment.capacity_utilization_pct || 0) * 0.4).toFixed(2)),
      ),
    );

    return {
      location_id: assessment.location_id,
      name: assessment.location_name,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      risk_score: assessment.risk_score,
      risk_level: assessment.risk_level,
      predicted_footfall: assessment.predicted_footfall,
      capacity: assessment.capacity,
      sustainability_score: assessment.sustainability_score,
      capacity_utilization_pct: assessment.capacity_utilization_pct,
      plain_summary: assessment.plain_summary,
      dominant_driver: assessment.dominant_driver,
      factor_breakdown: assessment.factor_breakdown,
      weather: assessment.environment?.weather || null,
      aqi: assessment.environment?.aqi || null,
      weather_source: assessment.weather_source,
      source_reason: assessment.environment?.source_reason || null,
      environmental_risk_index: assessment.environment?.environmental_risk_index ?? assessment.weather_score,
      traffic_index: Number(assessment.traffic_index || 0),
      traffic_source: assessment.traffic_source || 'historical-synthetic',
      crowd_chance: crowdChance,
    };
  });

  const capacityComparison = riskAssessments.map((assessment) => ({
    location_id: assessment.location_id,
    name: assessment.location_name,
    predicted_footfall: assessment.predicted_footfall,
    capacity: assessment.capacity,
  }));

  const sortedByRisk = [...riskAssessments].sort((a, b) => b.risk_score - a.risk_score);
  const plainLanguageCards = sortedByRisk.slice(0, 3).map((entry) => ({
    location_id: entry.location_id,
    location_name: entry.location_name,
    summary: entry.plain_summary,
    risk_level: entry.risk_level,
  }));

  return res.json({
    data: {
      generated_at: new Date().toISOString(),
      language,
      map_points: mapPoints,
      risk_trend: riskTrend,
      capacity_comparison: capacityComparison,
      plain_language_cards: plainLanguageCards,
    },
  });
}

async function getLocationRiskSeries(req, res) {
  const { location_id: locationId } = req.params;
  const location = await getLocationById(locationId);

  if (!location) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Location ${locationId} was not found`,
    });
  }

  const snapshots = await getRecentSnapshots(locationId, 24);

  return res.json({
    data: {
      location,
      series: snapshots,
    },
  });
}

module.exports = {
  getDashboardData,
  getLocationRiskSeries,
};
