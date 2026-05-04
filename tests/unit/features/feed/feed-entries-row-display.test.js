/** @file OI-0140 — every §8 Feed Entries row in event detail must render a
 * `→ {locationName}` chip after the existing label so the user can see which
 * paddock each delivery was attributed to. Resolves via getById('locations',
 * fe.locationId) with `'?'` fallback if the row's location is missing.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add } from '../../../../src/data/store.js';
import { setLocale } from '../../../../src/i18n/i18n.js';
import enLocale from '../../../../src/i18n/locales/en.json';
// OI-0157-B1: events/detail consumes ANI-AU from the calc registry; ensure
// core.js side-effect registrations land before any sheet open.
import '../../../../src/calcs/core.js';
import { openEventDetailSheet } from '../../../../src/features/events/detail.js';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as FarmSettingEntity from '../../../../src/entities/farm-setting.js';
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

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateIn: '2026-04-01', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('feedTypes', FeedTypeEntity.create({ id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale' }),
    FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FT, name: 'Oak Field Barn',
    unit: 'bale', quantity: 10, remaining: 10, weightPerUnitKg: 20, dmPct: 85,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
});

function feedEntryRows() {
  const section = document.querySelector('[data-testid="detail-feed-entries"]');
  return Array.from(section?.querySelectorAll('div[style*="font-size: 11px"]') || [])
    .map(div => div.textContent || '');
}

describe('§8 Feed Entries row display (OI-0140)', () => {
  it('row label includes a → {locationName} chip resolved from fe.locationId', () => {
    add('locations', LocationEntity.create({ id: LOC_G1, operationId: OP, farmId: FARM, name: 'G-1' }),
      LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC_G1,
      date: '2026-04-29', time: '14:00', quantity: 0.68,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

    openEventDetailSheet({ id: EVT }, OP, FARM);
    const rows = feedEntryRows();
    const labelRow = rows.find(t => t.includes('Oak Field Barn'));
    expect(labelRow).toBeTruthy();
    expect(labelRow).toContain('→ G-1');
  });

  it('rows for two different paddocks each carry their own chip', () => {
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
      date: '2026-04-30', quantity: 1.0,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

    openEventDetailSheet({ id: EVT }, OP, FARM);
    const rows = feedEntryRows();
    const allText = rows.join(' || ');
    expect(allText).toContain('→ G-1');
    expect(allText).toContain('→ G-2');
  });

  it('graceful fallback to → ? when location is missing', () => {
    // No location seeded for this id.
    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC_G1,
      date: '2026-04-29', quantity: 1,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

    openEventDetailSheet({ id: EVT }, OP, FARM);
    const rows = feedEntryRows();
    const labelRow = rows.find(t => t.includes('Oak Field Barn'));
    expect(labelRow).toContain('→ ?');
  });
});
