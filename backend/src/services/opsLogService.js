const MAX_LOGS = 300;
const logs = [];

function appendLog(entry) {
  const record = {
    id: logs.length + 1,
    timestamp: new Date().toISOString(),
    level: entry.level || 'INFO',
    scope: entry.scope || 'system',
    message: entry.message || 'event',
    meta: entry.meta || {},
  };

  logs.push(record);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }

  return record;
}

function getRecentLogs(limit = 80) {
  return logs.slice(-limit).reverse();
}

function getLogStats() {
  const stats = {
    total: logs.length,
    info: 0,
    warn: 0,
    error: 0,
  };

  logs.forEach((entry) => {
    const level = (entry.level || '').toLowerCase();
    if (level === 'error') stats.error += 1;
    else if (level === 'warn' || level === 'warning') stats.warn += 1;
    else stats.info += 1;
  });

  return stats;
}

module.exports = {
  appendLog,
  getRecentLogs,
  getLogStats,
};
