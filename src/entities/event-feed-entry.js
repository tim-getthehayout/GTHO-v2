import { releasedColumns } from '../data/schema-columns.js';

/** @file Entity: event_feed_entries — V2_SCHEMA_DESIGN.md §5.4 */

import { isCalendarDate } from '../utils/form-values.js';

export const FIELDS = {
  feedTypeId: { type: 'uuid', required: false, sbColumn: 'feed_type_id' },
  unitSnapshot: { type: 'text', required: false, sbColumn: 'unit_snapshot' },
  weightPerUnitKgSnapshot: { type: 'numeric', required: false, sbColumn: 'weight_per_unit_kg_snapshot' },
  dmPctSnapshot: { type: 'numeric', required: false, sbColumn: 'dm_pct_snapshot' },
  kind: { type: 'text', required: false, sbColumn: 'kind' },
  transferId: { type: 'uuid', required: false, sbColumn: 'transfer_id' },
  returnBatchId: { type: 'uuid', required: false, sbColumn: 'return_batch_id' },
  returnStorageLocationId: { type: 'uuid', required: false, sbColumn: 'return_storage_location_id' },
  id:            { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:   { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  eventId:       { type: 'uuid',        required: true,  sbColumn: 'event_id' },
  batchId:       { type: 'uuid',        required: false,  sbColumn: 'batch_id' },
  locationId:    { type: 'uuid',        required: true,  sbColumn: 'location_id' },
  date:          { type: 'date',        required: true,  sbColumn: 'date' },
  time:          { type: 'text',        required: false, sbColumn: 'time' },
  quantity:      { type: 'numeric',     required: true,  sbColumn: 'quantity' },
  entryType:          { type: 'text',    required: false, sbColumn: 'entry_type' },
  destinationType:    { type: 'text',    required: false, sbColumn: 'destination_type' },
  destinationEventId: { type: 'uuid',    required: false, sbColumn: 'destination_event_id' },
  sourceEventId: { type: 'uuid',        required: false, sbColumn: 'source_event_id' },
  sourceLocationId: { type: 'uuid',     required: false, sbColumn: 'source_location_id' },
  createdAt:     { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:     { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    feedTypeId: data.feedTypeId ?? null,
    unitSnapshot: data.unitSnapshot ?? null,
    weightPerUnitKgSnapshot: data.weightPerUnitKgSnapshot ?? null,
    dmPctSnapshot: data.dmPctSnapshot ?? null,
    kind: data.kind ?? null,
    transferId: data.transferId ?? null,
    returnBatchId: data.returnBatchId ?? null,
    returnStorageLocationId: data.returnStorageLocationId ?? null,
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    eventId: data.eventId ?? null,
    batchId: data.batchId ?? null,
    locationId: data.locationId ?? null,
    date: data.date ?? null,
    time: data.time ?? null,
    quantity: data.quantity ?? 0,
    entryType: data.entryType ?? 'delivery',
    destinationType: data.destinationType ?? null,
    destinationEventId: data.destinationEventId ?? null,
    sourceEventId: data.sourceEventId ?? null,
    sourceLocationId: data.sourceLocationId ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.eventId) errors.push('eventId is required');
  if (!record.batchId && !record.feedTypeId) errors.push('batchId or feedTypeId is required');
  if (!record.locationId) errors.push('locationId is required');
  if (!isCalendarDate(record.date)) errors.push('date is required and must be valid');
  if (typeof record.quantity !== 'number' || !Number.isFinite(record.quantity) || record.quantity <= 0) errors.push('quantity must be a positive number');
  if (!['delivery', 'removal'].includes(record.entryType ?? 'delivery')) errors.push('invalid entryType');
  if (record.destinationType != null && !['batch', 'event'].includes(record.destinationType)) errors.push('invalid destinationType');
  if (record.entryType === 'removal' && !record.destinationType) errors.push('removal destination is required');
  if ((record.destinationType === 'event') !== !!record.destinationEventId) errors.push('destinationEventId must match destinationType');
  for (const key of ['feedTypeId', 'unitSnapshot']) if (record[key] != null && (typeof record[key] !== 'string' || !record[key].trim())) errors.push(`${key} must be nonempty text or null`);
  if (record.weightPerUnitKgSnapshot != null && (!Number.isFinite(record.weightPerUnitKgSnapshot) || record.weightPerUnitKgSnapshot <= 0)) errors.push('weightPerUnitKgSnapshot must be positive and finite');
  if (record.dmPctSnapshot != null && (!Number.isFinite(record.dmPctSnapshot) || record.dmPctSnapshot < 0 || record.dmPctSnapshot > 100)) errors.push('dmPctSnapshot must be between 0 and 100');
  for (const key of ['transferId', 'returnBatchId', 'returnStorageLocationId']) if (record[key] != null && (typeof record[key] !== 'string' || !record[key].trim())) errors.push(`${key} must be nonempty text or null`);
  if (record.kind != null && !['inventory_feeding', 'pool_carry', 'pool_removal'].includes(record.kind)) errors.push('invalid kind');
  if ((record.kind == null || record.kind === 'inventory_feeding') && !record.batchId) errors.push('inventory feeding requires batchId');
  if (record.kind != null && !record.feedTypeId) errors.push('new-style entry requires feedTypeId');
  if (record.kind === 'inventory_feeding' && record.entryType !== 'delivery') errors.push('inventory feeding must be a delivery');
  if (['pool_carry', 'pool_removal'].includes(record.kind)) {
    if (record.batchId) errors.push('pool transfer cannot retain batch identity');
    if (!record.transferId) errors.push('pool transfer requires durable transferId');
    if (!record.unitSnapshot || !(record.weightPerUnitKgSnapshot > 0) || record.dmPctSnapshot == null) errors.push('positive pool transfer needs conversion snapshots');
    if (record.entryType !== (record.kind === 'pool_removal' ? 'removal' : 'delivery')) errors.push('pool kind must match entryType');
  }
  if (!!record.returnBatchId !== !!record.returnStorageLocationId) errors.push('return batch and storage location are required together');
  if (record.returnBatchId && (record.kind !== 'pool_removal' || record.destinationType !== 'batch')) errors.push('returned feed requires a pool removal to storage');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    ...releasedColumns(43, {
      feed_type_id: record.feedTypeId ?? null,
      unit_snapshot: record.unitSnapshot ?? null,
      weight_per_unit_kg_snapshot: record.weightPerUnitKgSnapshot ?? null,
      dm_pct_snapshot: record.dmPctSnapshot ?? null,
      kind: record.kind ?? null,
      transfer_id: record.transferId ?? null,
      return_batch_id: record.returnBatchId ?? null,
      return_storage_location_id: record.returnStorageLocationId ?? null,
    }),
    id: record.id,
    operation_id: record.operationId,
    event_id: record.eventId,
    batch_id: record.batchId,
    location_id: record.locationId,
    date: record.date,
    time: record.time,
    quantity: record.quantity,
    entry_type: record.entryType,
    destination_type: record.destinationType,
    destination_event_id: record.destinationEventId,
    source_event_id: record.sourceEventId,
    source_location_id: record.sourceLocationId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    feedTypeId: row.feed_type_id ?? null,
    unitSnapshot: row.unit_snapshot ?? null,
    weightPerUnitKgSnapshot: row.weight_per_unit_kg_snapshot != null ? Number(row.weight_per_unit_kg_snapshot) : null,
    dmPctSnapshot: row.dm_pct_snapshot != null ? Number(row.dm_pct_snapshot) : null,
    kind: row.kind ?? null,
    transferId: row.transfer_id ?? null,
    returnBatchId: row.return_batch_id ?? null,
    returnStorageLocationId: row.return_storage_location_id ?? null,
    id: row.id,
    operationId: row.operation_id,
    eventId: row.event_id,
    batchId: row.batch_id,
    locationId: row.location_id,
    date: row.date,
    time: row.time,
    // PostgREST returns numeric columns as strings (arbitrary-precision);
    // coerce to Number so downstream math and typeof checks work.
    quantity: row.quantity != null ? Number(row.quantity) : null,
    entryType: row.entry_type || 'delivery',
    destinationType: row.destination_type || null,
    destinationEventId: row.destination_event_id || null,
    sourceEventId: row.source_event_id,
    sourceLocationId: row.source_location_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
