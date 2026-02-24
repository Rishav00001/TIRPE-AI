const { z } = require('zod');
const { listLocations, getLocationById } = require('../repositories/locationRepository');
const { evaluateLocationRisk } = require('../services/riskService');
const { generateTextAnswer } = require('../services/aiService');
const { getCache, setCache } = require('../config/redis');
const { normalizeLanguage, getLanguageName } = require('../utils/language');

const querySchema = z.object({
  location_id: z.coerce.number().int().positive().optional(),
  refresh: z.enum(['true', 'false']).optional(),
});

function buildFallbackReport({ language, locationName, averageRisk, highest, sourceStats }) {
  if (language === 'hi') {
    return [
      `यह TIRPE AI का ऑपरेशनल सारांश है${locationName ? ` (${locationName})` : ''}।`,
      `मौजूदा औसत जोखिम स्कोर ${averageRisk.toFixed(1)} है।`,
      highest
        ? `सबसे अधिक जोखिम ${highest.location_name} पर ${highest.risk_score.toFixed(1)} (${highest.risk_level}) दर्ज हुआ।`
        : 'इस समय कोई जोखिम रिकॉर्ड उपलब्ध नहीं है।',
      `डेटा स्रोत उपयोग: LIVE=${sourceStats.live}, AI-ESTIMATED=${sourceStats.estimated}, MOCK=${sourceStats.mock}।`,
      'नोट: LIVE स्रोत उपलब्ध होने पर उसी को प्राथमिकता दी जाती है।',
    ].join(' ');
  }

  return [
    `TIRPE AI operational summary${locationName ? ` for ${locationName}` : ''}.`,
    `Current average risk score is ${averageRisk.toFixed(1)}.`,
    highest
      ? `Highest risk location is ${highest.location_name} at ${highest.risk_score.toFixed(1)} (${highest.risk_level}).`
      : 'No risk records are currently available.',
    `Source usage: LIVE=${sourceStats.live}, AI-ESTIMATED=${sourceStats.estimated}, MOCK=${sourceStats.mock}.`,
    'Note: LIVE source is always prioritized when available.',
  ].join(' ');
}

async function getJudgeReport(req, res) {
  const parsed = querySchema.safeParse(req.query || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Request validation failed',
    });
  }

  const { location_id: locationId, refresh } = parsed.data;
  const refreshRequested = refresh === 'true';
  const language = normalizeLanguage(req.query.lang);
  const cacheKey = `report:judge:${language}:${locationId || 'all'}`;

  if (!refreshRequested) {
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({
        data: cached,
        cached: true,
      });
    }
  }

  const locations = await listLocations();
  const filteredLocations = locationId
    ? locations.filter((item) => item.id === Number(locationId))
    : locations;

  if (!filteredLocations.length) {
    return res.status(404).json({
      error: 'NotFound',
      message: `Location ${locationId} was not found`,
    });
  }

  const rows = await Promise.all(
    filteredLocations.map((location) => evaluateLocationRisk(location, {
      language,
      refreshRisk: refreshRequested,
      refreshEnvironment: refreshRequested,
    })),
  );

  const averageRisk = rows.length
    ? rows.reduce((sum, row) => sum + Number(row.risk_score || 0), 0) / rows.length
    : 0;
  const highest = [...rows].sort((a, b) => b.risk_score - a.risk_score)[0] || null;
  const locationName = locationId ? (await getLocationById(locationId))?.name : null;

  const sourceStats = rows.reduce((acc, row) => {
    const source = row.weather_source;
    if (source === 'openweather-live') acc.live += 1;
    else if (source === 'openai-estimated') acc.estimated += 1;
    else acc.mock += 1;
    return acc;
  }, { live: 0, estimated: 0, mock: 0 });

  const operationalContext = rows.map((row) => ({
    location_name: row.location_name,
    risk_score: row.risk_score,
    risk_level: row.risk_level,
    predicted_footfall: row.predicted_footfall,
    sustainability_score: row.sustainability_score,
    weather_source: row.weather_source,
    weather_condition: row.environment?.weather?.condition || null,
    aqi_category: row.environment?.aqi?.category || null,
    source_reason: row.environment?.source_reason || null,
  }));

  let reportText = '';
  let mode = 'llm';

  try {
    reportText = await generateTextAnswer({
      systemPrompt: [
        'You are preparing a concise judge briefing for a government tourism risk dashboard.',
        `Respond in ${getLanguageName(language)}.`,
        'Be factual, operational, and trust-first.',
        'Clearly indicate live vs estimated vs mock source usage.',
        'Do not invent numbers outside provided JSON.',
      ].join(' '),
      userPrompt: [
        `Target location: ${locationName || 'All monitored locations'}`,
        `Average risk: ${averageRisk.toFixed(2)}`,
        `Source stats: ${JSON.stringify(sourceStats)}`,
        `Operational rows JSON: ${JSON.stringify(operationalContext)}`,
        'Generate a short report with: Situation, Data Trust Status, Recommended Immediate Actions, and One-line Conclusion.',
      ].join('\n\n'),
      maxOutputTokens: 700,
    });
  } catch {
    mode = 'fallback';
    reportText = buildFallbackReport({
      language,
      locationName,
      averageRisk,
      highest,
      sourceStats,
    });
  }

  const payload = {
    generated_at: new Date().toISOString(),
    language,
    mode,
    title: language === 'hi' ? 'जज ब्रीफिंग रिपोर्ट' : 'Judge Briefing Report',
    location: locationName || 'All',
    stats: {
      average_risk_score: Number(averageRisk.toFixed(2)),
      source_usage: sourceStats,
      highest_risk: highest ? {
        location_name: highest.location_name,
        risk_score: highest.risk_score,
        risk_level: highest.risk_level,
      } : null,
    },
    report_text: reportText,
  };

  await setCache(cacheKey, payload, 60);

  return res.json({
    data: payload,
    cached: false,
  });
}

module.exports = {
  getJudgeReport,
};

