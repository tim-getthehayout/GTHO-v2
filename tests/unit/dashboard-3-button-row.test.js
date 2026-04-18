/**
 * @file Dashboard location card — 3-up quick-action row (OI-0109).
 *
 * Verifies:
 *   1. Single bottom row renders Feed Check · Feed · Sub-Move at equal flex
 *   2. New `dashboard-submove-btn-{event.id}` testid present alongside existing Feed Check + Feed
 *   3. Clicking Sub-Move invokes openSubmoveOpenSheet (spy)
 *   4. Standalone "+ Add sub-move" link above SUB-PADDOCKS is gone when no
 *      sub-moves exist (previously rendered at §9); the in-section link inside
 *      SUB-PADDOCKS stays (tested indirectly — no sub-moves here)
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as EventPaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';

// Stub the sub-move sheet opener before importing the module under test.
vi.mock('../../src/features/events/submove.js', () => ({
  openSubmoveOpenSheet: vi.fn(),
  openSubmoveCloseSheet: vi.fn(),
}));

import { buildLocationCard } from '../../src/features/dashboard/index.js';
import { openSubmoveOpenSheet } from '../../src/features/events/submove.js';

const OP_ID = '00000000-0000-0000-0000-0000000000aa';
const FARM_ID = '00000000-0000-0000-0000-0000000000bb';
const LOC_ID = '00000000-0000-0000-0000-0000000000cc';
const EVENT_ID = '00000000-0000-0000-0000-0000000000dd';
const PW_ID = '00000000-0000-0000-0000-0000000000ee';

beforeAll(() => setLocale('en', enLocale));

function seed() {
  _reset();
  localStorage.clear();
  add('operations', OperationEntity.create({ id: OP_ID, name: 'Test Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM_ID, operationId: OP_ID, name: 'Test Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM_ID, operationId: OP_ID }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC_ID, operationId: OP_ID, farmId: FARM_ID,
    name: 'North 40', type: 'land', landUse: 'pasture', areaHectares: 8,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({
    id: EVENT_ID, operationId: OP_ID, farmId: FARM_ID,
    type: 'graze', dateIn: '2026-04-01', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', EventPaddockWindowEntity.create({
    id: PW_ID, operationId: OP_ID, eventId: EVENT_ID, locationId: LOC_ID,
    dateOpened: '2026-04-01', areaPct: 100,
  }), EventPaddockWindowEntity.validate, EventPaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

describe('buildLocationCard — 3-up quick-action row (OI-0109)', () => {
  beforeEach(() => {
    seed();
    openSubmoveOpenSheet.mockClear();
  });

  it('renders all three testids: Feed Check, Feed, Sub-Move', () => {
    const event = { id: EVENT_ID, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP_ID, FARM_ID, 'imperial');
    const feedCheckBtn = card.querySelector(`[data-testid="dashboard-feed-check-btn-${EVENT_ID}"]`);
    const feedBtn = card.querySelector(`[data-testid="dashboard-feed-btn-${EVENT_ID}"]`);
    const submoveBtn = card.querySelector(`[data-testid="dashboard-submove-btn-${EVENT_ID}"]`);
    expect(feedCheckBtn).toBeTruthy();
    expect(feedBtn).toBeTruthy();
    expect(submoveBtn).toBeTruthy();
  });

  it('three buttons share a single flex row (flex: 1, gap: 6px)', () => {
    const event = { id: EVENT_ID, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP_ID, FARM_ID, 'imperial');
    const submoveBtn = card.querySelector(`[data-testid="dashboard-submove-btn-${EVENT_ID}"]`);
    const row = submoveBtn.parentElement;
    expect(row.style.display).toBe('flex');
    expect(row.style.gap).toBe('6px');
    // All three siblings share the row.
    expect(row.children.length).toBe(3);
    for (const btn of row.children) {
      // jsdom expands shorthand `flex: '1'` to '1 1 0%' — match flex-grow only.
      expect(btn.style.flexGrow).toBe('1');
    }
  });

  it('Sub-Move button invokes openSubmoveOpenSheet with the event', () => {
    const event = { id: EVENT_ID, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP_ID, FARM_ID, 'imperial');
    const submoveBtn = card.querySelector(`[data-testid="dashboard-submove-btn-${EVENT_ID}"]`);
    submoveBtn.click();
    expect(openSubmoveOpenSheet).toHaveBeenCalledTimes(1);
    const [passedEvent, passedOp] = openSubmoveOpenSheet.mock.calls[0];
    expect(passedEvent.id).toBe(EVENT_ID);
    expect(passedOp).toBe(OP_ID);
  });

  it('standalone "+ Add sub-move" link (above SUB-PADDOCKS) is removed', () => {
    const event = { id: EVENT_ID, dateIn: '2026-04-01', dateOut: null };
    const card = buildLocationCard(event, OP_ID, FARM_ID, 'imperial');
    // No sub-moves seeded — pre-OI-0109 this would render a standalone teal <a>.
    const anchors = [...card.querySelectorAll('a')].filter(a => (a.textContent || '').includes('+ Add sub-move'));
    expect(anchors.length).toBe(0);
  });
});
