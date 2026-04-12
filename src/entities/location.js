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
  archived:       { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt:      { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:      { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const VALID_TYPES = ['confinement', 'land'];
const VALID_LAND_USES = ['pasture', 'mixed_use', 'crop'];

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
    archived: record.archived,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    farmId: row.farm_id,
    name: row.name,
    type: row.type,
    landUse: row.land_use,
    areaHectares: row.area_hectares,
    fieldCode: row.field_code,
    soilType: row.soil_type,
    forageTypeId: row.forage_type_id,
    capturePercent: row.capture_percent,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
