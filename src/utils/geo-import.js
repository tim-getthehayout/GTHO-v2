/** @file Parse farm-boundary files from FieldMargin and peers into named polygons. */

import { ringToGeojson } from './geo.js';

function normName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function featureName(props, fallback) {
  if (!props || typeof props !== 'object') return fallback;
  return props.name || props.Name || props.field || props.FIELD || props.field_name
    || props.fieldCode || props.field_code || props.id || fallback;
}

function polygonFromCoords(coords) {
  if (!coords || !coords[0] || coords[0].length < 4) return null;
  const ring = coords[0].map((pt) => [Number(pt[0]), Number(pt[1])]);
  return ringToGeojson(ring);
}

function collectGeojsonFeatures(input, source = 'geojson') {
  const out = [];
  if (!input) return out;

  const pushPolygon = (coords, name) => {
    const geojson = polygonFromCoords(coords);
    if (geojson) out.push({ name: name || `Imported ${out.length + 1}`, geojson, source });
  };

  const walk = (obj, name) => {
    if (!obj) return;
    if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
      obj.features.forEach((f, i) => walk(f, featureName(f.properties, `${name || 'Field'} ${i + 1}`)));
      return;
    }
    if (obj.type === 'Feature') {
      walk(obj.geometry, featureName(obj.properties, name));
      return;
    }
    if (obj.type === 'Polygon') {
      pushPolygon(obj.coordinates, name);
      return;
    }
    if (obj.type === 'MultiPolygon') {
      (obj.coordinates || []).forEach((poly, i) => {
        pushPolygon(poly, (obj.coordinates.length > 1 && name) ? `${name} ${i + 1}` : name);
      });
      return;
    }
    if (obj.type === 'GeometryCollection') {
      (obj.geometries || []).forEach((g, i) => walk(g, name ? `${name} ${i + 1}` : name));
    }
  };

  walk(input, null);
  return out;
}

function parseKmlCoordinates(text) {
  return String(text || '')
    .trim()
    .split(/[\s\n\r]+/)
    .map((pair) => pair.split(',').map(Number))
    .filter((pt) => pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
}

export function parseKmlDocument(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('This KML file could not be read.');
  }
  const out = [];
  const placemarks = [...doc.getElementsByTagName('Placemark')];
  placemarks.forEach((pm, i) => {
    const name = pm.getElementsByTagName('name')[0]?.textContent?.trim() || `Imported ${i + 1}`;
    const coordNodes = [...pm.getElementsByTagName('coordinates')];
    coordNodes.forEach((node, j) => {
      const pts = parseKmlCoordinates(node.textContent);
      if (pts.length < 3) return;
      const geojson = ringToGeojson(pts.map((pt) => [pt[0], pt[1]]));
      if (geojson) out.push({ name: coordNodes.length > 1 ? `${name} ${j + 1}` : name, geojson, source: 'kml' });
    });
  });
  return out;
}

async function unzipKmz(buffer) {
  const view = new DataView(buffer);
  const files = [];
  let offset = 0;
  while (offset + 30 <= view.byteLength) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(buffer.slice(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const data = buffer.slice(dataStart, dataStart + compSize);
    files.push({ name, method, data });
    offset = dataStart + compSize;
  }
  const kmlEntry = files.find((f) => f.name.toLowerCase().endsWith('.kml')) || files[0];
  if (!kmlEntry) throw new Error('No KML found inside this KMZ file.');
  if (kmlEntry.method === 0) return new TextDecoder().decode(kmlEntry.data);
  if (kmlEntry.method === 8) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([kmlEntry.data]).stream().pipeThrough(ds);
    return await new Response(stream).text();
  }
  throw new Error('This KMZ uses an unsupported compression method.');
}

export async function parseBoundaryFile(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.kmz')) {
    const buf = await file.arrayBuffer();
    return parseKmlDocument(await unzipKmz(buf));
  }
  const text = await file.text();
  if (name.endsWith('.kml') || text.includes('<kml') || text.includes('<Placemark')) {
    return parseKmlDocument(text);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('File is not GeoJSON or KML. Export from FieldMargin as KML or GeoJSON.');
  }
  return collectGeojsonFeatures(json);
}

export function matchImportedFeatures(features, locations) {
  return features.map((f) => {
    const n = normName(f.name);
    const match = (locations || []).find((l) => {
      if (l.archived) return false;
      return normName(l.name) === n || (l.fieldCode && normName(l.fieldCode) === n);
    }) || null;
    let action = 'create';
    if (match) action = match.geojson ? 'replace' : 'attach';
    return { ...f, matchId: match?.id || null, matchName: match?.name || null, action };
  });
}

export { collectGeojsonFeatures };
