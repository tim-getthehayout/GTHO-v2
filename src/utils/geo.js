/** @file Map geometry helpers — paddock rings and todo pins. */

const M_PER_DEG_LAT = 111320;

function ringFromGeojson(geojson) {
  if (!geojson) return null;
  const coords = geojson.type === 'Feature' ? geojson.geometry?.coordinates : geojson.coordinates;
  if (!coords || !coords[0] || coords[0].length < 4) return null;
  return coords[0];
}

export function ringToGeojson(ring) {
  if (!ring || ring.length < 3) return null;
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring
    : [...ring, ring[0]];
  return { type: 'Polygon', coordinates: [closed] };
}

export function polygonCentroid(geojson) {
  const ring = ringFromGeojson(geojson);
  if (!ring) return null;
  let sumLng = 0;
  let sumLat = 0;
  const n = ring.length - 1;
  if (n <= 0) return null;
  for (let i = 0; i < n; i++) {
    sumLng += ring[i][0];
    sumLat += ring[i][1];
  }
  return { lng: sumLng / n, lat: sumLat / n };
}

export function polygonAreaHectares(geojson) {
  const ring = ringFromGeojson(geojson);
  if (!ring) return null;
  const n = ring.length - 1;
  if (n < 3) return null;
  const meanLat = ring.slice(0, n).reduce((s, p) => s + p[1], 0) / n;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos(meanLat * Math.PI / 180);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[(i + 1) % n];
    const x1 = lng1 * mPerDegLng;
    const y1 = lat1 * M_PER_DEG_LAT;
    const x2 = lng2 * mPerDegLng;
    const y2 = lat2 * M_PER_DEG_LAT;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2 / 10000;
}

export function pointInPolygon(lat, lng, geojson) {
  const ring = ringFromGeojson(geojson);
  if (!ring) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < (xj - xi) * (lat - yi) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDegrees(lat1, lng1, lat2, lng2) {
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
    - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function formatDistance(meters, unitSystem = 'imperial') {
  if (meters == null || Number.isNaN(meters)) return '';
  if (unitSystem === 'imperial') {
    const feet = meters * 3.28084;
    if (feet < 528) return `${Math.round(feet)} ft`;
    return `${(feet / 5280).toFixed(1)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function compassLabel(bearing) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(bearing / 45) % 8];
}

export function distanceToTodoMeters(lat, lng, todo, locationsById) {
  if (todo.pointLat != null && todo.pointLng != null) {
    return haversineMeters(lat, lng, todo.pointLat, todo.pointLng);
  }
  const loc = todo.locationId ? locationsById.get(todo.locationId) : null;
  if (!loc?.geojson) {
    if (loc?.centroidLat != null && loc?.centroidLng != null) {
      return haversineMeters(lat, lng, loc.centroidLat, loc.centroidLng);
    }
    return null;
  }
  if (pointInPolygon(lat, lng, loc.geojson)) return 0;
  const ring = ringFromGeojson(loc.geojson);
  let best = Infinity;
  for (const [plng, plat] of ring) {
    const d = haversineMeters(lat, lng, plat, plng);
    if (d < best) best = d;
  }
  return best;
}

export function findLocationAtPoint(locations, lat, lng) {
  return locations.find((loc) => loc.geojson && pointInPolygon(lat, lng, loc.geojson)) || null;
}

export function locationHasPerimeter(loc) {
  return Boolean(ringFromGeojson(loc?.geojson));
}
