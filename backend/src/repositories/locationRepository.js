const db = require('../config/db');

async function upsertLocations(locations) {
  const insertSQL = `
    INSERT INTO locations (name, latitude, longitude, capacity, average_daily_footfall)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (name) DO UPDATE SET
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      capacity = EXCLUDED.capacity,
      average_daily_footfall = EXCLUDED.average_daily_footfall
    RETURNING id, name;
  `;

  for (const location of locations) {
    await db.query(insertSQL, [
      location.name,
      location.latitude,
      location.longitude,
      location.capacity,
      location.average_daily_footfall,
    ]);
  }
}

async function listLocations() {
  const result = await db.query(
    `SELECT id, name, latitude, longitude, capacity, average_daily_footfall
     FROM locations
     ORDER BY id ASC;`,
  );

  return result.rows;
}

async function getLocationById(locationId) {
  const result = await db.query(
    `SELECT id, name, latitude, longitude, capacity, average_daily_footfall
     FROM locations
     WHERE id = $1;`,
    [locationId],
  );

  return result.rows[0] || null;
}

module.exports = {
  upsertLocations,
  listLocations,
  getLocationById,
};
