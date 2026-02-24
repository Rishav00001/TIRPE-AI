const crypto = require('crypto');
const env = require('../config/env');

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const normalized = padded + '='.repeat(padLength);
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const [algorithm, salt, digest] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !digest) {
    return false;
  }

  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(digest, 'hex');
  const b = Buffer.from(derived, 'hex');
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

function buildTokenPayload(user) {
  const expiresAt = Date.now() + env.AUTH_TOKEN_TTL_HOURS * 60 * 60 * 1000;
  return {
    sub: Number(user.id),
    username: user.username,
    role: user.role || 'user',
    exp: Math.floor(expiresAt / 1000),
  };
}

function signAuthToken(user) {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };
  const payload = buildTokenPayload(user);
  const headerPart = toBase64Url(JSON.stringify(header));
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = crypto
    .createHmac('sha256', env.AUTH_TOKEN_SECRET)
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const signingInput = `${headerPart}.${payloadPart}`;
  const expectedSignature = crypto
    .createHmac('sha256', env.AUTH_TOKEN_SECRET)
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const a = Buffer.from(signaturePart);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadPart));
    if (!payload?.sub || !payload?.exp) {
      return null;
    }

    if (Date.now() >= Number(payload.exp) * 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function generateApiKey() {
  const random = crypto.randomBytes(24).toString('hex');
  const raw = `${env.API_KEY_PREFIX}_${random}`;
  return {
    raw,
    prefix: raw.slice(0, Math.min(18, raw.length)),
    hash: hashApiKey(raw),
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
  generateApiKey,
  hashApiKey,
};
