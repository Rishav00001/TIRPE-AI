const crypto = require('crypto');
const { generateTextAnswer } = require('../services/aiService');
const { SUPPORTED_LANGUAGES, getLanguageName } = require('../utils/language');

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const packCache = new Map();

function normalizeEntries(entries) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    return {};
  }

  const normalized = {};
  for (const [key, value] of Object.entries(entries)) {
    const safeKey = String(key || '').trim();
    if (!safeKey) {
      continue;
    }
    normalized[safeKey] = String(value ?? '');
  }
  return normalized;
}

function parseJsonObject(text) {
  if (!text) {
    throw new Error('Translation response was empty');
  }

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('Translation response did not include JSON object');
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function hashEntries(language, entries) {
  const hash = crypto.createHash('sha256');
  hash.update(`${language}::${JSON.stringify(entries)}`);
  return hash.digest('hex');
}

function getCached(cacheKey) {
  const item = packCache.get(cacheKey);
  if (!item) {
    return null;
  }

  if (Date.now() > item.expiresAt) {
    packCache.delete(cacheKey);
    return null;
  }

  return item.payload;
}

function setCached(cacheKey, payload) {
  packCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function mergeSafe(baseEntries, translatedEntries) {
  const merged = {};
  for (const [key, sourceValue] of Object.entries(baseEntries)) {
    const translated = translatedEntries?.[key];
    merged[key] = typeof translated === 'string' && translated.trim()
      ? translated
      : sourceValue;
  }
  return merged;
}

async function buildTranslatedPack(language, entries) {
  const targetLanguageName = getLanguageName(language);
  const systemPrompt = [
    'You are a UI localization engine.',
    'Translate each JSON value into the target language while keeping keys unchanged.',
    'Keep product names and technical keywords unchanged when appropriate: TIRPE, AQI, API, OpenAI, Mapbox, Google Maps.',
    'Return strict JSON object only.',
  ].join(' ');

  const userPrompt = [
    `Target language: ${targetLanguageName} (${language})`,
    'Input JSON object (keys must remain exactly same):',
    JSON.stringify(entries),
  ].join('\n\n');

  const raw = await generateTextAnswer({
    systemPrompt,
    userPrompt,
    maxOutputTokens: 5000,
  });

  const parsed = parseJsonObject(raw);
  return mergeSafe(entries, parsed);
}

async function translateUiPack(req, res) {
  const language = String(req.body.language || '').trim().toLowerCase();
  const refresh = req.body.refresh === true;
  const entries = normalizeEntries(req.body.entries);

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Unsupported language',
    });
  }

  const keys = Object.keys(entries);
  if (!keys.length) {
    return res.json({
      data: {
        language,
        entries: {},
        source: 'empty',
      },
    });
  }

  if (language === 'en') {
    return res.json({
      data: {
        language,
        entries,
        source: 'identity-en',
      },
    });
  }

  const cacheKey = hashEntries(language, entries);
  if (!refresh) {
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json({
        data: {
          language,
          entries: cached,
          source: 'memory-cache',
        },
      });
    }
  }

  try {
    const translated = await buildTranslatedPack(language, entries);
    setCached(cacheKey, translated);
    return res.json({
      data: {
        language,
        entries: translated,
        source: 'openai-pack',
      },
    });
  } catch (error) {
    return res.json({
      data: {
        language,
        entries,
        source: 'fallback-en',
        degraded_mode: true,
        reason: error.message || 'translation_failed',
      },
    });
  }
}

module.exports = {
  translateUiPack,
};
