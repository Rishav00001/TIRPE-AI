const { getApiKeyByHash, markApiKeyUsed, getUserById } = require('../repositories/authRepository');
const { hashApiKey } = require('../utils/security');

async function requireApiKey(req, res, next) {
  const rawApiKey = String(req.headers['x-api-key'] || '').trim();
  if (!rawApiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'x-api-key header is required',
    });
  }

  try {
    const keyHash = hashApiKey(rawApiKey);
    const keyRecord = await getApiKeyByHash(keyHash);
    if (!keyRecord || !keyRecord.is_active) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
    }

    const user = await getUserById(Number(keyRecord.user_id));
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key owner not found',
      });
    }

    await markApiKeyUsed(Number(keyRecord.id));
    req.apiConsumer = {
      key_id: Number(keyRecord.id),
      key_name: keyRecord.key_name,
      key_prefix: keyRecord.key_prefix,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      scopes: Array.isArray(keyRecord.scopes) ? keyRecord.scopes : [],
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireApiKey,
};
