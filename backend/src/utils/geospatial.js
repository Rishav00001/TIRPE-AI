function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(a, b) {
  const earthRadiusKm = 6371;

  const latDiff = toRadians(b.latitude - a.latitude);
  const lonDiff = toRadians(b.longitude - a.longitude);

  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const d =
    Math.sin(latDiff / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDiff / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(d), Math.sqrt(1 - d));
}

module.exports = {
  haversineDistanceKm,
};
