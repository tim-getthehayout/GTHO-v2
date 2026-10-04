/** @file Centered paddock name on a polygon. */

import { polygonCentroid } from '../../utils/geo.js';

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&', '<': '<', '>': '>' }[c]));
}

export function addPaddockLabel(L, map, loc) {
  let lat = loc.centroidLat;
  let lng = loc.centroidLng;
  if (lat == null || lng == null) {
    const c = polygonCentroid(loc.geojson);
    if (!c) return null;
    lat = c.lat;
    lng = c.lng;
  }
  const icon = L.divIcon({
    className: 'paddock-label',
    html: escapeHtml(loc.name),
    iconSize: [96, 18],
    iconAnchor: [48, 9],
  });
  return L.marker([lat, lng], { icon, interactive: false, keyboard: false }).addTo(map);
}
