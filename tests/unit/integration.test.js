/** @file Integration test — store → entity → shape round-trip → subscriber notification */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { init, getAll, getById, add, subscribe, _reset } from '../../src/data/store.js';
import { create, validate, toSupabaseShape, fromSupabaseShape } from '../../src/entities/location.js';

describe('integration: store + entity round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
    _reset();
    init();
  });

  it('1. creates a location via store.add() — validates', () => {
    const loc = create({
      operationId: '550e8400-e29b-41d4-a716-446655440000',
      farmId: '660e8400-e29b-41d4-a716-446655440000',
      name: 'North Pasture',
      type: 'land',
      landUse: 'pasture',
      areaHectares: 25.5,
    });

    const result = add('locations', loc, validate);
    expect(result.id).toBe(loc.id);
    expect(result.name).toBe('North Pasture');
  });

  it('2. reads it back via getAll — returns a copy', () => {
    const loc = create({
      operationId: '550e8400-e29b-41d4-a716-446655440000',
      farmId: '660e8400-e29b-41d4-a716-446655440000',
      name: 'South Paddock',
      type: 'land',
    });
    add('locations', loc, validate);

    const locations = getAll('locations');
    expect(locations).toHaveLength(1);
    expect(locations[0].name).toBe('South Paddock');

    // Verify it's a copy
    locations[0].name = 'Tampered';
    expect(getAll('locations')[0].name).toBe('South Paddock');
  });

  it('3. toSupabaseShape produces correct snake_case', () => {
    const loc = create({
      operationId: '550e8400-e29b-41d4-a716-446655440000',
      farmId: '660e8400-e29b-41d4-a716-446655440000',
      name: 'Test',
      type: 'confinement',
      fieldCode: 'NP-01',
      capturePercent: 85,
    });

    const sb = toSupabaseShape(loc);
    expect(sb.operation_id).toBe(loc.operationId);
    expect(sb.farm_id).toBe(loc.farmId);
    expect(sb.field_code).toBe('NP-01');
    expect(sb.capture_percent).toBe(85);
    expect(sb.created_at).toBe(loc.createdAt);
  });

  it('4. fromSupabaseShape round-trips back to original', () => {
    const loc = create({
      operationId: '550e8400-e29b-41d4-a716-446655440000',
      farmId: '660e8400-e29b-41d4-a716-446655440000',
      name: 'Round Trip Test',
      type: 'land',
      landUse: 'pasture',
      areaHectares: 42.0,
      soilType: 'clay',
    });

    const roundTripped = fromSupabaseShape(toSupabaseShape(loc));
    expect(roundTripped).toEqual(loc);
  });

  it('5. subscriber is notified on add', () => {
    const callback = vi.fn();
    subscribe('locations', callback);

    const loc = create({
      operationId: '550e8400-e29b-41d4-a716-446655440000',
      farmId: '660e8400-e29b-41d4-a716-446655440000',
      name: 'Notification Test',
      type: 'land',
    });

    add('locations', loc, validate);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: 'Notification Test' }),
    ]));
  });

  it('rejects invalid data at the store level', () => {
    const invalid = create({ name: '', type: 'land' }); // Missing operationId, farmId, empty name
    expect(() => add('locations', invalid, validate)).toThrow('Validation failed');
    expect(getAll('locations')).toHaveLength(0);
  });

  it('persists to localStorage', () => {
    const loc = create({
      operationId: '550e8400-e29b-41d4-a716-446655440000',
      farmId: '660e8400-e29b-41d4-a716-446655440000',
      name: 'Persist Test',
      type: 'land',
    });
    add('locations', loc, validate);

    // Reset and re-init from storage
    _reset();
    init();
    expect(getAll('locations')).toHaveLength(1);
    expect(getAll('locations')[0].name).toBe('Persist Test');
  });
});
