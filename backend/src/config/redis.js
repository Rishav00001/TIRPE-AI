const { createClient } = require('redis');
const env = require('./env');

let redisClient = null;
let redisDisabled = false;

async function connectRedis() {
  if (!env.REDIS_URL || redisDisabled) {
    return null;
  }

  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = createClient({
    url: env.REDIS_URL,
    socket: {
      connectTimeout: 1500,
      reconnectStrategy: false,
    },
  });

  redisClient.on('error', (error) => {
    console.error('Redis error', error.message || 'unavailable');
  });

  try {
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    redisDisabled = true;
    redisClient = null;
    console.warn('Redis disabled for this runtime:', error.message || 'connection failed');
    return null;
  }
}

async function getCache(key) {
  if (!redisClient || !redisClient.isOpen) {
    return null;
  }

  const payload = await redisClient.get(key);
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function setCache(key, value, ttlSeconds = 300) {
  if (!redisClient || !redisClient.isOpen) {
    return;
  }

  await redisClient.set(key, JSON.stringify(value), {
    EX: ttlSeconds,
  });
}

module.exports = {
  connectRedis,
  getCache,
  setCache,
};
