const db = require('../config/db');

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    username: row.username,
    display_name: row.display_name,
    role: row.role || 'user',
    profile_json: row.profile_json || {},
    last_login_at: row.last_login_at || null,
    created_at: row.created_at,
  };
}

function mapApiKey(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    key_name: row.key_name,
    key_prefix: row.key_prefix,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    is_active: Boolean(row.is_active),
    last_used_at: row.last_used_at || null,
    created_at: row.created_at,
  };
}

async function getUserByUsername(username) {
  const result = await db.query(
    `
      SELECT id, username, password_hash, display_name, role, profile_json, last_login_at, created_at
      FROM auth_users
      WHERE username = $1
      LIMIT 1;
    `,
    [username],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...mapUser(row),
    password_hash: row.password_hash,
  };
}

async function getUserById(userId) {
  const result = await db.query(
    `
      SELECT id, username, display_name, role, profile_json, last_login_at, created_at
      FROM auth_users
      WHERE id = $1
      LIMIT 1;
    `,
    [userId],
  );

  return mapUser(result.rows[0]);
}

async function createUser({
  username,
  passwordHash,
  displayName = null,
  role = 'user',
  profileJson = {},
}) {
  const result = await db.query(
    `
      INSERT INTO auth_users (username, password_hash, display_name, role, profile_json)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, username, display_name, role, profile_json, last_login_at, created_at;
    `,
    [username, passwordHash, displayName, role, JSON.stringify(profileJson || {})],
  );

  return mapUser(result.rows[0]);
}

async function touchUserLogin(userId) {
  await db.query(
    `
      UPDATE auth_users
      SET last_login_at = NOW(),
          updated_at = NOW()
      WHERE id = $1;
    `,
    [userId],
  );
}

async function createApiKey({
  userId,
  keyName,
  keyPrefix,
  keyHash,
  scopes = ['risk.read', 'predict.write'],
}) {
  const result = await db.query(
    `
      INSERT INTO api_keys (user_id, key_name, key_prefix, key_hash, scopes)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, user_id, key_name, key_prefix, scopes, is_active, last_used_at, created_at;
    `,
    [userId, keyName, keyPrefix, keyHash, JSON.stringify(scopes)],
  );

  return mapApiKey(result.rows[0]);
}

async function listApiKeysByUser(userId) {
  const result = await db.query(
    `
      SELECT id, user_id, key_name, key_prefix, scopes, is_active, last_used_at, created_at
      FROM api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `,
    [userId],
  );

  return result.rows.map(mapApiKey);
}

async function getApiKeyByHash(keyHash) {
  const result = await db.query(
    `
      SELECT id, user_id, key_name, key_prefix, key_hash, scopes, is_active, last_used_at, created_at
      FROM api_keys
      WHERE key_hash = $1
      LIMIT 1;
    `,
    [keyHash],
  );

  return result.rows[0] || null;
}

async function markApiKeyUsed(apiKeyId) {
  await db.query(
    `
      UPDATE api_keys
      SET last_used_at = NOW(),
          updated_at = NOW()
      WHERE id = $1;
    `,
    [apiKeyId],
  );
}

async function revokeApiKey({ apiKeyId, userId }) {
  const result = await db.query(
    `
      UPDATE api_keys
      SET is_active = FALSE,
          updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
      RETURNING id;
    `,
    [apiKeyId, userId],
  );

  return Boolean(result.rows[0]);
}

module.exports = {
  getUserByUsername,
  getUserById,
  createUser,
  touchUserLogin,
  createApiKey,
  listApiKeysByUser,
  getApiKeyByHash,
  markApiKeyUsed,
  revokeApiKey,
};
