const axios = require('axios');
const OpenAI = require('openai');
const env = require('../config/env');
const { getCache, setCache } = require('../config/redis');

const weatherClient = axios.create({
  baseURL: env.WEATHER_API_BASE_URL,
  timeout: 7_000,
});

const localCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

let openaiClient = null;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAqi(aqiIndex) {
  const numeric = Number(aqiIndex || 1);
  return clamp((numeric - 1) / 4);
}

function getAqiCategory(index) {
  const categories = {
    1: 'Good',
    2: 'Fair',
    3: 'Moderate',
    4: 'Poor',
    5: 'Very Poor',
  };

  return categories[index] || 'Unknown';
}

function getConditionRisk(condition) {
  const map = {
    Thunderstorm: 0.95,
    Drizzle: 0.72,
    Rain: 0.78,
    Snow: 0.75,
    Mist: 0.6,
    Smoke: 0.66,
    Haze: 0.68,
    Dust: 0.74,
    Fog: 0.67,
    Sand: 0.75,
    Ash: 0.78,
    Squall: 0.8,
    Tornado: 0.98,
    Clouds: 0.35,
    Clear: 0.2,
  };

  return map[condition] ?? 0.4;
}

function calculateWeatherSeverity({ condition, temperatureC, humidityPct, windSpeedMps, rain1hMm }) {
  const conditionRisk = getConditionRisk(condition);
  const windRisk = clamp((Number(windSpeedMps || 0)) / 20);
  const rainRisk = clamp((Number(rain1hMm || 0)) / 12);
  const tempRisk = clamp(Math.abs(Number(temperatureC || 24) - 24) / 24);
  const humidityRisk = clamp(Math.abs(Number(humidityPct || 55) - 55) / 55);

  return Number(
    clamp(
      conditionRisk * 0.35
      + windRisk * 0.2
      + rainRisk * 0.2
      + tempRisk * 0.15
      + humidityRisk * 0.1,
    ).toFixed(4),
  );
}

function readLocalCache(cacheKey) {
  const existing = localCache.get(cacheKey);
  if (!existing) {
    return null;
  }

  if (Date.now() > existing.expiresAt) {
    localCache.delete(cacheKey);
    return null;
  }

  return existing.payload;
}

function writeLocalCache(cacheKey, payload) {
  localCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function buildPayload({
  source,
  condition,
  description,
  temperatureC,
  humidityPct,
  windSpeedMps,
  rain1hMm,
  aqiIndex,
  components = {},
  sourceReason = null,
}) {
  const weatherSeverityIndex = calculateWeatherSeverity({
    condition,
    temperatureC,
    humidityPct,
    windSpeedMps,
    rain1hMm,
  });

  const aqiNormalized = Number(normalizeAqi(aqiIndex).toFixed(4));
  const environmentalRiskIndex = Number(clamp(weatherSeverityIndex * 0.7 + aqiNormalized * 0.3).toFixed(4));

  return {
    source,
    source_reason: sourceReason,
    fetched_at: new Date().toISOString(),
    weather: {
      condition,
      description,
      temperature_c: Number(temperatureC),
      humidity_pct: Number(humidityPct),
      wind_speed_mps: Number(windSpeedMps),
      rainfall_mm_1h: Number(rain1hMm),
      severity_index: weatherSeverityIndex,
    },
    aqi: {
      index: Number(aqiIndex),
      category: getAqiCategory(Number(aqiIndex)),
      normalized_index: aqiNormalized,
      components,
    },
    environmental_risk_index: environmentalRiskIndex,
  };
}

async function fetchWeatherAndAqi(location) {
  const params = {
    lat: location.latitude,
    lon: location.longitude,
    appid: env.WEATHER_API_KEY,
  };

  const [weatherRes, aqiRes] = await Promise.all([
    weatherClient.get('/data/2.5/weather', {
      params: {
        ...params,
        units: 'metric',
      },
    }),
    weatherClient.get('/data/2.5/air_pollution', {
      params,
    }),
  ]);

  const weatherData = weatherRes.data;
  const pollutionData = aqiRes.data?.list?.[0] || {};

  return buildPayload({
    source: 'openweather-live',
    condition: weatherData?.weather?.[0]?.main || 'Unknown',
    description: weatherData?.weather?.[0]?.description || 'Unknown',
    temperatureC: weatherData?.main?.temp ?? 0,
    humidityPct: weatherData?.main?.humidity ?? 0,
    windSpeedMps: weatherData?.wind?.speed ?? 0,
    rain1hMm: weatherData?.rain?.['1h'] ?? weatherData?.snow?.['1h'] ?? 0,
    aqiIndex: pollutionData?.main?.aqi ?? 1,
    components: pollutionData?.components || {},
  });
}

function getOpenAIClient() {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL || undefined,
    });
  }

  return openaiClient;
}

function extractOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text.trim();
  }

  const chunks = [];
  for (const output of response?.output || []) {
    for (const content of output?.content || []) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join('\n').trim();
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('No JSON object in output');
    }

    return JSON.parse(text.slice(start, end + 1));
  }
}

async function fetchEstimatedEnvironmentFromOpenAI(location) {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const prompt = [
    'Estimate current weather and AQI for the provided location as realistic operational values for tourism operations.',
    'Return strict JSON only with keys:',
    'condition, description, temperature_c, humidity_pct, wind_speed_mps, rainfall_mm_1h, aqi_index.',
    'aqi_index must be integer 1..5.',
    'Use plausible local conditions for the location geography and current season.',
    `location_name: ${location.name}`,
    `latitude: ${location.latitude}`,
    `longitude: ${location.longitude}`,
  ].join(' ');

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: 'You are a weather and AQI estimator for tourism risk operations.' }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
    max_output_tokens: 250,
  });

  const parsed = parseJsonObject(extractOutputText(response));
  return buildPayload({
    source: 'openai-estimated',
    condition: parsed.condition || 'Clouds',
    description: parsed.description || 'Estimated condition',
    temperatureC: parsed.temperature_c ?? 24,
    humidityPct: parsed.humidity_pct ?? 55,
    windSpeedMps: parsed.wind_speed_mps ?? 3,
    rain1hMm: parsed.rainfall_mm_1h ?? 0,
    aqiIndex: Math.min(5, Math.max(1, Number(parsed.aqi_index || 2))),
    components: {},
  });
}

function pseudoRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildMockEnvironment(location) {
  const hour = new Date().getUTCHours();
  const seed = hour + location.id * 7.13;
  const weatherOptions = ['Clear', 'Clouds', 'Mist', 'Rain', 'Haze'];
  const pick = weatherOptions[Math.floor(pseudoRandom(seed) * weatherOptions.length)] || 'Clouds';

  const temperatureC = 16 + pseudoRandom(seed + 1.3) * 18;
  const humidityPct = 40 + pseudoRandom(seed + 2.1) * 45;
  const windSpeedMps = 0.8 + pseudoRandom(seed + 3.8) * 7;
  const rain1hMm = pick === 'Rain' ? pseudoRandom(seed + 5.2) * 7 : 0;
  const aqiIndex = Math.min(5, Math.max(1, Math.round(1 + pseudoRandom(seed + 4.4) * 3)));

  return buildPayload({
    source: 'synthetic-fallback',
    condition: pick,
    description: `Simulated ${pick.toLowerCase()} condition`,
    temperatureC,
    humidityPct,
    windSpeedMps,
    rain1hMm,
    aqiIndex,
    components: {},
  });
}

async function getLocationEnvironment(location, options = {}) {
  const { refresh = false } = options;
  const weatherMode = env.WEATHER_SOURCE_MODE || 'openai';
  const cacheKey = `env:${location.id}:${weatherMode}`;

  if (!refresh) {
    const redisCached = await getCache(cacheKey);
    if (redisCached) {
      writeLocalCache(cacheKey, redisCached);
      return redisCached;
    }

    const memoryCached = readLocalCache(cacheKey);
    if (memoryCached) {
      return memoryCached;
    }
  }

  let payload = null;
  let fallbackReason = null;

  if (weatherMode !== 'openai') {
    if (env.WEATHER_API_KEY) {
      try {
        payload = await fetchWeatherAndAqi(location);
      } catch (error) {
        const status = error?.response?.status;
        const statusText = error?.response?.statusText;
        const code = error?.code;
        const message = error?.message;
        fallbackReason = `openweather_failed${status ? `:${status}` : ''}${statusText ? `:${statusText}` : ''}${code ? `:${code}` : ''}${message ? `:${message}` : ''}`;
        payload = null;
      }
    } else {
      fallbackReason = 'openweather_skipped:missing_weather_api_key';
    }
  } else {
    fallbackReason = 'openweather_skipped:mode_openai';
  }

  if (!payload && weatherMode !== 'openweather') {
    try {
      payload = await fetchEstimatedEnvironmentFromOpenAI(location);
      if (payload && fallbackReason) {
        payload.source_reason = fallbackReason;
      }
    } catch (error) {
      const reason = error?.message ? `openai_failed:${error.message}` : 'openai_failed';
      fallbackReason = fallbackReason ? `${fallbackReason} | ${reason}` : reason;
      payload = null;
    }
  } else if (!payload && weatherMode === 'openweather') {
    const reason = 'openai_skipped:mode_openweather';
    fallbackReason = fallbackReason ? `${fallbackReason} | ${reason}` : reason;
  }

  if (!payload) {
    payload = buildMockEnvironment(location);
    if (fallbackReason) {
      payload.source_reason = fallbackReason;
    }
  }

  await setCache(cacheKey, payload, Math.floor(CACHE_TTL_MS / 1000));
  writeLocalCache(cacheKey, payload);
  return payload;
}

module.exports = {
  getLocationEnvironment,
  normalizeAqi,
  getAqiCategory,
};
