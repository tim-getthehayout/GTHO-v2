/** @file OI-0140 — every feed-check sheet line header must include a
 * `→ {locationName}` chip per consolidated `(batch, location)` group, so
 * multi-paddock events disambiguate which feeder each line is reporting on.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll, setSyncAdapter } from '../../../../src/data/store.js';
import { openFeedCheckSheet } from '../../../../src/features/feed/check.js';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as EventEntity from '../../../../src/entities/event.js';
import * as LocationEntity from '../../../../src/entities/location.js';
import * as BatchEntity from '../../../../src/entities/batch.js';
import * as FeedTypeEntity from '../../../../src/entities/feed-type.js';
import * as FeedEntryEntity from '../../../../src/entities/event-feed-entry.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000c1';
const LOC_G1 = '00000000-0000-0000-0000-0000000001a1';
const LOC_G2 = '00000000-0000-0000-0000-0000000001a2';
const FT = '00000000-0000-0000-0000-0000000000f1';
const BATCH = '00000000-0000-0000-0000-0000000000b1';

function seedScaffold() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('feedTypes', FeedTypeEntity.create({ id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale' }),
    FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FT, name: 'Hay Batch',
    unit: 'bale', quantity: 10, remaining: 10, weightPerUnitKg: 20, dmPct: 85,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
}

function openSheet() {
  const evt = getAll('events').find(e => e.id === EVT);
  openFeedCheckSheet(evt, OP);
  return document.getElementById('feed-check-sheet-panel');
}

describe('openFeedCheckSheet line-header chip (OI-0140)', () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    setSyncAdapter(null);
    seedScaffold();
  });

  it('single-line: header carries → {locationName}', () => {
    add('locations', LocationEntity.create({ id: LOC_G1, operationId: OP, farmId: FARM, name: 'G-1' }),
      LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC_G1,
      date: '2026-04-29', quantity: 1,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

    const panel = openSheet();
    expect(panel.textContent).toContain('→ G-1');
  });

  it('two consolidated groups (different locations): each header carries its own chip', () => {
    add('locations', LocationEntity.create({ id: LOC_G1, operationId: OP, farmId: FARM, name: 'G-1' }),
      LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('locations', LocationEntity.create({ id: LOC_G2, operationId: OP, farmId: FARM, name: 'G-2' }),
      LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC_G1,
      date: '2026-04-29', quantity: 0.68,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC_G2,
      date: '2026-04-30', quantity: 1,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

    const panel = openSheet();
    expect(panel.textContent).toContain('→ G-1');
    expect(panel.textContent).toContain('→ G-2');
  });

  it('graceful fallback to → ? when location is missing for a group', () => {
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC_G1,
      date: '2026-04-29', quantity: 1,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

    const panel = openSheet();
    expect(panel.textContent).toContain('→ ?');
  });
});
