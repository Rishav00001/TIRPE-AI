const axios = require('axios');
const env = require('../config/env');
const { generateTextAnswer } = require('./aiService');

const routesClient = axios.create({
  baseURL: env.GOOGLE_ROUTES_API_URL,
  timeout: 8_000,
});

const mapsGeocodeClient = axios.create({
  baseURL: 'https://maps.googleapis.com',
  timeout: 8_000,
});

const DEPARTURE_LEAD_MINUTES = 5;
const USER_LOCATION_MAX_DISTANCE_KM = 50;
const MONITORED_DESTINATIONS = [
  {
    key: 'vaishno_devi',
    aliases: ['vaishno devi', 'katra', 'vaishnodevi'],
    label: 'Vaishno Devi, Katra',
    latitude: 33.0302,
    longitude: 74.9499,
  },
  {
    key: 'bahu_fort',
    aliases: ['bahu fort', 'bahufort'],
    label: 'Bahu Fort, Jammu',
    latitude: 32.7266,
    longitude: 74.857,
  },
  {
    key: 'patnitop',
    aliases: ['patnitop', 'patni top', 'patni-top'],
    label: 'Patnitop, Jammu and Kashmir',
    latitude: 33.0846,
    longitude: 75.3301,
  },
  {
    key: 'shiv_khori',
    aliases: ['shiv khori', 'shivkhori'],
    label: 'Shiv Khori, Jammu and Kashmir',
    latitude: 33.2871,
    longitude: 74.9172,
  },
  {
    key: 'raghunath_temple',
    aliases: ['raghunath temple', 'raghunath mandir'],
    label: 'Raghunath Temple, Jammu',
    latitude: 32.7338,
    longitude: 74.8648,
  },
];
const INDIAN_STATE_CAPITALS = {
  andhra_pradesh: 'Amaravati',
  arunachal_pradesh: 'Itanagar',
  assam: 'Dispur',
  bihar: 'Patna',
  chhattisgarh: 'Raipur',
  goa: 'Panaji',
  gujarat: 'Gandhinagar',
  haryana: 'Chandigarh',
  himachal_pradesh: 'Shimla',
  jharkhand: 'Ranchi',
  karnataka: 'Bengaluru',
  kerala: 'Thiruvananthapuram',
  madhya_pradesh: 'Bhopal',
  maharashtra: 'Mumbai',
  manipur: 'Imphal',
  meghalaya: 'Shillong',
  mizoram: 'Aizawl',
  nagaland: 'Kohima',
  odisha: 'Bhubaneswar',
  punjab: 'Chandigarh',
  rajasthan: 'Jaipur',
  sikkim: 'Gangtok',
  tamil_nadu: 'Chennai',
  telangana: 'Hyderabad',
  tripura: 'Agartala',
  uttar_pradesh: 'Lucknow',
  uttarakhand: 'Dehradun',
  west_bengal: 'Kolkata',
  nct_of_delhi: 'New Delhi',
  delhi: 'New Delhi',
  jammu_and_kashmir: 'Srinagar',
  ladakh: 'Leh',
};

const DESTINATION_ALIASES = {
  rajstan: 'rajasthan',
  rajsthan: 'rajasthan',
  rajasthanstate: 'rajasthan',
  rajasthanstateindia: 'rajasthan',
  uttarpradesh: 'uttar_pradesh',
  madhyapradesh: 'madhya_pradesh',
  andhrapradesh: 'andhra_pradesh',
  tamilnadu: 'tamil_nadu',
  westbengal: 'west_bengal',
  jammuandkashmir: 'jammu_and_kashmir',
  nctdelhi: 'nct_of_delhi',
};

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

function toFutureDepartureTime() {
  return new Date(Date.now() + DEPARTURE_LEAD_MINUTES * 60 * 1000).toISOString();
}

function cleanPlace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function hasTravelTimeIntent(text) {
  return /\b(how much time|how long|travel time|time to reach|reach|cab|drive|eta|minutes?|hours?|approx|kitna|kitne)\b/i
    .test(cleanPlace(text));
}

function hasPlanningIntent(text) {
  return /\b(best time|when is|crowd|risk|safe|safety|forecast|mitigation|sustainability|news|concern|advisory)\b/i
    .test(cleanPlace(text));
}

