const { randomUUID } = require('crypto');
const env = require('../config/env');
const { getCache, setCache } = require('../config/redis');

const inMemoryStore = new Map();
const MEMORY_TTL_SECONDS = 60 * 60 * 24;

function buildMemoryKey(sessionId) {
  return `chat:memory:${sessionId}`;
}

function normalizeSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length < 8) {
    return randomUUID();
  }

  return sessionId.trim();
}

function trimConversation(messages) {
  const maxMessages = Math.max(4, env.CHAT_MEMORY_MAX_TURNS * 2);
  return messages.slice(-maxMessages);
}

async function getConversation(sessionId) {
  const normalizedSession = normalizeSessionId(sessionId);
  const memoryKey = buildMemoryKey(normalizedSession);

  const cached = await getCache(memoryKey);
  if (Array.isArray(cached)) {
    inMemoryStore.set(normalizedSession, cached);
    return {
      sessionId: normalizedSession,
      messages: cached,
    };
  }

  const fallback = inMemoryStore.get(normalizedSession) || [];
  return {
    sessionId: normalizedSession,
    messages: fallback,
  };
}

async function appendConversationMessage(sessionId, message) {
  const { sessionId: normalizedSession, messages } = await getConversation(sessionId);
  const next = trimConversation([
    ...messages,
    {
      role: message.role,
      content: message.content,
      timestamp: new Date().toISOString(),
    },
  ]);

  const memoryKey = buildMemoryKey(normalizedSession);
  await setCache(memoryKey, next, MEMORY_TTL_SECONDS);
  inMemoryStore.set(normalizedSession, next);

  return {
    sessionId: normalizedSession,
    messages: next,
  };
}

module.exports = {
  getConversation,
  appendConversationMessage,
  normalizeSessionId,
};
