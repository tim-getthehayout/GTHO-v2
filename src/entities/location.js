/** @file Entity: locations — V2_SCHEMA_DESIGN.md §2.1 */

export const FIELDS = {
  id:             { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:    { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  farmId:         { type: 'uuid',        required: true,  sbColumn: 'farm_id' },
  name:           { type: 'text',        required: true,  sbColumn: 'name' },
  type:           { type: 'text',        required: true,  sbColumn: 'type' },
  landUse:        { type: 'text',        required: false, sbColumn: 'land_use' },
  areaHectares:   { type: 'numeric',     required: false, sbColumn: 'area_hectares' },
  fieldCode:      { type: 'text',        required: false, sbColumn: 'field_code' },
  soilType:       { type: 'text',        required: false, sbColumn: 'soil_type' },
  forageTypeId:   { type: 'uuid',        required: false, sbColumn: 'forage_type_id' },
  capturePercent: { type: 'numeric',     required: false, sbColumn: 'capture_percent' },
  geojson:        { type: 'json',        required: false, sbColumn: 'geojson' },
  centroidLat:    { type: 'numeric',     required: false, sbColumn: 'centroid_lat' },
  centroidLng:    { type: 'numeric',     required: false, sbColumn: 'centroid_lng' },
  mapSource:      { type: 'text',        required: false, sbColumn: 'map_source' },
  archived:       { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt:      { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:      { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const VALID_TYPES = ['confinement', 'land'];
const VALID_LAND_USES = ['pasture', 'mixed_use', 'crop'];
const VALID_MAP_SOURCES = ['drawn', 'imported'];

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    farmId: data.farmId ?? null,
    name: data.name ?? '',
    type: data.type ?? 'land',
    landUse: data.landUse ?? null,
    areaHectares: data.areaHectares ?? null,
    fieldCode: data.fieldCode ?? null,
    soilType: data.soilType ?? null,
    forageTypeId: data.forageTypeId ?? null,
    capturePercent: data.capturePercent ?? null,
    geojson: data.geojson ?? null,
    centroidLat: data.centroidLat ?? null,
    centroidLng: data.centroidLng ?? null,
    mapSource: data.mapSource ?? null,
    archived: data.archived ?? false,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.farmId) errors.push('farmId is required');
  if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
    errors.push('name is required');
  }
  if (!record.type || !VALID_TYPES.includes(record.type)) {
    errors.push(`type must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (record.landUse && !VALID_LAND_USES.includes(record.landUse)) {
    errors.push(`landUse must be one of: ${VALID_LAND_USES.join(', ')}`);
  }
  if (record.mapSource && !VALID_MAP_SOURCES.includes(record.mapSource)) {
    errors.push(`mapSource must be one of: ${VALID_MAP_SOURCES.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    farm_id: record.farmId,
    name: record.name,
    type: record.type,
    land_use: record.landUse,
    area_hectares: record.areaHectares,
    field_code: record.fieldCode,
    soil_type: record.soilType,
    forage_type_id: record.forageTypeId,
    capture_percent: record.capturePercent,
    geojson: record.geojson,
    centroid_lat: record.centroidLat,
    centroid_lng: record.centroidLng,
    map_source: record.mapSource,
    archived: record.archived,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: areaHectares divides into AUD/stocking-rate calcs — divide-by-string
  // cascades NaN through every downstream number. capturePercent drives manure
  // NPK routing; same risk.
  return {
    id: row.id,
    operationId: row.operation_id,
    farmId: row.farm_id,
    name: row.name,
    type: row.type,
    landUse: row.land_use,
    areaHectares: row.area_hectares != null ? Number(row.area_hectares) : null,
    fieldCode: row.field_code,
    soilType: row.soil_type,
    forageTypeId: row.forage_type_id,
    capturePercent: row.capture_percent != null ? Number(row.capture_percent) : null,
    geojson: row.geojson ?? null,
    centroidLat: row.centroid_lat != null ? Number(row.centroid_lat) : null,
    centroidLng: row.centroid_lng != null ? Number(row.centroid_lng) : null,
    mapSource: row.map_source ?? null,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
