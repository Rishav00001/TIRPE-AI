const { predictFootfall } = require('./aiService');
const { getLatestFeatures, getRollingMean } = require('../repositories/footfallRepository');
const { insertRiskSnapshot } = require('../repositories/riskSnapshotRepository');
const { getLocationEnvironment } = require('./weatherService');
const { getLocationTraffic } = require('./trafficService');
const { buildPlainSummary, normalizeLanguage } = require('../utils/language');

const RISK_CACHE_TTL_MS = 60 * 1000;
const riskCache = new Map();

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRisk(raw) {
  return clamp(raw * 100);
}

function calculateRiskScore({
  predictedFootfall,
  capacity,
  weatherScore,
  trafficIndex,
  socialMediaSpikeIndex,
}) {
  const ratio = capacity > 0 ? predictedFootfall / capacity : 0;
  const weighted = ratio * 0.4 + weatherScore * 0.2 + trafficIndex * 0.2 + socialMediaSpikeIndex * 0.2;
  return Number(normalizeRisk(weighted).toFixed(2));
}

function calculateSustainabilityScore(riskScore, trafficIndex) {
  const trafficScaled = trafficIndex * 100;
  const score = 100 - (riskScore * 0.6 + trafficScaled * 0.4);
  return Number(clamp(score).toFixed(2));
}

function getRiskLevel(riskScore) {
  if (riskScore > 70) {
    return 'RED';
  }

  if (riskScore >= 40) {
    return 'YELLOW';
  }

  return 'GREEN';
}

function buildRiskComponents({ predictedFootfall, capacity, weatherScore, trafficIndex, socialMediaSpikeIndex }) {
  const crowdLoadRatio = capacity > 0 ? predictedFootfall / capacity : 0;

  return {
    crowd_load: Number((crowdLoadRatio * 0.4 * 100).toFixed(2)),
    weather_environment: Number((weatherScore * 0.2 * 100).toFixed(2)),
    traffic: Number((trafficIndex * 0.2 * 100).toFixed(2)),
    social_signal: Number((socialMediaSpikeIndex * 0.2 * 100).toFixed(2)),
  };
}

function getDominantDriver(components) {
  const entries = [
    ['crowd_load', components.crowd_load],
    ['weather_environment', components.weather_environment],
    ['traffic', components.traffic],
    ['social_signal', components.social_signal],
  ];

  entries.sort((a, b) => b[1] - a[1]);
  return {
    key: entries[0][0],
    score: entries[0][1],
  };
}

async function getLatestFeatureBundle(location, options = {}) {
  const { refreshEnvironment = false } = options;
  const latest = await getLatestFeatures(location.id);
  const rollingMean = await getRollingMean(location.id, 3);

  const fallbackFootfall = Math.round(location.average_daily_footfall / 24);
  const baseline = latest
    ? {
      weather_score: Number(latest.weather_score),
      holiday_flag: Boolean(latest.holiday_flag),
      weekend_flag: Boolean(latest.weekend_flag),
      social_media_spike_index: Number(latest.social_media_spike_index),
      traffic_index: Number(latest.traffic_index),
      rolling_mean: Number(rollingMean || latest.actual_footfall),
    }
    : {
      weather_score: 0.5,
      holiday_flag: false,
      weekend_flag: false,
      social_media_spike_index: 0.4,
      traffic_index: 0.5,
      rolling_mean: fallbackFootfall,
    };

  const environment = await getLocationEnvironment(location, { refresh: refreshEnvironment });
  const traffic = await getLocationTraffic(location, { refresh: refreshEnvironment });

  const trafficIndex = Number.isFinite(Number(traffic?.normalized_index))
    ? Number(traffic.normalized_index)
    : baseline.traffic_index;

  if (!environment) {
    return {
      ...baseline,
      traffic_index: trafficIndex,
      weather_source: 'historical-synthetic',
      traffic_source: traffic?.source || 'historical-synthetic',
      traffic_detail: traffic,
      aqi_index: 0,
      environment: null,
    };
  }

  return {
    ...baseline,
    traffic_index: trafficIndex,
    weather_score: Number(environment.environmental_risk_index),
    weather_source: environment.source,
    traffic_source: traffic?.source || 'historical-synthetic',
    traffic_detail: traffic,
    aqi_index: Number(environment.aqi.normalized_index || 0),
    environment,
  };
}

