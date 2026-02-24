const { config } = require('dotenv');
const { z } = require('zod');

config();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return value;
}, z.boolean());

const optionalNumberFromEnv = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}, z.number().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().optional(),
  AI_PROVIDER: z.enum(['local', 'openai']).default('local'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(3500),
  OPENAI_BASE_URL: z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return undefined;
    }
    return value;
  }, z.string().url().optional()),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(600),
  WEATHER_API_KEY: z.string().optional(),
  WEATHER_API_BASE_URL: z.string().url().default('https://api.openweathermap.org'),
  WEATHER_SOURCE_MODE: z.enum(['openai', 'openweather', 'auto']).default('openai'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  GOOGLE_ROUTES_API_URL: z.string().url().default('https://routes.googleapis.com'),
  GOOGLE_TRAFFIC_ORIGIN_LAT: optionalNumberFromEnv,
  GOOGLE_TRAFFIC_ORIGIN_LNG: optionalNumberFromEnv,
  GOOGLE_TRAFFIC_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  FEATURE_CHATBOT_ENABLED: booleanFromEnv.default(true),
  FEATURE_DISASTER_ALERT_MODE: booleanFromEnv.default(false),
  FEATURE_SCAM_HOTSPOT_SIM: booleanFromEnv.default(false),
  CHAT_MEMORY_MAX_TURNS: z.coerce.number().int().min(2).max(50).default(12),
  AUTH_TOKEN_SECRET: z.string().min(16).default('change-this-auth-token-secret'),
  AUTH_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  API_KEY_PREFIX: z.string().min(4).max(24).default('tirpe_live'),
  ADMIN_USERNAMES: z.string().default('admin'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const formatted = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment variables:\n${formatted.join('\n')}`);
}

module.exports = parsed.data;
