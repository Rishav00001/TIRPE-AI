const env = require('./env');

module.exports = {
  aiProvider: env.AI_PROVIDER,
  chatbotEnabled: env.FEATURE_CHATBOT_ENABLED,
  disasterAlertMode: env.FEATURE_DISASTER_ALERT_MODE,
  scamHotspotSimulation: env.FEATURE_SCAM_HOTSPOT_SIM,
};
