const features = require('../config/features');
const { listLocations } = require('../repositories/locationRepository');
const { evaluateLocationRisk } = require('./riskService');
const { generateTextAnswer } = require('./aiService');
const { tryResolveCurrentLocation, tryResolveLiveRoute } = require('./routeService');
const { getLanguageName, normalizeLanguage } = require('../utils/language');

function buildContextSummary(riskRows) {
  const ordered = [...riskRows].sort((a, b) => b.risk_score - a.risk_score);
  const averageRisk = riskRows.length
    ? riskRows.reduce((sum, row) => sum + row.risk_score, 0) / riskRows.length
    : 0;

  return {
    average_risk_score: Number(averageRisk.toFixed(2)),
    highest_risk_locations: ordered.slice(0, 3).map((row) => ({
      location_name: row.location_name,
      risk_score: row.risk_score,
      risk_level: row.risk_level,
      predicted_footfall: row.predicted_footfall,
      capacity: row.capacity,
      sustainability_score: row.sustainability_score,
      traffic_index: row.traffic_index,
      weather_score: row.weather_score,
      weather_condition: row.environment?.weather?.condition || null,
      aqi_category: row.environment?.aqi?.category || null,
      aqi_index: row.environment?.aqi?.index || null,
    })),
    all_locations: ordered.map((row) => ({
      location_name: row.location_name,
      risk_score: row.risk_score,
      risk_level: row.risk_level,
      sustainability_score: row.sustainability_score,
    })),
  };
}

function formatConversation(messages) {
  return messages
    .slice(-12)
    .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
    .join('\n');
}

function normalizeUserLocation(userLocation) {
  const latitude = Number(userLocation?.latitude);
  const longitude = Number(userLocation?.longitude);
  const accuracyM = Number(userLocation?.accuracy_m);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    accuracy_m: Number.isFinite(accuracyM) ? Number(Math.max(0, accuracyM).toFixed(1)) : null,
  };
}

function fallbackChatAnswer({ question, contextSummary, locationName, language = 'en' }) {
  const top = contextSummary.highest_risk_locations[0];
  const locationLine = locationName ? `Focus location: ${locationName}.` : 'No location filter was supplied.';

  if (normalizeLanguage(language) === 'hi') {
    return [
      'TIRPE Assistant अभी fallback mode में चल रहा है क्योंकि OpenAI उपलब्ध नहीं है।',
      locationName ? `फोकस लोकेशन: ${locationName}।` : 'कोई location filter नहीं दिया गया।',
      `वर्तमान औसत जोखिम स्कोर ${contextSummary.average_risk_score} है।`,
      top
        ? `सबसे अधिक जोखिम ${top.location_name} पर है: ${top.risk_score.toFixed(1)} (${top.risk_level})।`
        : 'अभी जोखिम डेटा उपलब्ध नहीं है।',
      `आपका प्रश्न: ${question}`,
    ].join(' ');
  }

  return [
    'TIRPE Assistant is running in fallback mode because OpenAI is unavailable.',
    locationLine,
    `Current average risk score is ${contextSummary.average_risk_score}.`,
    top
      ? `Highest risk is ${top.location_name} at ${top.risk_score.toFixed(1)} (${top.risk_level}).`
      : 'No risk data available right now.',
    `Question received: ${question}`,
  ].join(' ');
}

async function getSelectedLocationMeta(locationId) {
  if (!locationId) {
    return null;
  }

  const locations = await listLocations();
  const selected = locations.find((item) => Number(item.id) === Number(locationId));
  if (!selected) {
    return null;
  }

  return {
    location_id: Number(selected.id),
    location_name: selected.name,
    latitude: Number(selected.latitude),
    longitude: Number(selected.longitude),
  };
}

