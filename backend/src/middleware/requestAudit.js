const { appendLog } = require('../services/opsLogService');

function shouldSkipAudit(req, res) {
  const url = req.originalUrl || '';

  if (url.startsWith('/api/console') || url.startsWith('/api/health')) {
    return true;
  }

  // Suppress high-frequency noise in demo view unless a request failed.
  if (
    (url.startsWith('/api/config') || url.startsWith('/api/locations'))
    && res.statusCode < 400
  ) {
    return true;
  }

  return false;
}

function requestAudit(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    if (shouldSkipAudit(req, res)) {
      return;
    }

    const durationMs = Date.now() - startedAt;
    appendLog({
      level: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO',
      scope: 'http',
      message: `${req.method} ${req.originalUrl} (${durationMs}ms)`,
      meta: {
        status: res.statusCode,
        duration_ms: durationMs,
      },
    });
  });

  next();
}

module.exports = {
  requestAudit,
};
