/** @file OI-0140 — feed delivery sheet must render a paddock picker on multi-
 * open-window events, default to the most-recently-opened, and write the
 * picker's selected `location_id` to every saved entry. Single-window events
 * render no picker (auto-pick) but still surface a → {locationName} chip.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll, setSyncAdapter } from '../../../../src/data/store.js';
import { openDeliverFeedSheet } from '../../../../src/features/feed/delivery.js';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as EventEntity from '../../../../src/entities/event.js';
import * as LocationEntity from '../../../../src/entities/location.js';
import * as PaddockWindowEntity from '../../../../src/entities/event-paddock-window.js';
import * as BatchEntity from '../../../../src/entities/batch.js';
import * as FeedTypeEntity from '../../../../src/entities/feed-type.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const LOC_G1 = '00000000-0000-0000-0000-0000000001a1';
const LOC_G2 = '00000000-0000-0000-0000-0000000001a2';
const LOC_G3 = '00000000-0000-0000-0000-0000000001a3';
const FT = '00000000-0000-0000-0000-0000000000f1';
const BATCH = '00000000-0000-0000-0000-0000000000b1';

function seedScaffold() {
  add('operations', OperationEntity.create({ id: OP, name: 'Test Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Test Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('feedTypes', FeedTypeEntity.create({ id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale' }),
    FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FT, name: 'Hay Batch',
    unit: 'bale', quantity: 10, remaining: 10,
    weightPerUnitKg: 20, dmPct: 85,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
}

function seedLocation(id, name) {
  add('locations', LocationEntity.create({ id, operationId: OP, farmId: FARM, name }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
}

function seedPaddockWindow({ id, locationId, dateOpened, timeOpened }) {
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id, operationId: OP, eventId: EVT, locationId, dateOpened, timeOpened,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

function openSheet() {
  const evt = getAll('events').find(e => e.id === EVT);
  openDeliverFeedSheet(evt, OP);
  return document.getElementById('deliver-feed-sheet-panel');
}

function clickFirstBatch(panel) {
  const batchSel = panel.querySelector('.batch-sel');
  batchSel.click();
}

function clickSave(panel) {
  const buttons = Array.from(panel.querySelectorAll('button'));
  const saveBtn = buttons.find(b => /save|deliver|log/i.test(b.textContent || ''));
  saveBtn.click();
}

describe('openDeliverFeedSheet picker (OI-0140)', () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    setSyncAdapter(null);
    seedScaffold();
    seedLocation(LOC_G1, 'G-1');
    seedLocation(LOC_G2, 'G-2');
    seedLocation(LOC_G3, 'G-3');
  });

  it('single-window event renders no picker; chip shows the auto-picked location', () => {
    seedPaddockWindow({ id: 'pw-only', locationId: LOC_G1, dateOpened: '2026-04-30' });

    const panel = openSheet();
    expect(panel.querySelector('[data-testid="feed-delivery-paddock-picker"]')).toBeNull();
    const chip = panel.querySelector('[data-testid="feed-delivery-location-chip"]');
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain('G-1');
  });

  it('multi-window event renders picker with N options sorted most-recently-opened first', () => {
    seedPaddockWindow({ id: 'pw-g1', locationId: LOC_G1, dateOpened: '2026-04-30', timeOpened: null });
    seedPaddockWindow({ id: 'pw-g2', locationId: LOC_G2, dateOpened: '2026-04-29', timeOpened: '14:00' });
    seedPaddockWindow({ id: 'pw-g3', locationId: LOC_G3, dateOpened: '2026-04-29', timeOpened: '14:00' });

    const panel = openSheet();
    const select = panel.querySelector('[data-testid="feed-delivery-paddock-picker"]');
    expect(select).toBeTruthy();
    const options = Array.from(select.querySelectorAll('option'));
    expect(options).toHaveLength(3);
    // 04-30 (G-1) is strictly later than 04-29 (G-2/G-3) regardless of time;
    // the first option must be G-1.
    expect(options[0].textContent).toBe('G-1');
    expect(options[0].value).toBe(LOC_G1);
    expect(select.value).toBe(LOC_G1);
  });

  it('default-selected option = top of the sorted list (most-recently-opened)', () => {
    seedPaddockWindow({ id: 'pw-g3', locationId: LOC_G3, dateOpened: '2026-04-29', timeOpened: '14:00' });
    seedPaddockWindow({ id: 'pw-g1', locationId: LOC_G1, dateOpened: '2026-04-30', timeOpened: null });

    const panel = openSheet();
    const select = panel.querySelector('[data-testid="feed-delivery-paddock-picker"]');
    expect(select.value).toBe(LOC_G1);
    expect(panel.querySelector('[data-testid="feed-delivery-location-chip"]').textContent).toContain('G-1');
  });

  it('changing the picker updates the chip immediately', () => {
    seedPaddockWindow({ id: 'pw-g1', locationId: LOC_G1, dateOpened: '2026-04-30' });
    seedPaddockWindow({ id: 'pw-g2', locationId: LOC_G2, dateOpened: '2026-04-29', timeOpened: '14:00' });

    const panel = openSheet();
    const select = panel.querySelector('[data-testid="feed-delivery-paddock-picker"]');
    const chip = panel.querySelector('[data-testid="feed-delivery-location-chip"]');
    expect(chip.textContent).toContain('G-1');

    select.value = LOC_G2;
    select.dispatchEvent(new Event('change'));
    expect(chip.textContent).toContain('G-2');
    expect(chip.textContent).not.toContain('G-1');
  });

  it('save loop writes the picker-selected location_id to every entry, NOT activePWs[0]', () => {
    // G-3 first (so localStorage insertion order would put G-3 at index 0 — the
    // bug class). G-1 is the most-recently-opened by date and should be the
    // picker default. We pick G-2 explicitly to prove the save path uses the
    // current selection, not the localStorage-order shortcut.
    seedPaddockWindow({ id: 'pw-g3', locationId: LOC_G3, dateOpened: '2026-04-29', timeOpened: '14:00' });
    seedPaddockWindow({ id: 'pw-g2', locationId: LOC_G2, dateOpened: '2026-04-29', timeOpened: '14:00' });
    seedPaddockWindow({ id: 'pw-g1', locationId: LOC_G1, dateOpened: '2026-04-30' });

    const panel = openSheet();
    const select = panel.querySelector('[data-testid="feed-delivery-paddock-picker"]');
    select.value = LOC_G2;
    select.dispatchEvent(new Event('change'));

    clickFirstBatch(panel);
    // Bump the qty above zero via the + button.
    const plusBtn = Array.from(panel.querySelectorAll('button.qty-btn')).find(b => b.textContent === '+');
    plusBtn.click();
    plusBtn.click();

    clickSave(panel);

    const entries = getAll('eventFeedEntries').filter(e => e.eventId === EVT);
    expect(entries).toHaveLength(1);
    expect(entries[0].locationId).toBe(LOC_G2);
    expect(entries[0].locationId).not.toBe(LOC_G3);
    expect(entries[0].locationId).not.toBe(LOC_G1);
  });
});
