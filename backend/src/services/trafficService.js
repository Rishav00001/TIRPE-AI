const axios = require('axios');
const OpenAI = require('openai');
const env = require('../config/env');
const { getCache, setCache } = require('../config/redis');

const trafficClient = axios.create({
  baseURL: env.GOOGLE_ROUTES_API_URL,
  timeout: 7_000,
});

const localCache = new Map();
const CACHE_TTL_MS = env.GOOGLE_TRAFFIC_CACHE_TTL_SECONDS * 1000;
const TRAFFIC_DEPARTURE_LEAD_MINUTES = 5;
let openaiClient = null;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function truncate(text, max = 320) {
  if (!text) {
    return text;
  }

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max - 3)}...`;
}

function parseDurationSeconds(duration) {
  if (!duration || typeof duration !== 'string') {
    return null;
  }

  const match = duration.trim().match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function readLocalCache(key) {
  const existing = localCache.get(key);
  if (!existing) {
    return null;
  }

  if (Date.now() > existing.expiresAt) {
    localCache.delete(key);
    return null;
  }

  return existing.payload;
}

function writeLocalCache(key, payload) {
  localCache.set(key, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function buildPayload({
  source,
  normalizedIndex,
  durationSeconds,
  staticDurationSeconds,
  distanceMeters,
  sourceReason = null,
  ...extra
}) {
  const ratio = staticDurationSeconds > 0 ? durationSeconds / staticDurationSeconds : 1;

  return {
    source,
    source_reason: sourceReason,
    fetched_at: new Date().toISOString(),
    normalized_index: Number(clamp(normalizedIndex).toFixed(4)),
    congestion_ratio: Number(ratio.toFixed(4)),
    duration_seconds: Number(durationSeconds || 0),
    baseline_duration_seconds: Number(staticDurationSeconds || durationSeconds || 0),
    distance_meters: Number(distanceMeters || 0),
    ...extra,
  };
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

  const textChunks = [];
  for (const output of response?.output || []) {
    for (const block of output?.content || []) {
      if (block?.type === 'output_text' && typeof block?.text === 'string') {
        textChunks.push(block.text);
      }
    }
  }

  return textChunks.join('\n').trim();
}

function parseJsonObject(text) {
  if (!text) {
    throw new Error('OpenAI traffic response was empty');
  }

  try {
    return JSON.parse(text);
  } catch {
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      throw new Error('OpenAI traffic response did not contain JSON');
    }

    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  }
}

function trafficFromDuration(durationSeconds, baselineSeconds) {
  const safeDuration = Math.max(1, Number(durationSeconds || 1));
  const safeBaseline = Math.max(1, Number(baselineSeconds || safeDuration));
  const ratio = safeDuration / safeBaseline;

  // ratio 1.0 => 0 traffic pressure, ratio 2.0+ => high pressure
  return clamp((ratio - 1) / 1.0);
}

function buildNearbyOrigins(location) {
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const radiusKm = 8;
  const latOffset = radiusKm / 111;
  const cosLat = Math.max(0.35, Math.cos((lat * Math.PI) / 180));
  const lngOffset = radiusKm / (111 * cosLat);

  const probes = [
    { label: 'north_west', latitude: lat + latOffset, longitude: lng - lngOffset },
    { label: 'north_east', latitude: lat + latOffset, longitude: lng + lngOffset },
    { label: 'south', latitude: lat - latOffset, longitude: lng },
  ];

  if (Number.isFinite(env.GOOGLE_TRAFFIC_ORIGIN_LAT) && Number.isFinite(env.GOOGLE_TRAFFIC_ORIGIN_LNG)) {
    probes.push({
      label: 'custom_origin',
      latitude: Number(env.GOOGLE_TRAFFIC_ORIGIN_LAT),
      longitude: Number(env.GOOGLE_TRAFFIC_ORIGIN_LNG),
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const probe of probes) {
    const key = `${probe.latitude.toFixed(5)}:${probe.longitude.toFixed(5)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(probe);
    }
  }

  return deduped;
}

