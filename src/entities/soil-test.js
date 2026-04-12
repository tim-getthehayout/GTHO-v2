/** @file Entity: soil_tests — V2_SCHEMA_DESIGN.md §8.5 */

export const FIELDS = {
  id:              { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:     { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  locationId:      { type: 'uuid',        required: true,  sbColumn: 'location_id' },
  testedAt:        { type: 'timestamptz', required: true,  sbColumn: 'tested_at' },
  extractionMethod:{ type: 'text',        required: false, sbColumn: 'extraction_method' },
  n:               { type: 'numeric',     required: false, sbColumn: 'n' },
  p:               { type: 'numeric',     required: false, sbColumn: 'p' },
  k:               { type: 'numeric',     required: false, sbColumn: 'k' },
  s:               { type: 'numeric',     required: false, sbColumn: 's' },
  ca:              { type: 'numeric',     required: false, sbColumn: 'ca' },
  mg:              { type: 'numeric',     required: false, sbColumn: 'mg' },
  cu:              { type: 'numeric',     required: false, sbColumn: 'cu' },
  fe:              { type: 'numeric',     required: false, sbColumn: 'fe' },
  mn:              { type: 'numeric',     required: false, sbColumn: 'mn' },
  mo:              { type: 'numeric',     required: false, sbColumn: 'mo' },
  zn:              { type: 'numeric',     required: false, sbColumn: 'zn' },
  b:               { type: 'numeric',     required: false, sbColumn: 'b' },
  cl:              { type: 'numeric',     required: false, sbColumn: 'cl' },
  unit:            { type: 'text',        required: true,  sbColumn: 'unit' },
  ph:              { type: 'numeric',     required: false, sbColumn: 'ph' },
  bufferPh:        { type: 'numeric',     required: false, sbColumn: 'buffer_ph' },
  cec:             { type: 'numeric',     required: false, sbColumn: 'cec' },
  baseSaturation:  { type: 'numeric',     required: false, sbColumn: 'base_saturation' },
  organicMatter:   { type: 'numeric',     required: false, sbColumn: 'organic_matter' },
  lab:             { type: 'text',        required: false, sbColumn: 'lab' },
  notes:           { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:       { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:       { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:               data.id               ?? crypto.randomUUID(),
    operationId:      data.operationId      ?? null,
    locationId:       data.locationId       ?? null,
    testedAt:         data.testedAt         ?? null,
    extractionMethod: data.extractionMethod ?? null,
    n:                data.n                ?? null,
    p:                data.p                ?? null,
    k:                data.k                ?? null,
    s:                data.s                ?? null,
    ca:               data.ca               ?? null,
    mg:               data.mg               ?? null,
    cu:               data.cu               ?? null,
    fe:               data.fe               ?? null,
    mn:               data.mn               ?? null,
    mo:               data.mo               ?? null,
    zn:               data.zn               ?? null,
    b:                data.b                ?? null,
    cl:               data.cl               ?? null,
    unit:             data.unit             ?? null,
    ph:               data.ph               ?? null,
    bufferPh:         data.bufferPh         ?? null,
    cec:              data.cec              ?? null,
    baseSaturation:   data.baseSaturation   ?? null,
    organicMatter:    data.organicMatter    ?? null,
    lab:              data.lab              ?? null,
    notes:            data.notes            ?? null,
    createdAt:        data.createdAt        ?? new Date().toISOString(),
    updatedAt:        data.updatedAt        ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.locationId) errors.push('locationId is required');
  if (!record.testedAt) errors.push('testedAt is required');
  if (!record.unit || typeof record.unit !== 'string' || record.unit.trim() === '') {
    errors.push('unit is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:               record.id,
    operation_id:     record.operationId,
    location_id:      record.locationId,
    tested_at:        record.testedAt,
    extraction_method:record.extractionMethod,
    n:                record.n,
    p:                record.p,
    k:                record.k,
    s:                record.s,
    ca:               record.ca,
    mg:               record.mg,
    cu:               record.cu,
    fe:               record.fe,
    mn:               record.mn,
    mo:               record.mo,
    zn:               record.zn,
    b:                record.b,
    cl:               record.cl,
    unit:             record.unit,
    ph:               record.ph,
    buffer_ph:        record.bufferPh,
    cec:              record.cec,
    base_saturation:  record.baseSaturation,
    organic_matter:   record.organicMatter,
    lab:              record.lab,
    notes:            record.notes,
    created_at:       record.createdAt,
    updated_at:       record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:               row.id,
    operationId:      row.operation_id,
    locationId:       row.location_id,
    testedAt:         row.tested_at,
    extractionMethod: row.extraction_method,
    n:                row.n,
    p:                row.p,
    k:                row.k,
    s:                row.s,
    ca:               row.ca,
    mg:               row.mg,
    cu:               row.cu,
    fe:               row.fe,
    mn:               row.mn,
    mo:               row.mo,
    zn:               row.zn,
    b:                row.b,
    cl:               row.cl,
    unit:             row.unit,
    ph:               row.ph,
    bufferPh:         row.buffer_ph,
    cec:              row.cec,
    baseSaturation:   row.base_saturation,
    organicMatter:    row.organic_matter,
    lab:              row.lab,
    notes:            row.notes,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}
