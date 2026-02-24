const { getUserById } = require('../repositories/authRepository');
const { verifyAuthToken } = require('../utils/security');

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice(7).trim() || null;
}

async function resolveAuthUser(req) {
  const token = extractBearerToken(req);
  if (!token) {
    return null;
  }

  const payload = verifyAuthToken(token);
  if (!payload?.sub) {
    return null;
  }

  return getUserById(Number(payload.sub));
}

async function optionalAuth(req, res, next) {
  try {
    const user = await resolveAuthUser(req);
    req.user = user || null;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireAuth(req, res, next) {
  try {
    const user = await resolveAuthUser(req);
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication is required for this action',
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication is required for this action',
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin role is required for this action',
    });
  }

  return next();
}

module.exports = {
  optionalAuth,
  requireAuth,
  requireAdmin,
};