function isCurrentLocationPhrase(text) {
  return /\b(my location|current location|from here|here|my current location)\b/i.test(cleanPlace(text));
}

function normalizeLooseKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function normalizeStateKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function stripDestinationNoise(text) {
  const cleaned = cleanPlace(text);
  if (!cleaned) {
    return '';
  }

  const reduced = cleaned
    .replace(/\b(which|that)\b.*$/i, '')
    .replace(/\b(use|using)\b.*$/i, '')
    .replace(/\bfrom my current location\b.*$/i, '')
    .replace(/\bright now\b.*$/i, '')
    .replace(/\bplease\b.*$/i, '')
    .replace(/[?.!]+$/g, '')
    .trim();

  return reduced || cleaned;
}

function mapDestinationToCanonical(destinationText) {
  const stripped = stripDestinationNoise(destinationText);
  if (!stripped) {
    return null;
  }

  const lower = stripped.toLowerCase();
  const monitored = MONITORED_DESTINATIONS.find((entry) => entry.aliases.some((alias) => lower.includes(alias)));
  if (monitored) {
    return {
      canonicalQuery: monitored.label,
      destinationLabel: monitored.label,
      normalizedType: 'monitored-location',
      fixedCoords: {
        latitude: monitored.latitude,
        longitude: monitored.longitude,
      },
    };
  }

  const looseKey = normalizeLooseKey(stripped);
  const aliasResolved = DESTINATION_ALIASES[looseKey] || stripDestinationNoise(stripped).toLowerCase();
  const stateKey = normalizeStateKey(aliasResolved);
  const stateCapital = INDIAN_STATE_CAPITALS[stateKey];

  if (stateCapital) {
    const stateName = stateKey.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
    return {
      canonicalQuery: `${stateCapital}, ${stateName}, India`,
      destinationLabel: `${stateName} (state via ${stateCapital})`,
      normalizedType: 'state-capital',
    };
  }

  if (!/india/i.test(stripped) && !/,/.test(stripped)) {
    return {
      canonicalQuery: `${stripped}, India`,
      destinationLabel: stripped,
      normalizedType: 'place-india',
    };
  }

  return {
    canonicalQuery: stripped,
    destinationLabel: stripped,
    normalizedType: 'place-raw',
  };
}

function hasImplicitRouteIntent(text) {
  const normalized = cleanPlace(text).toLowerCase();
  if (!normalized) {
    return false;
  }

  return /\b(how much time|how long|time to reach|travel time|eta|reach this site|reach there|go there|travel there|cab time)\b/.test(normalized);
}

function hasCurrentLocationIntent(text) {
  return /(where am i|where i am|my current location|current location|meri location|main kaha hu|mai kaha hu|where am i now)/i
    .test(cleanPlace(text).toLowerCase());
}

function parseJsonObject(text) {
  if (!text) {
    throw new Error('AI response text was empty');
  }

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start === -1 || end <= start) {
      throw new Error('AI response did not include JSON');
    }

    return JSON.parse(text.slice(start, end + 1));
  }
}

function extractRouteIntent(question) {
  const text = cleanPlace(question);
  if (!text) {
    return null;
  }

  const timeIntent = hasTravelTimeIntent(text);
  if (!timeIntent) {
    return null;
  }

  let match = text.match(/from\s+(.+?)\s+to\s+(.+?)(?:[\?\.\!]|$)/i);
  if (match) {
    return {
      origin: cleanPlace(match[1]),
      destination: cleanPlace(match[2]),
      detected_by: 'from_to',
    };
  }

  match = text.match(/reach\s+(.+?)\s+from\s+(.+?)(?:[\?\.\!]|$)/i);
  if (match) {
    return {
      origin: cleanPlace(match[2]),
      destination: cleanPlace(match[1]),
      detected_by: 'reach_from',
    };
  }

  match = text.match(/(.+?)\s+to\s+(.+?)(?:[\?\.\!]|$)/i);
  if (match) {
    const originCandidate = cleanPlace(match[1]);
    const destinationCandidate = cleanPlace(match[2]);
    const noisyOrigin = /\b(when|best|crowd|risk|safe|safety|forecast|mitigation|sustainability|news|concern|go)\b/i
      .test(originCandidate);
    if (noisyOrigin || originCandidate.split(' ').length > 6) {
      return {
        origin: '',
        destination: destinationCandidate,
        detected_by: 'to_destination_only',
      };
    }

    return {
      origin: originCandidate,
      destination: destinationCandidate,
      detected_by: 'to_pattern',
    };
  }

  match = text.match(/\b(?:go|travel|reach)\s+to\s+(.+?)(?:[\?\.\!]|$)/i);
  if (match) {
    return {
      origin: '',
      destination: cleanPlace(match[1]),
      detected_by: 'verb_to_destination',
    };
  }

  return null;
}

