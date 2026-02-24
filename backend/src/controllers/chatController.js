const env = require('../config/env');
const features = require('../config/features');
const { getConversation, appendConversationMessage } = require('../services/chatMemoryService');
const { answerOperationalQuestion } = require('../services/chatService');
const { appendLog } = require('../services/opsLogService');
const { normalizeLanguage } = require('../utils/language');

async function askChatbot(req, res) {
  if (!features.chatbotEnabled) {
    return res.status(403).json({
      error: 'FeatureDisabled',
      message: 'Chatbot feature is disabled by runtime configuration.',
    });
  }

  const {
    message,
    session_id: requestedSessionId,
    page,
    location_id: locationId,
    language: requestedLanguage,
    route_mode: routeMode,
    user_location: userLocation,
  } = req.body;
  const language = normalizeLanguage(requestedLanguage);

  const { sessionId, messages } = await getConversation(requestedSessionId);
  const memoryWithUser = [
    ...messages,
    {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    },
  ];

  const reply = await answerOperationalQuestion({
    question: message,
    page,
    locationId,
    language,
    routeMode: routeMode || 'hybrid',
    userLocation,
    memoryMessages: memoryWithUser,
  });

  await appendConversationMessage(sessionId, { role: 'user', content: message });
  const updated = await appendConversationMessage(sessionId, {
    role: 'assistant',
    content: reply.answer,
  });

  appendLog({
    level: reply.mode === 'fallback' ? 'WARN' : 'INFO',
    scope: 'chat',
    message: 'Copilot response generated',
    meta: {
      page: page || 'dashboard',
      location_id: locationId || null,
      mode: reply.mode,
      session_id: sessionId,
      language,
      route_source: reply.route?.source || null,
      route_failure_reason: reply.failure_reason || null,
      route_mode: routeMode || 'hybrid',
      route_user_location_used: Boolean(reply.route?.user_location_used),
    },
  });

  return res.json({
    data: {
      session_id: sessionId,
      answer: reply.answer,
      mode: reply.mode,
      ai_provider: env.AI_PROVIDER,
      language,
      memory_turns: Math.floor(updated.messages.length / 2),
      context: {
        average_risk_score: reply.contextSummary.average_risk_score,
        top_locations: reply.contextSummary.highest_risk_locations,
      },
    },
  });
}

module.exports = {
  askChatbot,
};
