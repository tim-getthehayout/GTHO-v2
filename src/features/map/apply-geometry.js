/** @file Persist paddock rings onto locations. */

import { getById, update, add, getAll } from '../../data/store.js';
import * as LocationEntity from '../../entities/location.js';
import { polygonAreaHectares, polygonCentroid } from '../../utils/geo.js';

export function applyLocationGeometry(locationId, geojson, mapSource) {
  const loc = getById('locations', locationId);
  if (!loc) throw new Error('Location not found');
  const centroid = polygonCentroid(geojson);
  const areaHa = polygonAreaHectares(geojson);
  const patch = {
    geojson,
    centroidLat: centroid?.lat ?? null,
    centroidLng: centroid?.lng ?? null,
    mapSource,
  };
  const existingArea = loc.areaHectares ?? loc.areaHa ?? null;
  if (existingArea == null && areaHa != null) {
    patch.areaHectares = Math.round(areaHa * 1000) / 1000;
  }
  update('locations', locationId, patch, LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  return getById('locations', locationId);
}

export function createLocationFromImport({ name, geojson, farmId, operationId, fieldCode = null }) {
  const farms = getAll('farms');
  const ops = getAll('operations');
  const centroid = polygonCentroid(geojson);
  const areaHa = polygonAreaHectares(geojson);
  const rec = LocationEntity.create({
    name: name || 'Imported field',
    operationId: operationId || ops[0]?.id,
    farmId: farmId || farms[0]?.id,
    type: 'land',
    landUse: 'pasture',
    fieldCode,
    geojson,
    centroidLat: centroid?.lat ?? null,
    centroidLng: centroid?.lng ?? null,
    mapSource: 'imported',
    areaHectares: areaHa != null ? Math.round(areaHa * 1000) / 1000 : null,
  });
  add('locations', rec, LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  return rec;
}