async function extractRouteIntentWithAI(question, selectedLocationName = '') {
  const systemPrompt = [
    'You extract route-intent fields from a user question.',
    'Return strict JSON only with keys:',
    'is_route_query (boolean), origin (string|null), destination (string|null).',
    'If the question asks travel time to a place, set is_route_query=true and fill destination.',
    'If current location is implied, keep origin null.',
  ].join(' ');

  const userPrompt = [
    `question=${cleanPlace(question)}`,
    `selected_location=${cleanPlace(selectedLocationName || '') || 'none'}`,
  ].join('\n');

  const raw = await generateTextAnswer({
    systemPrompt,
    userPrompt,
    maxOutputTokens: 180,
  });
  const parsed = parseJsonObject(raw);

  if (!parsed || parsed.is_route_query !== true) {
    return null;
  }

  const destination = cleanPlace(parsed.destination || '');
  const origin = cleanPlace(parsed.origin || '');
  if (!destination) {
    return null;
  }

  return {
    origin,
    destination,
    detected_by: 'ai_intent',
  };
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function haversineKm(a, b) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(Number(b.latitude) - Number(a.latitude));
  const dLon = toRadians(Number(b.longitude) - Number(a.longitude));
  const lat1 = toRadians(Number(a.latitude));
  const lat2 = toRadians(Number(b.latitude));

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const c = 2 * Math.atan2(
    Math.sqrt(sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon),
    Math.sqrt(1 - (sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon)),
  );

  return earthRadiusKm * c;
}

function normalizeUserLocation(raw) {
  const latitude = Number(raw?.latitude);
  const longitude = Number(raw?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy_m: Number.isFinite(Number(raw?.accuracy_m)) ? Number(raw.accuracy_m) : null,
  };
}

async function geocodeAddress(address) {
  const response = await mapsGeocodeClient.get('/maps/api/geocode/json', {
    params: {
      address,
      key: env.GOOGLE_MAPS_API_KEY,
      region: 'in',
    },
  });

  const status = response?.data?.status;
  if (status !== 'OK') {
    const message = response?.data?.error_message || status || 'GEOCODE_FAILED';
    throw new Error(`geocode_failed:${message}`);
  }

  const candidate = response?.data?.results?.[0];
  const location = candidate?.geometry?.location;
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    throw new Error('geocode_failed:invalid_coordinates');
  }

  return {
    query: address,
    formatted_address: candidate.formatted_address || address,
    latitude: Number(location.lat),
    longitude: Number(location.lng),
  };
}

async function reverseGeocode(latitude, longitude) {
  const response = await mapsGeocodeClient.get('/maps/api/geocode/json', {
    params: {
      latlng: `${latitude},${longitude}`,
      key: env.GOOGLE_MAPS_API_KEY,
      region: 'in',
    },
  });

  const status = response?.data?.status;
  if (status !== 'OK') {
    const message = response?.data?.error_message || status || 'REVERSE_GEOCODE_FAILED';
    throw new Error(`reverse_geocode_failed:${message}`);
  }

  const candidate = response?.data?.results?.[0];
  if (!candidate?.formatted_address) {
    throw new Error('reverse_geocode_failed:no_formatted_address');
  }

  return candidate.formatted_address;
}

