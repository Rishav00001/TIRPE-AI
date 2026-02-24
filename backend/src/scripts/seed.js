const { initDatabase } = require('../db/initDb');
const db = require('../config/db');

async function run() {
  try {
    const summary = await initDatabase({ forceReseed: true });
    console.info(
      `Database seeded. locations=${summary.locations.length}, insertedRows=${summary.insertedRows}, reseeded=${summary.reseeded}`,
    );
  } catch (error) {
    console.error('Seeding failed', error);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

run();
