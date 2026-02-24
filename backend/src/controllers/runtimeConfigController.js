const features = require('../config/features');
const env = require('../config/env');

function getRuntimeConfig(req, res) {
  const weatherProvider = env.WEATHER_SOURCE_MODE === 'openai'
    ? 'openai-estimated'
    : env.WEATHER_SOURCE_MODE === 'openweather'
      ? 'openweather'
      : 'auto(openweather->openai)';

  res.json({
    data: {
      ai_provider: features.aiProvider,
      ai_model: features.aiProvider === 'openai' ? env.OPENAI_MODEL : 'local-random-forest',
      weather: {
        provider: weatherProvider,
        source_mode: env.WEATHER_SOURCE_MODE,
        base_url: env.WEATHER_API_BASE_URL,
        api_key_configured: Boolean(env.WEATHER_API_KEY),
        openai_key_configured: Boolean(env.OPENAI_API_KEY),
      },
      traffic: {
        provider: 'google-routes-nearby',
        api_base_url: env.GOOGLE_ROUTES_API_URL,
        api_key_configured: Boolean(env.GOOGLE_MAPS_API_KEY),
        openai_fallback_enabled: Boolean(env.OPENAI_API_KEY),
      },
      features: {
        chatbot_enabled: features.chatbotEnabled,
        disaster_alert_mode: features.disasterAlertMode,
        scam_hotspot_simulation: features.scamHotspotSimulation,
      },
      auth: {
        enabled: true,
        token_ttl_hours: env.AUTH_TOKEN_TTL_HOURS,
        admin_usernames: String(env.ADMIN_USERNAMES || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      },
      api_access: {
        enabled: true,
        header: 'x-api-key',
        key_prefix: env.API_KEY_PREFIX,
        external_base_path: '/api/external',
      },
    },
  });
}

module.exports = {
  getRuntimeConfig,
};