async function computeTrafficAwareRoute(origin, destination) {
  const response = await routesClient.post(
    '/directions/v2:computeRoutes',
    {
      origin: {
        location: {
          latLng: {
            latitude: origin.latitude,
            longitude: origin.longitude,
          },
        },
      },
      destination: {
        location: {
          latLng: {
            latitude: destination.latitude,
            longitude: destination.longitude,
          },
        },
      },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      departureTime: toFutureDepartureTime(),
      computeAlternativeRoutes: false,
      units: 'METRIC',
      languageCode: 'en-US',
    },
    {
      headers: {
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.staticDuration',
      },
    },
  );

  const route = response?.data?.routes?.[0];
  if (!route) {
    throw new Error('routes_failed:no_route_found');
  }

  const durationSeconds = parseDurationSeconds(route.duration);
  if (!durationSeconds) {
    throw new Error('routes_failed:missing_duration');
  }

  const staticDurationSeconds = parseDurationSeconds(route.staticDuration) || Math.max(1, durationSeconds * 0.82);
  const distanceKm = Number((Number(route.distanceMeters || 0) / 1000).toFixed(1));
  const trafficIndex = Math.max(0, Math.min(1, (durationSeconds / staticDurationSeconds - 1)));

  return {
    source: 'google-routes-live',
    duration_minutes: Math.max(1, Math.round(durationSeconds / 60)),
    distance_km: distanceKm,
    traffic_index: Number(trafficIndex.toFixed(4)),
  };
}

async function estimateRouteFromOpenAI(originText, destinationText) {
  const systemPrompt = [
    'You estimate road travel time between two places in India.',
    'Return JSON only with keys: duration_minutes, distance_km, confidence_score.',
    'Numbers only, no markdown.',
  ].join(' ');

  const userPrompt = [
    `origin=${originText}`,
    `destination=${destinationText}`,
    'Estimate current cab travel duration under normal city traffic.',
  ].join('\n');

  const text = await generateTextAnswer({
    systemPrompt,
    userPrompt,
    maxOutputTokens: 220,
  });

  const parsed = parseJsonObject(text);
  return {
    source: 'openai-estimated-route',
    duration_minutes: Math.max(1, Math.round(Number(parsed.duration_minutes || 90))),
    distance_km: Number(Number(parsed.distance_km || 45).toFixed(1)),
    traffic_index: null,
    confidence_score: Number(Math.max(0.1, Math.min(0.99, Number(parsed.confidence_score || 0.5))).toFixed(4)),
  };
}

function formatRouteAnswer(routeResult, language = 'en') {
  const duration = routeResult.duration_minutes;
  const distance = routeResult.distance_km;
  const source = routeResult.source;
  const usingUserLocation = Boolean(routeResult.user_location_used);
  const userDistance = Number(routeResult.user_location_distance_km || 0);
  const destinationLabel = cleanPlace(routeResult.destination_label || routeResult.destination || '');

  if (language === 'hi') {
    if (source === 'google-routes-live') {
      return `${usingUserLocation ? `आपकी वर्तमान लोकेशन (लगभग ${userDistance.toFixed(1)} किमी के दायरे में) के आधार पर ` : ''}${destinationLabel ? `${destinationLabel} तक ` : ''}Google Maps live ट्रैफिक के आधार पर अनुमानित समय लगभग ${duration} मिनट है (लगभग ${distance} किमी)।`;
    }

    return `${destinationLabel ? `${destinationLabel} तक ` : ''}अनुमानित यात्रा समय लगभग ${duration} मिनट है (लगभग ${distance} किमी)।`;
  }

  if (source === 'google-routes-live') {
    return `${usingUserLocation ? `Using your current location (within ${userDistance.toFixed(1)} km), ` : ''}${destinationLabel ? `to ${destinationLabel}, ` : ''}based on Google Maps live traffic, the approximate cab travel time is about ${duration} minutes (around ${distance} km).`;
  }

  return `${destinationLabel ? `To ${destinationLabel}, ` : ''}the approximate cab travel time is about ${duration} minutes (around ${distance} km).`;
}

function appendReason(base, next) {
  if (!next) {
    return base || null;
  }
  return base ? `${base} | ${next}` : next;
}