function buildDestinationCandidates(location) {
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const radiusKm = 3;
  const latOffset = radiusKm / 111;
  const cosLat = Math.max(0.35, Math.cos((lat * Math.PI) / 180));
  const lngOffset = radiusKm / (111 * cosLat);

  const candidates = [
    { label: 'exact', latitude: lat, longitude: lng },
    { label: 'north_access', latitude: lat + latOffset, longitude: lng },
    { label: 'south_access', latitude: lat - latOffset, longitude: lng },
    { label: 'east_access', latitude: lat, longitude: lng + lngOffset },
    { label: 'west_access', latitude: lat, longitude: lng - lngOffset },
  ];

  const deduped = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = `${candidate.latitude.toFixed(5)}:${candidate.longitude.toFixed(5)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(candidate);
    }
  }

  return deduped;
}

function buildFutureDepartureTimestamp() {
  const date = new Date(Date.now() + TRAFFIC_DEPARTURE_LEAD_MINUTES * 60 * 1000);
  return date.toISOString();
}

function formatProbeFailure(reason) {
  if (!reason) {
    return 'probe_failed';
  }

  const status = reason?.response?.status;
  const apiMessage = reason?.response?.data?.error?.message;
  const code = reason?.code;
  const message = reason?.message;

  return [
    'probe_failed',
    status ? `status=${status}` : null,
    apiMessage ? `api=${apiMessage}` : null,
    code ? `code=${code}` : null,
    message ? `msg=${message}` : null,
  ].filter(Boolean).join(':');
}

async function fetchEstimatedTrafficFromOpenAI(location) {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }

  const systemPrompt = [
    'You estimate local road congestion for tourism operations.',
    'Return JSON only with keys: traffic_index, congestion_ratio, confidence_score.',
    'traffic_index must be a number from 0 to 1.',
    'congestion_ratio should be 1.0 to 2.5.',
  ].join(' ');

  const userPrompt = [
    'Estimate current traffic load near this tourism location:',
    `name=${location.name}`,
    `latitude=${location.latitude}`,
    `longitude=${location.longitude}`,
    'Use realistic current road pressure assumptions.',
  ].join(' ');

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: userPrompt }],
      },
    ],
    max_output_tokens: 180,
  });

  const parsed = parseJsonObject(extractOutputText(response));
  const trafficIndex = clamp(Number(parsed.traffic_index ?? 0.35));
  const ratio = Math.max(1, Number(parsed.congestion_ratio ?? 1 + trafficIndex));
  const confidence = clamp(Number(parsed.confidence_score ?? 0.55));

  return {
    source: 'openai-traffic-estimated',
    source_reason: null,
    fetched_at: new Date().toISOString(),
    normalized_index: Number(trafficIndex.toFixed(4)),
    congestion_ratio: Number(ratio.toFixed(4)),
    duration_seconds: null,
    baseline_duration_seconds: null,
    distance_meters: null,
    confidence_score: Number(confidence.toFixed(4)),
  };
}

async function fetchRoute({ origin, destination, routingPreference, fieldMask }) {
  const response = await trafficClient.post(
    '/directions/v2:computeRoutes',
    {
      origin: {
        location: {
          latLng: {
            latitude: Number(origin.latitude),
            longitude: Number(origin.longitude),
          },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: Number(destination.latitude),
            longitude: Number(destination.longitude),
          },
        },
      },
      travelMode: 'DRIVE',
      routingPreference,
      departureTime: routingPreference === 'TRAFFIC_AWARE' ? buildFutureDepartureTimestamp() : undefined,
      computeAlternativeRoutes: false,
      units: 'METRIC',
      languageCode: 'en-US',
    },
    {
      headers: {
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
    },
  );

  return response?.data?.routes?.[0] || null;
}

async function fetchProbeTraffic(location, origin) {
  const destinationCandidates = buildDestinationCandidates(location);
  const errors = [];

  for (const destination of destinationCandidates) {
    try {
      const route = await fetchRoute({
        origin,
        destination,
        routingPreference: 'TRAFFIC_AWARE',
        fieldMask: 'routes.duration,routes.staticDuration,routes.distanceMeters',
      });

      if (!route) {
        throw new Error('no_route_found');
      }

      const durationSeconds = parseDurationSeconds(route.duration);
      let staticDurationSeconds = parseDurationSeconds(route.staticDuration);

      if (!durationSeconds) {
        throw new Error('missing_duration');
      }

      if (!staticDurationSeconds) {
        staticDurationSeconds = Math.max(1, durationSeconds * 0.82);
      }

      const normalizedIndex = trafficFromDuration(durationSeconds, staticDurationSeconds || durationSeconds);

      return {
        origin_label: origin.label,
        destination_label: destination.label,
        index: Number(normalizedIndex.toFixed(4)),
        congestion_ratio: Number((durationSeconds / Math.max(1, staticDurationSeconds || durationSeconds)).toFixed(4)),
        durationSeconds,
        staticDurationSeconds: staticDurationSeconds || durationSeconds,
        distanceMeters: Number(route.distanceMeters || 0),
      };
    } catch (error) {
      errors.push(formatProbeFailure(error));
    }
  }

  throw new Error(`no_destination_route:${errors.slice(0, 2).join('|') || 'unknown'}`);
}

async function fetchGoogleTraffic(location) {
  const origins = buildNearbyOrigins(location);
  const probeResults = await Promise.allSettled(origins.map((origin) => fetchProbeTraffic(location, origin)));
  const successful = probeResults
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);

  if (!successful.length) {
    const reasons = probeResults
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason?.message || formatProbeFailure(result.reason))
      .slice(0, 3)
      .join('|');
    throw new Error(`no_probe_success:${reasons || 'unknown'}`);
  }

  const indices = successful.map((entry) => Number(entry.index));
  const worstIndex = Math.max(...indices);
  const averageIndex = indices.reduce((sum, value) => sum + value, 0) / indices.length;
  const representative = successful.reduce((max, entry) => (entry.index > max.index ? entry : max), successful[0]);

  return buildPayload({
    source: 'google-routes-nearby-live',
    normalizedIndex: worstIndex,
    durationSeconds: representative.durationSeconds,
    staticDurationSeconds: representative.staticDurationSeconds,
    distanceMeters: representative.distanceMeters,
    sourceReason: null,
    probe_count: successful.length,
    aggregation: 'worst_case_nearby',
    probe_indices: indices,
    average_index: Number(averageIndex.toFixed(4)),
  });
}

async function getLocationTraffic(location, options = {}) {
  const { refresh = false } = options;
  const cacheKey = `traffic:${location.id}`;

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

  if (env.GOOGLE_MAPS_API_KEY) {
    try {
      payload = await fetchGoogleTraffic(location);
    } catch (error) {
      const status = error?.response?.status;
      const statusText = error?.response?.statusText;
      const code = error?.code;
      const message = error?.message;
      const apiMessage = error?.response?.data?.error?.message;
      let apiDetails = '';
      try {
        apiDetails = error?.response?.data ? JSON.stringify(error.response.data).slice(0, 220) : '';
      } catch {
        apiDetails = '';
      }
      fallbackReason = truncate(`google_routes_failed${status ? `:${status}` : ''}${statusText ? `:${statusText}` : ''}${code ? `:${code}` : ''}${message ? `:${message}` : ''}${apiMessage ? `:${apiMessage}` : ''}${apiDetails ? `:${apiDetails}` : ''}`);
      payload = null;
    }
  } else {
    fallbackReason = 'google_routes_skipped:missing_google_maps_api_key';
  }

  if (!payload) {
    try {
      payload = await fetchEstimatedTrafficFromOpenAI(location);
      if (payload && fallbackReason) {
        payload.source_reason = fallbackReason;
      }
    } catch (error) {
      const openaiReason = error?.message ? `openai_traffic_failed:${error.message}` : 'openai_traffic_failed';
      fallbackReason = truncate(fallbackReason ? `${fallbackReason} | ${openaiReason}` : openaiReason);
      payload = null;
    }
  }

  if (!payload) {
    const fallbackPayload = {
      source: 'historical-synthetic',
      source_reason: fallbackReason,
      fetched_at: new Date().toISOString(),
      normalized_index: null,
      congestion_ratio: null,
      duration_seconds: null,
      baseline_duration_seconds: null,
      distance_meters: null,
    };

    await setCache(cacheKey, fallbackPayload, Math.min(180, env.GOOGLE_TRAFFIC_CACHE_TTL_SECONDS));
    writeLocalCache(cacheKey, fallbackPayload);
    return fallbackPayload;
  }

  await setCache(cacheKey, payload, env.GOOGLE_TRAFFIC_CACHE_TTL_SECONDS);
  writeLocalCache(cacheKey, payload);
  return payload;
}

module.exports = {
  getLocationTraffic,
};
