function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function pseudoRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function isHoliday(date) {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const fixedHolidays = new Set([
    '1-26',
    '8-15',
    '10-2',
    '12-25',
  ]);

  if (fixedHolidays.has(`${month}-${day}`)) {
    return true;
  }

  return pseudoRandom(date.getTime() / 86_400_000) > 0.985;
}

function hourFootfallMultiplier(hour) {
  if (hour >= 5 && hour <= 9) return 1.3;
  if (hour >= 10 && hour <= 15) return 1.1;
  if (hour >= 16 && hour <= 20) return 1.25;
  if (hour >= 21 || hour <= 1) return 0.75;
  return 0.6;
}

function getWeatherScore(timestampSeed, hour) {
  const stormChance = pseudoRandom(timestampSeed + hour * 0.13);
  const smoothSeasonality = 0.5 + 0.25 * Math.sin((timestampSeed % 365) / 365 * Math.PI * 2);
  const disturbance = stormChance > 0.9 ? 0.75 : 0.45;
  return clamp(smoothSeasonality * 0.6 + disturbance * 0.4 + (pseudoRandom(timestampSeed * 1.11) - 0.5) * 0.12);
}

function getTrafficIndex(hour, weekendFlag, baseSeed) {
  const peak = hour >= 7 && hour <= 10 ? 0.9 : hour >= 17 && hour <= 20 ? 0.88 : 0.55;
  const weekendAdjustment = weekendFlag ? -0.08 : 0.08;
  return clamp(peak + weekendAdjustment + (pseudoRandom(baseSeed) - 0.5) * 0.18);
}

function getSocialSpikeIndex(hour, holidayFlag, weekendFlag, baseSeed) {
  const eventPulse = pseudoRandom(baseSeed * 0.77) > 0.965 ? 0.45 : 0;
  const baseline = holidayFlag ? 0.72 : weekendFlag ? 0.58 : 0.42;
  const hourInfluence = hour >= 18 && hour <= 22 ? 0.08 : 0;
  return clamp(baseline + hourInfluence + eventPulse + (pseudoRandom(baseSeed * 1.7) - 0.5) * 0.2);
}

function generateHistoricalRows(locations, totalHours = 45 * 24) {
  const rows = [];
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);

  for (const location of locations) {
    for (let i = totalHours; i >= 0; i -= 1) {
      const timestamp = new Date(now.getTime() - i * 3_600_000);
      const hour = timestamp.getUTCHours();
      const day = timestamp.getUTCDay();
      const weekendFlag = day === 0 || day === 6;
      const holidayFlag = isHoliday(timestamp);

      const seed = timestamp.getTime() / 3_600_000 + location.id * 13;
      const weatherScore = getWeatherScore(seed, hour);
      const trafficIndex = getTrafficIndex(hour, weekendFlag, seed + 17);
      const socialMediaSpikeIndex = getSocialSpikeIndex(hour, holidayFlag, weekendFlag, seed + 23);

      const baseHourly = location.average_daily_footfall / 24;
      const weatherImpact = 1 + weatherScore * 0.15;
      const holidayImpact = holidayFlag ? 1.25 : 1;
      const weekendImpact = weekendFlag ? 1.2 : 1;
      const socialImpact = 0.85 + socialMediaSpikeIndex * 0.4;
      const trafficPenalty = 1 - trafficIndex * 0.1;

      const noise = 0.92 + pseudoRandom(seed + 91) * 0.18;
      const projected = baseHourly
        * hourFootfallMultiplier(hour)
        * weatherImpact
        * holidayImpact
        * weekendImpact
        * socialImpact
        * trafficPenalty
        * noise;

      const capacityHourly = location.capacity / 3.5;
      const actualFootfall = Math.round(Math.max(30, Math.min(projected, capacityHourly * 1.35)));

      rows.push({
        timestamp,
        location_id: location.id,
        weather_score: Number(weatherScore.toFixed(4)),
        holiday_flag: holidayFlag,
        weekend_flag: weekendFlag,
        social_media_spike_index: Number(socialMediaSpikeIndex.toFixed(4)),
        traffic_index: Number(trafficIndex.toFixed(4)),
        actual_footfall: actualFootfall,
      });
    }
  }

  return rows;
}

module.exports = {
  generateHistoricalRows,
  clamp,
};
