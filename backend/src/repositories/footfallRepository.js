const db = require('../config/db');

async function countFootfallRows() {
  const result = await db.query('SELECT COUNT(*)::int AS count FROM footfall_history;');
  return result.rows[0].count;
}

async function insertFootfallRows(rows, chunkSize = 500) {
  if (!rows.length) {
    return;
  }

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const placeholders = chunk.map((row, index) => {
      const base = index * 8;
      values.push(
        row.timestamp,
        row.location_id,
        row.weather_score,
        row.holiday_flag,
        row.weekend_flag,
        row.social_media_spike_index,
        row.traffic_index,
        row.actual_footfall,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    });

    await db.query(
      `
      INSERT INTO footfall_history (
        timestamp,
        location_id,
        weather_score,
        holiday_flag,
        weekend_flag,
        social_media_spike_index,
        traffic_index,
        actual_footfall
      )
      VALUES ${placeholders.join(',')}
      ON CONFLICT (timestamp, location_id) DO NOTHING;
      `,
      values,
    );
  }
}

async function getLatestFeatures(locationId) {
  const result = await db.query(
    `
      SELECT timestamp,
             weather_score,
             holiday_flag,
             weekend_flag,
             social_media_spike_index,
             traffic_index,
             actual_footfall
      FROM footfall_history
      WHERE location_id = $1
      ORDER BY timestamp DESC
      LIMIT 1;
    `,
    [locationId],
  );

  return result.rows[0] || null;
}

async function getRollingMean(locationId, hours = 3) {
  const result = await db.query(
    `
      SELECT COALESCE(AVG(actual_footfall), 0)::real AS rolling_mean
      FROM (
        SELECT actual_footfall
        FROM footfall_history
        WHERE location_id = $1
        ORDER BY timestamp DESC
        LIMIT $2
      ) sample;
    `,
    [locationId, hours],
  );

  return Number(result.rows[0].rolling_mean);
}

async function getTrainingDataset() {
  const result = await db.query(
    `
      SELECT timestamp,
             location_id,
             weather_score,
             holiday_flag,
             weekend_flag,
             social_media_spike_index,
             traffic_index,
             actual_footfall
      FROM footfall_history
      ORDER BY timestamp ASC;
    `,
  );

  return result.rows;
}

async function getRiskTrend24h() {
  const result = await db.query(
    `
      SELECT fh.timestamp,
             fh.location_id,
             l.name,
             fh.weather_score,
             fh.traffic_index,
             fh.social_media_spike_index,
             fh.actual_footfall,
             l.capacity
      FROM footfall_history fh
      JOIN locations l ON l.id = fh.location_id
      WHERE fh.timestamp >= NOW() - INTERVAL '24 hours'
      ORDER BY fh.timestamp ASC;
    `,
  );

  return result.rows;
}

async function getTrafficCorrelationDataset(locationId, limit = 48) {
  const result = await db.query(
    `
      SELECT timestamp,
             traffic_index,
             social_media_spike_index,
             actual_footfall
      FROM footfall_history
      WHERE location_id = $1
      ORDER BY timestamp DESC
      LIMIT $2;
    `,
    [locationId, limit],
  );

  return result.rows.reverse();
}

async function getRecentActualSeries(locationId, hours = 24) {
  const result = await db.query(
    `
      SELECT timestamp,
             actual_footfall,
             weather_score,
             holiday_flag,
             weekend_flag,
             social_media_spike_index,
             traffic_index
      FROM footfall_history
      WHERE location_id = $1
        AND timestamp >= NOW() - ($2::text || ' hours')::interval
      ORDER BY timestamp ASC;
    `,
    [locationId, hours],
  );

  return result.rows;
}

async function getAvailableMonths(locationId, limit = 12) {
  const result = await db.query(
    `
      SELECT TO_CHAR(DATE_TRUNC('month', timestamp AT TIME ZONE 'UTC'), 'YYYY-MM') AS value,
             TO_CHAR(DATE_TRUNC('month', timestamp AT TIME ZONE 'UTC'), 'Mon YYYY') AS label
      FROM footfall_history
      WHERE location_id = $1
      GROUP BY 1, 2
      ORDER BY value DESC
      LIMIT $2;
    `,
    [locationId, limit],
  );

  return result.rows;
}