async function tryResolveCurrentLocation(question, language = 'en', options = {}) {
  const { userLocation } = options;

  if (!hasCurrentLocationIntent(question)) {
    return null;
  }

  const normalizedUserLocation = normalizeUserLocation(userLocation);
  if (!normalizedUserLocation) {
    return {
      handled: true,
      mode: 'location-unavailable',
      answer: language === 'hi'
        ? 'आपकी वर्तमान लोकेशन नहीं मिल पाई। कृपया browser location अनुमति चालू करें।'
        : 'I cannot read your current device location right now. Please allow browser location access.',
      location: null,
      failure_reason: 'user_location_unavailable',
    };
  }

  let address = null;
  let failureReason = null;

  if (env.GOOGLE_MAPS_API_KEY) {
    try {
      address = await reverseGeocode(normalizedUserLocation.latitude, normalizedUserLocation.longitude);
    } catch (error) {
      failureReason = error?.message || 'reverse_geocode_failed';
    }
  } else {
    failureReason = 'reverse_geocode_skipped:missing_google_maps_api_key';
  }

  const lat = normalizedUserLocation.latitude.toFixed(5);
  const lng = normalizedUserLocation.longitude.toFixed(5);
  const answer = language === 'hi'
    ? address
      ? `आपकी डिवाइस GPS के अनुसार आप अभी: ${address} के पास हैं। (lat ${lat}, lng ${lng})`
      : `आपकी डिवाइस GPS के अनुसार आपके वर्तमान निर्देशांक हैं: lat ${lat}, lng ${lng}।`
    : address
      ? `Based on your device GPS, you are currently near: ${address}. (lat ${lat}, lng ${lng})`
      : `Based on your device GPS, your current coordinates are: lat ${lat}, lng ${lng}.`;

  return {
    handled: true,
    mode: 'location-live',
    answer,
    location: {
      latitude: normalizedUserLocation.latitude,
      longitude: normalizedUserLocation.longitude,
      address,
      accuracy_m: normalizedUserLocation.accuracy_m,
    },
    failure_reason: failureReason,
  };
}

