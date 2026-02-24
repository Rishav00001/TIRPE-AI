const db = require('../config/db');

async function insertRiskSnapshot(snapshot) {
  const result = await db.query(
    `
      INSERT INTO risk_snapshots (
        timestamp,
        location_id,
        predicted_footfall,
        confidence_score,
        risk_score,
        sustainability_score,
        weather_score,
        traffic_index,
        social_media_spike_index,
        aqi_index,
        weather_condition,
        environmental_risk_index
      )
      VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, timestamp;
    `,
    [
      snapshot.location_id,
      snapshot.predicted_footfall,
      snapshot.confidence_score,
      snapshot.risk_score,
      snapshot.sustainability_score,
      snapshot.weather_score,
      snapshot.traffic_index,
      snapshot.social_media_spike_index,
      snapshot.aqi_index ?? 0,
      snapshot.weather_condition ?? null,
      snapshot.environmental_risk_index ?? snapshot.weather_score,
    ],
  );

  return result.rows[0];
}

async function getRecentSnapshots(locationId, limit = 24) {
  const result = await db.query(
    `
      SELECT timestamp,
             predicted_footfall,
             risk_score,
             sustainability_score,
             confidence_score,
             aqi_index,
             weather_condition,
             environmental_risk_index
      FROM risk_snapshots
      WHERE location_id = $1
      ORDER BY timestamp DESC
      LIMIT $2;
    `,
    [locationId, limit],
  );

  return result.rows.reverse();
}

module.exports = {
  insertRiskSnapshot,
  getRecentSnapshots,
};
