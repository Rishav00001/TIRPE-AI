const { getLocationById } = require('../repositories/locationRepository');
const {
  getLatestFeatures,
  getTrafficCorrelationDataset,
  getRollingMean,
  getAvailableMonths,
  getMonthlyCrowdRange,
  getLastDaysCrowdRange,
} = require('../repositories/footfallRepository');
const { evaluateLocationRisk } = require('../services/riskService');
const { predictFootfall } = require('../services/aiService');
const { normalizeLanguage } = require('../utils/language');

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function adjustTrafficByHour(base, hour) {
  if (hour >= 7 && hour <= 10) return clamp(base + 0.2);
  if (hour >= 17 && hour <= 20) return clamp(base + 0.18);
  if (hour >= 23 || hour <= 4) return clamp(base - 0.18);
  return clamp(base + 0.04);
}

function adjustSocialByHour(base, hour) {
  if (hour >= 18 && hour <= 22) return clamp(base + 0.12);
  if (hour <= 6) return clamp(base - 0.12);
  return clamp(base + 0.03);
}

function currentMonthKeyUTC() {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}

function toDateKeyUTC(date) {
  return date.toISOString().slice(0, 10);
}

function summarizeDailyProfile(dailyProfile) {
  if (!dailyProfile.length) {
    return null;
  }

  const minFootfall = Math.min(...dailyProfile.map((row) => Number(row.min_footfall || 0)));
  const maxFootfall = Math.max(...dailyProfile.map((row) => Number(row.max_footfall || 0)));
  const avgFootfall = dailyProfile.reduce((sum, row) => sum + Number(row.avg_footfall || 0), 0) / dailyProfile.length;

  return {
    sample_count: dailyProfile.length,
    min_footfall: Number(minFootfall.toFixed(2)),
    max_footfall: Number(maxFootfall.toFixed(2)),
    avg_footfall: Number(avgFootfall.toFixed(2)),
  };
}

async function buildNext10DaysForecast({ locationId, currentRisk, baselineFeatures, baseRollingMean, capacity }) {
  const now = new Date();
  const dailyProfile = [];

  for (let dayOffset = 1; dayOffset <= 10; dayOffset += 1) {
    const baseDate = new Date(now.getTime() + dayOffset * 24 * 3_600_000);
    const sampledHours = [9, 14, 19];

    const predictions = await Promise.all(sampledHours.map(async (hour) => {
      const projectedPayload = {
        location_id: Number(locationId),
        weather_score: clamp(Number(currentRisk.weather_score) * (dayOffset > 7 ? 1.04 : 1)),
        holiday_flag: Boolean(baselineFeatures.holiday_flag),
        weekend_flag: Boolean(baselineFeatures.weekend_flag),
        social_media_spike_index: adjustSocialByHour(Number(currentRisk.social_media_spike_index), hour),
        traffic_index: adjustTrafficByHour(Number(currentRisk.traffic_index), hour),
        rolling_mean: baseRollingMean,
      };

      try {
        const prediction = await predictFootfall(projectedPayload);
        return {
          value: Number(prediction.predicted_footfall),
          confidence: Number(prediction.confidence_score || 0.4),
        };
      } catch {
        const fallbackProjected = Math.max(
          30,
          Number((baseRollingMean * (1 + projectedPayload.social_media_spike_index * 0.2)).toFixed(2)),
        );
        return {
          value: fallbackProjected,
          confidence: 0.35,
        };
      }
    }));

    const values = predictions.map((item) => item.value);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const avgConfidence = predictions.reduce((sum, item) => sum + item.confidence, 0) / predictions.length;

    dailyProfile.push({
      date: toDateKeyUTC(baseDate),
      sample_count: predictions.length,
      min_footfall: Number(Math.min(...values).toFixed(2)),
      max_footfall: Number(Math.max(...values).toFixed(2)),
      avg_footfall: Number(avg.toFixed(2)),
      confidence_score: Number(avgConfidence.toFixed(4)),
      capacity: Number(capacity),
    });
  }

  return {
    label: 'next_10_days',
    has_data: dailyProfile.length > 0,
    summary: summarizeDailyProfile(dailyProfile),
    daily_profile: dailyProfile,
  };
}

