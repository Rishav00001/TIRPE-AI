const app = require('./app');
const env = require('./config/env');
const features = require('./config/features');
const db = require('./config/db');
const { connectRedis } = require('./config/redis');
const { initDatabase } = require('./db/initDb');
const { trainModelFromDatabase, scheduleRetraining } = require('./services/modelOrchestrator');
const { appendLog } = require('./services/opsLogService');

let server;

async function bootstrap() {
  try {
    await connectRedis().catch(() => null);

    const dbSummary = await initDatabase();
    console.info('Database initialized', dbSummary);
    console.info(`AI provider configured: ${features.aiProvider}`);
    appendLog({
      level: 'INFO',
      scope: 'system',
      message: 'Backend bootstrap complete',
      meta: {
        ai_provider: features.aiProvider,
        location_count: dbSummary.locations.length,
      },
    });

    try {
      await trainModelFromDatabase();
      appendLog({
        level: 'INFO',
        scope: 'model',
        message: 'Model training cycle completed',
      });
    } catch (trainingError) {
      console.error('Initial AI training failed. Backend will continue in degraded mode.', trainingError.message);
      appendLog({
        level: 'WARN',
        scope: 'model',
        message: 'Model training failed; running degraded mode',
        meta: { error: trainingError.message },
      });
    }

    scheduleRetraining();

    server = app.listen(env.PORT, () => {
      console.info(`Backend running on port ${env.PORT}`);
    });
  } catch (error) {
    console.error('Failed to bootstrap backend service', error);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.info(`${signal} received. Shutting down backend gracefully...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await db.pool.end();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap();