async function tryResolveLiveRoute(question, language = 'en', options = {}) {
  const { userLocation, selectedLocation, mapsOnly = false } = options;
  const normalizedUserLocation = normalizeUserLocation(userLocation);
  let intent = extractRouteIntent(question);
  const timeIntent = hasTravelTimeIntent(question);
  const implicitRouteIntent = hasImplicitRouteIntent(question);
  const planningIntent = hasPlanningIntent(question);

  if (!intent && timeIntent) {
    try {
      intent = await extractRouteIntentWithAI(question, selectedLocation?.location_name || '');
    } catch {
      intent = null;
    }
  }

  if (!intent && (!timeIntent || !implicitRouteIntent)) {
    return null;
  }

  if (planningIntent && intent?.detected_by === 'to_pattern') {
    return null;
  }

  if (intent?.detected_by === 'to_pattern' && !timeIntent) {
    return null;
  }

  const originText = cleanPlace(intent?.origin || '');
  const destinationText = cleanPlace(intent?.destination || selectedLocation?.location_name || '');
  const destinationCanonical = mapDestinationToCanonical(destinationText);
  const canUseSelectedDestination = Number.isFinite(Number(selectedLocation?.latitude))
    && Number.isFinite(Number(selectedLocation?.longitude));

  if ((!originText && !normalizedUserLocation) || (!destinationText && !canUseSelectedDestination)) {
    return null;
  }

  let routeResult = null;
  let failureReason = null;
  let userLocationUsed = false;
  let userLocationDistanceKm = null;

  if (env.GOOGLE_MAPS_API_KEY) {
    try {
      const resolvedDestination = canUseSelectedDestination && !intent?.destination
        ? {
          query: selectedLocation.location_name,
          formatted_address: selectedLocation.location_name,
          latitude: Number(selectedLocation.latitude),
          longitude: Number(selectedLocation.longitude),
          destination_label: selectedLocation.location_name,
        }
        : destinationCanonical?.fixedCoords
          ? {
            query: destinationCanonical.canonicalQuery,
            formatted_address: destinationCanonical.destinationLabel,
            latitude: Number(destinationCanonical.fixedCoords.latitude),
            longitude: Number(destinationCanonical.fixedCoords.longitude),
            destination_label: destinationCanonical.destinationLabel,
          }
          : await geocodeAddress(destinationCanonical?.canonicalQuery || destinationText);

      resolvedDestination.destination_label = destinationCanonical?.destinationLabel || destinationText || resolvedDestination.formatted_address;

      let resolvedOrigin = null;
      if (normalizedUserLocation) {
        const nearDestinationKm = haversineKm(normalizedUserLocation, resolvedDestination);
        userLocationDistanceKm = Number(nearDestinationKm.toFixed(2));
        const explicitCurrentLocationOrigin = isCurrentLocationPhrase(originText) || !originText;
        if (nearDestinationKm <= USER_LOCATION_MAX_DISTANCE_KM || explicitCurrentLocationOrigin) {
          resolvedOrigin = {
            query: 'device_current_location',
            formatted_address: 'Current location (device GPS)',
            latitude: normalizedUserLocation.latitude,
            longitude: normalizedUserLocation.longitude,
          };
          userLocationUsed = true;
        } else {
          failureReason = appendReason(failureReason, `user_location_out_of_range_km:${userLocationDistanceKm}`);
        }
      }

      if (!resolvedOrigin) {
        if (originText) {
          resolvedOrigin = await geocodeAddress(originText);
        } else {
          throw new Error('origin_unavailable');
        }
      }

      routeResult = await computeTrafficAwareRoute(resolvedOrigin, resolvedDestination);
      routeResult.origin = resolvedOrigin.formatted_address;
      routeResult.destination = resolvedDestination.formatted_address;
      routeResult.destination_label = resolvedDestination.destination_label || resolvedDestination.formatted_address;
      routeResult.user_location_used = userLocationUsed;
      routeResult.user_location_distance_km = userLocationDistanceKm;
    } catch (error) {
      const status = error?.response?.status;
      const apiMessage = error?.response?.data?.error?.message;
      failureReason = appendReason(
        failureReason,
        `google_route_failed${status ? `:${status}` : ''}${apiMessage ? `:${apiMessage}` : ''}${error?.message ? `:${error.message}` : ''}`,
      );
    }
  } else {
    failureReason = appendReason(failureReason, 'google_route_skipped:missing_google_maps_api_key');
  }

  if (!routeResult) {
    if (mapsOnly) {
      return {
        handled: true,
        mode: 'route-maps-unavailable',
        answer: language === 'hi'
          ? 'Maps API strict mode चालू है, लेकिन अभी live route नहीं मिल पाया। कृपया थोड़ी देर में फिर प्रयास करें।'
          : 'Maps API strict mode is enabled, but live route data is currently unavailable. Please try again shortly.',
        route: null,
        failure_reason: appendReason(failureReason, 'maps_strict_mode_no_live_route'),
      };
    }

    try {
      routeResult = await estimateRouteFromOpenAI(
        originText || (userLocationUsed ? 'current user location' : 'unknown origin'),
        destinationCanonical?.destinationLabel || destinationText || selectedLocation?.location_name || 'destination',
      );
      routeResult.destination_label = destinationCanonical?.destinationLabel || destinationText || selectedLocation?.location_name || null;
      routeResult.user_location_used = userLocationUsed;
      routeResult.user_location_distance_km = userLocationDistanceKm;
    } catch (error) {
      failureReason = appendReason(failureReason, `openai_route_failed:${error.message || 'unknown'}`);
    }
  }

  if (!routeResult) {
    return {
      handled: true,
      mode: 'route-fallback',
      answer: language === 'hi'
        ? 'अभी लाइव route समय उपलब्ध नहीं है। कृपया थोड़ी देर में फिर से प्रयास करें।'
        : 'Live route timing is temporarily unavailable. Please try again shortly.',
      route: null,
      failure_reason: failureReason,
    };
  }

  return {
    handled: true,
    mode: routeResult.source === 'google-routes-live' ? 'route-live' : 'route-estimated',
    answer: formatRouteAnswer(routeResult, language),
    route: routeResult,
    failure_reason: failureReason,
  };
}

module.exports = {
  tryResolveLiveRoute,
  tryResolveCurrentLocation,
};
