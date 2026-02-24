const db = require('../config/db');
const { createSchemaSQL } = require('./schema');
const { LOCATION_SEED } = require('./seedData');
const { upsertLocations, listLocations } = require('../repositories/locationRepository');
const { countFootfallRows, insertFootfallRows } = require('../repositories/footfallRepository');
const { generateHistoricalRows } = require('../utils/syntheticGenerator');

async function resetHistoricalData() {
  await db.query('TRUNCATE TABLE risk_snapshots RESTART IDENTITY;');
  await db.query('TRUNCATE TABLE footfall_history RESTART IDENTITY;');
}

async function initDatabase(options = {}) {
  const { forceReseed = false } = options;

  await db.query(createSchemaSQL);
  await upsertLocations(LOCATION_SEED);

  const persistedLocations = await listLocations();
  const persistedByName = new Map(persistedLocations.map((location) => [location.name, location]));

  const alignedLocations = LOCATION_SEED
    .map((seed) => {
      const persisted = persistedByName.get(seed.name);
      if (!persisted) {
        return null;
      }

      return {
        ...persisted,
        average_daily_footfall: Number(persisted.average_daily_footfall),
      };
    })
    .filter(Boolean);

  if (forceReseed) {
    await resetHistoricalData();
  }

  const historicalCount = await countFootfallRows();
  let insertedRows = 0;

  if (historicalCount === 0) {
    const syntheticRows = generateHistoricalRows(alignedLocations);
    await insertFootfallRows(syntheticRows);
    insertedRows = syntheticRows.length;
  }

  return {
    locations: alignedLocations,
    insertedRows,
    reseeded: forceReseed,
  };
}

module.exports = {
  initDatabase,
};