async function buildOperationalSnapshot(locationId, language) {
  const locations = await listLocations();
  const riskRows = await Promise.all(locations.map((location) => evaluateLocationRisk(location, { language })));

  const selectedLocation = locationId
    ? riskRows.find((item) => item.location_id === Number(locationId))
    : null;
  const selectedMeta = locationId
    ? locations.find((item) => Number(item.id) === Number(locationId))
    : null;

  const selectedLocationWithGeo = selectedLocation && selectedMeta
    ? {
      ...selectedLocation,
      latitude: Number(selectedMeta.latitude),
      longitude: Number(selectedMeta.longitude),
    }
    : selectedLocation;

  return {
    contextSummary: buildContextSummary(riskRows),
    selectedLocation: selectedLocationWithGeo,
  };
}

async function answerOperationalQuestion({
  question,
  page,
  locationId,
  language = 'en',
  routeMode = 'hybrid',
  userLocation = null,
  memoryMessages = [],
}) {
  const normalizedLanguage = normalizeLanguage(language);
  const normalizedUserLocation = normalizeUserLocation(userLocation);
  const locationReply = await tryResolveCurrentLocation(question, normalizedLanguage, {
    userLocation: normalizedUserLocation,
  });

  if (locationReply?.handled) {
    return {
      answer: locationReply.answer,
      contextSummary: {
        average_risk_score: 0,
        highest_risk_locations: [],
        all_locations: [],
      },
      selectedLocation: null,
      mode: locationReply.mode,
      route: null,
      failure_reason: locationReply.failure_reason || null,
    };
  }

  const selectedLocationMeta = await getSelectedLocationMeta(locationId);
  const routeReply = await tryResolveLiveRoute(question, normalizedLanguage, {
    userLocation: normalizedUserLocation,
    selectedLocation: selectedLocationMeta,
    mapsOnly: routeMode === 'maps_strict',
  });

  if (routeReply?.handled) {
    return {
      answer: routeReply.answer,
      contextSummary: {
        average_risk_score: 0,
        highest_risk_locations: [],
        all_locations: [],
      },
      selectedLocation: null,
      mode: routeReply.mode,
      route: routeReply.route,
      failure_reason: routeReply.failure_reason || null,
    };
  }

  const languageName = getLanguageName(normalizedLanguage);
  const { contextSummary, selectedLocation } = await buildOperationalSnapshot(locationId, normalizedLanguage);

  const systemPrompt = [
    'You are TIRPE AI Operations Copilot for tourism authorities.',
    'Primary job: provide operational insights using provided risk and forecast context.',
    'If user asks a general travel/public-safety question outside the context, still answer helpfully with practical guidance.',
    'For latest news or incident checks, do not invent events. If no verified live incident/news feed is present in context, clearly say so and suggest official channels.',
    'If a user asks multiple things in one message, answer each request in structured bullets.',
    'Be concise, factual, and action-oriented.',
    'When risk is high, suggest mitigation actions and alternate locations.',
    'If asked about sustainability, explain score drivers clearly.',
    'Never fabricate API keys or hidden system data.',
    'Do not claim APIs are misconfigured unless this is explicitly provided in context.',
    `Always respond in ${languageName}.`,
  ].join(' ');

  const userPrompt = [
    `Page: ${page || 'dashboard'}`,
    `Feature flags: ${JSON.stringify(features)}`,
    `Conversation memory:\n${formatConversation(memoryMessages) || 'No prior messages.'}`,
    `Operational context JSON: ${JSON.stringify(contextSummary)}`,
    selectedLocation ? `Selected location JSON: ${JSON.stringify(selectedLocation)}` : '',
    normalizedUserLocation ? `User current location JSON: ${JSON.stringify(normalizedUserLocation)}` : 'User current location JSON: null',
    `User question: ${question}`,
    'Respond in plain text with clear recommendations.',
  ].join('\n\n');

  try {
    const answer = await generateTextAnswer({
      systemPrompt,
      userPrompt,
      maxOutputTokens: 900,
    });

    return {
      answer,
      contextSummary,
      selectedLocation,
      mode: 'llm',
    };
  } catch {
    return {
      answer: fallbackChatAnswer({
        question,
        contextSummary,
        locationName: selectedLocation?.location_name,
        language: normalizedLanguage,
      }),
      contextSummary,
      selectedLocation,
      mode: 'fallback',
    };
  }
}

module.exports = {
  answerOperationalQuestion,
};