async function getMonthlyCrowdRange(locationId, monthKey) {
  const [yearText, monthText] = String(monthKey || '').split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return {
      month: monthKey,
      has_data: false,
      summary: null,
      daily_profile: [],
    };
  }

  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));

  const [summaryResult, dailyResult] = await Promise.all([
    db.query(
      `
        SELECT COUNT(*)::int AS sample_count,
               MIN(actual_footfall)::int AS min_footfall,
               MAX(actual_footfall)::int AS max_footfall,
               ROUND(AVG(actual_footfall)::numeric, 2)::real AS avg_footfall
        FROM footfall_history
        WHERE location_id = $1
          AND timestamp >= $2
          AND timestamp < $3;
      `,
      [locationId, startDate.toISOString(), endDate.toISOString()],
    ),
    db.query(
      `
        SELECT TO_CHAR((timestamp AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS sample_count,
               MIN(actual_footfall)::int AS min_footfall,
               MAX(actual_footfall)::int AS max_footfall,
               ROUND(AVG(actual_footfall)::numeric, 2)::real AS avg_footfall
        FROM footfall_history
        WHERE location_id = $1
          AND timestamp >= $2
          AND timestamp < $3
        GROUP BY 1
        ORDER BY 1 ASC;
      `,
      [locationId, startDate.toISOString(), endDate.toISOString()],
    ),
  ]);

  const summary = summaryResult.rows[0] || null;
  const hasData = Number(summary?.sample_count || 0) > 0;

  return {
    month: monthKey,
    has_data: hasData,
    summary: hasData
      ? {
          sample_count: Number(summary.sample_count),
          min_footfall: Number(summary.min_footfall),
          max_footfall: Number(summary.max_footfall),
          avg_footfall: Number(summary.avg_footfall),
        }
      : null,
    daily_profile: hasData
      ? dailyResult.rows.map((row) => ({
          date: row.date,
          sample_count: Number(row.sample_count),
          min_footfall: Number(row.min_footfall),
          max_footfall: Number(row.max_footfall),
          avg_footfall: Number(row.avg_footfall),
        }))
      : [],
  };
}

async function getLastDaysCrowdRange(locationId, days = 30) {
  const [summaryResult, dailyResult] = await Promise.all([
    db.query(
      `
        SELECT COUNT(*)::int AS sample_count,
               MIN(actual_footfall)::int AS min_footfall,
               MAX(actual_footfall)::int AS max_footfall,
               ROUND(AVG(actual_footfall)::numeric, 2)::real AS avg_footfall
        FROM footfall_history
        WHERE location_id = $1
          AND timestamp >= NOW() - ($2::text || ' days')::interval;
      `,
      [locationId, days],
    ),
    db.query(
      `
        SELECT TO_CHAR((timestamp AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS sample_count,
               MIN(actual_footfall)::int AS min_footfall,
               MAX(actual_footfall)::int AS max_footfall,
               ROUND(AVG(actual_footfall)::numeric, 2)::real AS avg_footfall
        FROM footfall_history
        WHERE location_id = $1
          AND timestamp >= NOW() - ($2::text || ' days')::interval
        GROUP BY 1
        ORDER BY 1 ASC;
      `,
      [locationId, days],
    ),
  ]);

  const summary = summaryResult.rows[0] || null;
  const hasData = Number(summary?.sample_count || 0) > 0;

  return {
    label: `last_${days}_days`,
    has_data: hasData,
    summary: hasData
      ? {
          sample_count: Number(summary.sample_count),
          min_footfall: Number(summary.min_footfall),
          max_footfall: Number(summary.max_footfall),
          avg_footfall: Number(summary.avg_footfall),
        }
      : null,
    daily_profile: hasData
      ? dailyResult.rows.map((row) => ({
          date: row.date,
          sample_count: Number(row.sample_count),
          min_footfall: Number(row.min_footfall),
          max_footfall: Number(row.max_footfall),
          avg_footfall: Number(row.avg_footfall),
        }))
      : [],
  };
}

module.exports = {
  countFootfallRows,
  insertFootfallRows,
  getLatestFeatures,
  getRollingMean,
  getTrainingDataset,
  getRiskTrend24h,
  getTrafficCorrelationDataset,
  getRecentActualSeries,
  getAvailableMonths,
  getMonthlyCrowdRange,
  getLastDaysCrowdRange,
};