async function evaluateLocationRisk(location, options = {}) {
  const { refreshRisk = false } = options;
  const language = normalizeLanguage(options.language);
  const cacheKey = `${location.id}:${language}`;

  if (!refreshRisk) {
    const cached = riskCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.payload;
    }
  }

  const features = await getLatestFeatureBundle(location, options);

  let aiResponse;
  try {
    aiResponse = await predictFootfall({
      location_id: location.id,
      weather_score: features.weather_score,
      holiday_flag: features.holiday_flag,
      weekend_flag: features.weekend_flag,
      social_media_spike_index: features.social_media_spike_index,
      traffic_index: features.traffic_index,
      rolling_mean: features.rolling_mean,
    });
  } catch (error) {
    const fallbackFootfall = Math.max(50, Math.round(features.rolling_mean || location.average_daily_footfall / 24));
    aiResponse = {
      predicted_footfall: fallbackFootfall,
      confidence_score: 0.35,
      model_version: 'fallback-rule',
      degraded_mode: true,
      reason: error.message,
    };
  }

  const predictedFootfall = Number(aiResponse.predicted_footfall);
  const riskScore = calculateRiskScore({
    predictedFootfall,
    capacity: Number(location.capacity),
    weatherScore: features.weather_score,
    trafficIndex: features.traffic_index,
    socialMediaSpikeIndex: features.social_media_spike_index,
  });

  const sustainabilityScore = calculateSustainabilityScore(riskScore, features.traffic_index);
  const factorBreakdown = buildRiskComponents({
    predictedFootfall,
    capacity: Number(location.capacity),
    weatherScore: features.weather_score,
    trafficIndex: features.traffic_index,
    socialMediaSpikeIndex: features.social_media_spike_index,
  });

  const dominantDriver = getDominantDriver(factorBreakdown);
  const capacityUtilizationPct = Number(((predictedFootfall / Number(location.capacity)) * 100).toFixed(2));
  const riskLevel = getRiskLevel(riskScore);

  const plainSummary = buildPlainSummary({
    language,
    locationName: location.name,
    riskScore,
    dominantDriverKey: dominantDriver.key,
    capacityUtilizationPct,
  });

  await insertRiskSnapshot({
    location_id: location.id,
    predicted_footfall: predictedFootfall,
    confidence_score: Number(aiResponse.confidence_score || 0.4),
    risk_score: riskScore,
    sustainability_score: sustainabilityScore,
    weather_score: features.weather_score,
    traffic_index: features.traffic_index,
    social_media_spike_index: features.social_media_spike_index,
    aqi_index: features.aqi_index,
    weather_condition: features.environment?.weather?.condition || null,
    environmental_risk_index: features.environment?.environmental_risk_index || features.weather_score,
  });

  const payload = {
    location_id: location.id,
    location_name: location.name,
    predicted_footfall: predictedFootfall,
    confidence_score: Number(aiResponse.confidence_score || 0.4),
    capacity: Number(location.capacity),
    weather_score: features.weather_score,
    weather_source: features.weather_source,
    traffic_source: features.traffic_source,
    traffic_index: features.traffic_index,
    traffic_detail: features.traffic_detail,
    social_media_spike_index: features.social_media_spike_index,
    aqi_index: features.aqi_index,
    risk_score: riskScore,
    sustainability_score: sustainabilityScore,
    risk_level: riskLevel,
    capacity_utilization_pct: capacityUtilizationPct,
    factor_breakdown: factorBreakdown,
    dominant_driver: dominantDriver,
    plain_summary: plainSummary,
    environment: features.environment,
    degraded_mode: Boolean(aiResponse.degraded_mode),
    language,
  };

  riskCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + RISK_CACHE_TTL_MS,
  });

  return payload;
}

module.exports = {
  evaluateLocationRisk,
  calculateRiskScore,
  calculateSustainabilityScore,
  getRiskLevel,
};
