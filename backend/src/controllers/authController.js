const env = require('../config/env');
const {
  getUserByUsername,
  createUser,
  touchUserLogin,
  createApiKey,
  listApiKeysByUser,
  revokeApiKey,
} = require('../repositories/authRepository');
const {
  hashPassword,
  verifyPassword,
  signAuthToken,
  generateApiKey,
} = require('../utils/security');
const { appendLog } = require('../services/opsLogService');

const ADMIN_USERNAMES = new Set(
  String(env.ADMIN_USERNAMES || 'admin')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

function normalizeUserResponse(user) {
  return {
    id: Number(user.id),
    username: user.username,
    display_name: user.display_name || user.username,
    role: user.role || 'user',
    profile_json: user.profile_json || {},
    created_at: user.created_at,
  };
}

function roleForUsername(username) {
  return ADMIN_USERNAMES.has(String(username || '').toLowerCase()) ? 'admin' : 'user';
}

async function signup(req, res) {
  const { username, password, display_name: displayName } = req.body;
  const normalizedUsername = String(username).trim().toLowerCase();

  const existing = await getUserByUsername(normalizedUsername);
  if (existing) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Username already exists',
    });
  }

  const createdUser = await createUser({
    username: normalizedUsername,
    passwordHash: hashPassword(password),
    displayName: displayName || normalizedUsername,
    role: roleForUsername(normalizedUsername),
    profileJson: {
      onboarding: 'signup',
    },
  });

  await touchUserLogin(createdUser.id);
  const token = signAuthToken(createdUser);

  appendLog({
    level: 'INFO',
    scope: 'auth',
    message: 'User signup completed',
    meta: {
      user_id: createdUser.id,
      username: createdUser.username,
      role: createdUser.role,
    },
  });

  return res.status(201).json({
    data: {
      token,
      user: normalizeUserResponse(createdUser),
    },
  });
}

async function login(req, res) {
  const { username, password } = req.body;
  const normalizedUsername = String(username).trim().toLowerCase();

  let user = await getUserByUsername(normalizedUsername);
  let createdOnLogin = false;

  if (!user) {
    user = await createUser({
      username: normalizedUsername,
      passwordHash: hashPassword(password),
      displayName: normalizedUsername,
      role: roleForUsername(normalizedUsername),
      profileJson: {
        onboarding: 'created_on_login',
      },
    });
    createdOnLogin = true;
  } else {
    const isValidPassword = verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid username or password',
      });
    }
  }

  await touchUserLogin(user.id);
  const token = signAuthToken(user);

  appendLog({
    level: 'INFO',
    scope: 'auth',
    message: 'User login completed',
    meta: {
      user_id: user.id,
      username: user.username,
      role: user.role,
      created_on_login: createdOnLogin,
    },
  });

  return res.json({
    data: {
      token,
      user: normalizeUserResponse(user),
      created_on_login: createdOnLogin,
    },
  });
}

function me(req, res) {
  return res.json({
    data: {
      user: normalizeUserResponse(req.user),
    },
  });
}

async function listKeys(req, res) {
  const rows = await listApiKeysByUser(req.user.id);
  return res.json({
    data: rows,
  });
}

async function createKey(req, res) {
  const { key_name: keyName, scopes = ['risk.read', 'predict.write'] } = req.body;
  const generated = generateApiKey();

  const record = await createApiKey({
    userId: req.user.id,
    keyName,
    keyPrefix: generated.prefix,
    keyHash: generated.hash,
    scopes,
  });

  appendLog({
    level: 'INFO',
    scope: 'auth',
    message: 'API key generated',
    meta: {
      user_id: req.user.id,
      api_key_id: record.id,
      key_name: record.key_name,
    },
  });

  return res.status(201).json({
    data: {
      ...record,
      api_key: generated.raw,
      one_time_visible: true,
    },
  });
}

async function revokeKey(req, res) {
  const apiKeyId = Number(req.params.key_id);
  const revoked = await revokeApiKey({
    apiKeyId,
    userId: req.user.id,
  });

  if (!revoked) {
    return res.status(404).json({
      error: 'NotFound',
      message: 'API key not found',
    });
  }

  appendLog({
    level: 'INFO',
    scope: 'auth',
    message: 'API key revoked',
    meta: {
      user_id: req.user.id,
      api_key_id: apiKeyId,
    },
  });

  return res.json({
    data: {
      id: apiKeyId,
      revoked: true,
    },
  });
}

module.exports = {
  signup,
  login,
  me,
  listKeys,
  createKey,
  revokeKey,
};