async function getAnalyticsByLocation(req, res) {
  const { location_id: locationId } = req.params;
  const refreshEnvironment = req.query.refresh === 'true';
  const window = req.query.window || 'selected_month';
  const language = normalizeLanguage(req.query.lang);
  const location = await getLocationById(locationId);

  if (!location) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Location ${locationId} was not found`,
    });
  }

  const currentRisk = await evaluateLocationRisk(location, {
    refreshEnvironment,
    refreshRisk: refreshEnvironment,
    language,
  });
  const latest = await getLatestFeatures(locationId);
  const rollingMean = await getRollingMean(locationId, 3);

  const baselineFeatures = latest || {
    weather_score: currentRisk.weather_score,
    holiday_flag: false,
    weekend_flag: false,
    social_media_spike_index: currentRisk.social_media_spike_index,
    traffic_index: currentRisk.traffic_index,
  };

  const now = new Date();
  const forecastHorizon = 12;
  const baseRollingMean = Number(rollingMean || location.average_daily_footfall / 24);
  const forecastRequests = Array.from({ length: forecastHorizon }, (_, idx) => idx + 1).map(async (offset) => {
    const timestamp = new Date(now.getTime() + offset * 3_600_000);
    const hour = timestamp.getUTCHours();

    const projectedPayload = {
      location_id: Number(locationId),
      weather_score: clamp(Number(currentRisk.weather_score) * (offset > 8 ? 1.05 : 1)),
      holiday_flag: Boolean(baselineFeatures.holiday_flag),
      weekend_flag: Boolean(baselineFeatures.weekend_flag),
      social_media_spike_index: adjustSocialByHour(Number(currentRisk.social_media_spike_index), hour),
      traffic_index: adjustTrafficByHour(Number(currentRisk.traffic_index), hour),
      rolling_mean: baseRollingMean,
    };

    try {
      const prediction = await predictFootfall(projectedPayload);
      return {
        timestamp: timestamp.toISOString(),
        hour_offset: offset,
        predicted_footfall: Number(prediction.predicted_footfall),
        confidence_score: Number(prediction.confidence_score),
        capacity: Number(location.capacity),
      };
    } catch {
      const fallbackProjected = Math.max(
        30,
        Number((baseRollingMean * (1 + projectedPayload.social_media_spike_index * 0.2)).toFixed(2)),
      );
      return {
        timestamp: timestamp.toISOString(),
        hour_offset: offset,
        predicted_footfall: fallbackProjected,
        confidence_score: 0.4,
        capacity: Number(location.capacity),
      };
    }
  });

  const forecasts = await Promise.all(forecastRequests);

  const trafficCorrelation = await getTrafficCorrelationDataset(locationId, 48);
  const availableMonths = await getAvailableMonths(locationId, 12);
  const requestedMonth = req.query.month;
  const selectedMonth = requestedMonth || availableMonths[0]?.value || currentMonthKeyUTC();
  let dailyCrowdRange;

  if (window === 'next_10_days') {
    dailyCrowdRange = await buildNext10DaysForecast({
      locationId,
      currentRisk,
      baselineFeatures,
      baseRollingMean,
      capacity: Number(location.capacity),
    });
  } else if (window === 'last_30_days') {
    dailyCrowdRange = await getLastDaysCrowdRange(locationId, 30);
  } else {
    dailyCrowdRange = await getMonthlyCrowdRange(locationId, selectedMonth);
  }

  const sustainabilityTimeline = forecasts.map((point) => {
    const utilizationRatio = point.predicted_footfall / Number(location.capacity);
    const riskApprox = Math.min(100, utilizationRatio * 100);
    const score = 100 - (riskApprox * 0.6 + Number(currentRisk.traffic_index) * 100 * 0.4);

    return {
      timestamp: point.timestamp,
      sustainability_score: Math.max(0, Number(score.toFixed(2))),
    };
  });

  return res.json({
    data: {
      location,
      language,
      current_risk: currentRisk,
      forecast: forecasts,
      sustainability_timeline: sustainabilityTimeline,
      traffic_correlation: trafficCorrelation,
      daily_crowd_range: {
        selected_window: window,
        selected_month: selectedMonth,
        available_months: availableMonths,
        ...dailyCrowdRange,
      },
      monthly_crowd_range: {
        selected_month: selectedMonth,
        available_months: availableMonths,
        ...dailyCrowdRange,
      },
      plain_explanation: {
        summary: currentRisk.plain_summary,
        dominant_driver: currentRisk.dominant_driver,
        factor_breakdown: currentRisk.factor_breakdown,
        environment: currentRisk.environment,
      },
    },
  });
}

module.exports = {
  getAnalyticsByLocation,
};
