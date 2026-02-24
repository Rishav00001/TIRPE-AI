const env = require('../config/env');
const features = require('../config/features');
const { getCache, setCache } = require('../config/redis');
const { listLocations } = require('../repositories/locationRepository');
const { evaluateLocationRisk } = require('../services/riskService');
const { getModelStatus } = require('../services/modelOrchestrator');
const { getRecentLogs, getLogStats } = require('../services/opsLogService');
const { normalizeLanguage } = require('../utils/language');

const localConsoleCache = new Map();

async function getConsoleOverview(req, res) {
  const language = normalizeLanguage(req.query.lang);
  const cacheKey = `console:overview:${language}`;
  const bypassCache = req.query.refresh === 'true';

  if (!bypassCache) {
    const localCached = localConsoleCache.get(language);
    if (localCached && Date.now() < localCached.expiresAt) {
      return res.json({
        data: localCached.payload,
        cached: true,
      });
    }

    const cached = await getCache(cacheKey);
    if (cached) {
      localConsoleCache.set(language, {
        payload: cached,
        expiresAt: Date.now() + 60_000,
      });
      return res.json({
        data: cached,
        cached: true,
      });
    }
  }

  const locations = await listLocations();
  const risks = await Promise.all(
    locations.map((location) => evaluateLocationRisk(location, {
      refreshRisk: bypassCache,
      refreshEnvironment: bypassCache,
      language,
    })),
  );

  const topRisks = [...risks]
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 5)
    .map((row) => ({
      location_id: row.location_id,
      location_name: row.location_name,
      risk_score: row.risk_score,
      risk_level: row.risk_level,
      capacity_utilization_pct: row.capacity_utilization_pct,
      weather_condition: row.environment?.weather?.condition || 'N/A',
      aqi: row.environment?.aqi?.category || 'N/A',
      weather_source: row.weather_source,
      source_reason: row.environment?.source_reason || null,
      plain_summary: row.plain_summary,
    }));

  const filteredLogs = getRecentLogs(160).filter((entry) => {
    if (entry.level === 'ERROR' || entry.level === 'WARN' || entry.level === 'WARNING') {
      return true;
    }

    if (entry.scope === 'risk' || entry.scope === 'mitigation' || entry.scope === 'chat' || entry.scope === 'system') {
      return true;
    }

    return false;
  });

  const payload = {
    generated_at: new Date().toISOString(),
    runtime: {
      ai_provider: features.aiProvider,
      ai_model: features.aiProvider === 'openai' ? env.OPENAI_MODEL : 'local-random-forest',
      model_status: getModelStatus(),
      features: {
        chatbot_enabled: features.chatbotEnabled,
        disaster_alert_mode: features.disasterAlertMode,
        scam_hotspot_simulation: features.scamHotspotSimulation,
      },
    },
    language,
    top_risks: topRisks,
    log_stats: getLogStats(),
    recent_logs: filteredLogs.slice(0, 50),
  };

  localConsoleCache.set(language, {
    payload,
    expiresAt: Date.now() + 60_000,
  });
  await setCache(cacheKey, payload, 60);

  return res.json({
    data: payload,
    cached: false,
  });
}

module.exports = {
  getConsoleOverview,
};
