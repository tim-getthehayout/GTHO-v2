/** @file OI-0162 — three compounding move-wizard bugs.
 *
 *   Bug A — `getLiveRemainingForMove` returns 0, wizard still rendered the
 *           Move/Residual radio. Default = Move triggered a `quantity <= 0`
 *           validate throw on the destination FeedEntry.
 *   Bug B — `executeMoveWizard` was non-transactional: a throw mid-way
 *           through Steps 1–8 left the source closed, the destination event
 *           created with zero group windows, and the wizard open with an
 *           inscrutable error appended to statusEl.
 *   Bug C — No idempotency guard: a re-run on a now-closed source produced
 *           a duplicate destination event with no group windows (the
 *           orphan 01b1617f from Tim's 2026-05-06 production repro).
 *
 * Live-repro D → B-3 (full-OI regression) at the bottom of this file.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { _reset, add, getAll, getById } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as BatchEntity from '../../src/entities/batch.js';
import * as FeedEntryEntity from '../../src/entities/event-feed-entry.js';
import * as FeedCheckEntity from '../../src/entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../src/entities/event-feed-check-item.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { openMoveWizard } from '../../src/features/events/move-wizard.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const SRC_LOC = '00000000-0000-0000-0000-0000000000c1'; // 'Paddock D'
const DST_LOC = '00000000-0000-0000-0000-0000000000c2'; // 'Paddock B-3'
const EVT = '00000000-0000-0000-0000-0000000000d1';
const SRC_PW = '00000000-0000-0000-0000-0000000000e1';
const GROUP_SHENK = '00000000-0000-0000-0000-0000000000f1';
const GROUP_BULL = '00000000-0000-0000-0000-0000000000f2';
const GW_SHENK = '00000000-0000-0000-0000-000000000101';
const GW_BULL = '00000000-0000-0000-0000-000000000102';
const FEED_TYPE = '00000000-0000-0000-0000-000000000301';
const BATCH = '00000000-0000-0000-0000-000000000401';
const FEED_ENTRY = '00000000-0000-0000-0000-000000000501';
const FEED_CHECK = '00000000-0000-0000-0000-000000000601';
const FEED_CHECK_ITEM = '00000000-0000-0000-0000-000000000701';

beforeAll(() => setLocale('en', enLocale));

function seedBase() {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  for (const [id, name] of [[SRC_LOC, 'Paddock D'], [DST_LOC, 'Paddock B-3']]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId: FARM, name, type: 'land',
      landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze',
    dateIn: '2026-04-25', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: SRC_PW, operationId: OP, eventId: EVT, locationId: SRC_LOC,
    dateOpened: '2026-04-25', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP_SHENK, operationId: OP, farmId: FARM, name: 'Shenk Culls' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('groups', GroupEntity.create({ id: GROUP_BULL, operationId: OP, farmId: FARM, name: 'Bull Group' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_SHENK, operationId: OP, eventId: EVT, groupId: GROUP_SHENK,
    dateJoined: '2026-04-25', headCount: 8, avgWeightKg: 540,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_BULL, operationId: OP, eventId: EVT, groupId: GROUP_BULL,
    dateJoined: '2026-04-25', headCount: 4, avgWeightKg: 850,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  // Tiny membership so live recompute is non-zero.
  for (let i = 0; i < 8; i++) {
    const aid = `00000000-0000-0000-0000-00000000a${i.toString().padStart(3, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `S${i}`, active: true,
      dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP_SHENK,
      dateJoined: '2026-04-25', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
  for (let i = 0; i < 4; i++) {
    const aid = `00000000-0000-0000-0000-00000000b${i.toString().padStart(3, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `B${i}`, active: true,
      dateBorn: '2024-01-01', sex: 'M',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP_BULL,
      dateJoined: '2026-04-25', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
}

function seedFeedDeliveryAndZeroCheck() {
  // One feed type / batch, one delivery to SRC_LOC, one close-reading
  // check item with `remainingQuantity: 0` for the same (batch, location).
  // This is the live D → B-3 fixture: feed was delivered then fully
  // consumed before the move.
  add('feedTypes', FeedTypeEntity.create({
    id: FEED_TYPE, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale',
  }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FEED_TYPE, name: 'Hay Batch',
    unit: 'bale', quantity: 5, remaining: 5, weightPerUnitKg: 20, dmPct: 85,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('eventFeedEntries', FeedEntryEntity.create({
    id: FEED_ENTRY, operationId: OP, eventId: EVT, batchId: BATCH,
    locationId: SRC_LOC, date: '2026-04-26', time: '09:00', quantity: 5,
  }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
  // A non-close check that stamps remaining = 0 — that's what
  // `getLiveRemainingForMove` reads.
  add('eventFeedChecks', FeedCheckEntity.create({
    id: FEED_CHECK, operationId: OP, eventId: EVT, date: '2026-05-05', time: '13:00',
    isCloseReading: false,
  }), FeedCheckEntity.validate, FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
  add('eventFeedCheckItems', FeedCheckItemEntity.create({
    id: FEED_CHECK_ITEM, operationId: OP, feedCheckId: FEED_CHECK, batchId: BATCH,
    locationId: SRC_LOC, remainingQuantity: 0,
  }), FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
}

/** Drive the wizard to Step 3 with a 'new'-destination flow. */
function driveToStep3New({ scopedGroupWindowId } = {}) {
  const event = { id: EVT, dateIn: '2026-04-25', dateOut: null };
  openMoveWizard(event, OP, FARM, scopedGroupWindowId ? { scopedGroupWindowId } : {});
  document.querySelector('[data-testid="move-wizard-dest-new"]').click();
  document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
  document.querySelector(`[data-testid="location-picker-item-${DST_LOC}"]`).click();
  document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
}

describe('OI-0162-A — Step 3 skips 0-remaining feed groups', () => {
  beforeEach(() => {
    seedBase();
    seedFeedDeliveryAndZeroCheck();
  });

  it('renders no Move/Residual radio when live remaining is 0 for every (batch, location) pair', () => {
    driveToStep3New();
    // No transfer-move or transfer-residual radios should be present.
    const moveRadios = document.querySelectorAll('[data-testid^="move-wizard-transfer-move-"]');
    const residualRadios = document.querySelectorAll('[data-testid^="move-wizard-transfer-residual-"]');
    expect(moveRadios.length).toBe(0);
    expect(residualRadios.length).toBe(0);
  });

  it('shows the "all-zero" hint when feedEntries exist but every pair is 0-remaining', () => {
    driveToStep3New();
    const hint = document.querySelector('[data-testid="move-wizard-feed-transfer-all-zero"]');
    expect(hint).toBeTruthy();
    expect(hint.textContent).toMatch(/no feed remaining/i);
  });

  it('preserves the OI-0135 / OI-0139 invariant: source close-reading still stamps remainingQuantity: 0 on Save', () => {
    driveToStep3New();
    document.querySelector('[data-testid="move-wizard-save"]').click();
    // Bug C side-effect-free regression: a successful save still
    // produces a close-reading on the source with remainingQuantity: 0
    // for the dropped (batch, location) pair. The new check is the one
    // created by Step 1 of executeMoveWizard.
    const checks = getAll('eventFeedChecks').filter(c => c.eventId === EVT && c.isCloseReading);
    expect(checks.length).toBe(1);
    const items = getAll('eventFeedCheckItems').filter(ci => ci.feedCheckId === checks[0].id);
    expect(items.length).toBe(1);
    expect(items[0].remainingQuantity).toBe(0);
    expect(items[0].batchId).toBe(BATCH);
    expect(items[0].locationId).toBe(SRC_LOC);
  });
});

describe('OI-0162-B — executeMoveWizard pre-flight + transactional safety', () => {
  beforeEach(() => {
    seedBase();
    seedFeedDeliveryAndZeroCheck();
  });

  it('on a clean Save (no feed throws thanks to Bug A), wizard closes without error toast', () => {
    driveToStep3New();
    document.querySelector('[data-testid="move-wizard-save"]').click();
    // Success path — wizard closes and no error toast appears.
    const toast = document.querySelector('[data-testid="move-wizard-save-error-toast"]');
    expect(toast).toBeFalsy();
    // Source closed cleanly, destination event created.
    const src = getById('events', EVT);
    expect(src.dateOut).toBeTruthy();
    const newEvents = getAll('events').filter(e => e.id !== EVT);
    expect(newEvents.length).toBe(1);
  });

  it('Layer 2: a throw inside the try block closes the wizard via the finally block + emits the save-error toast', () => {
    driveToStep3New();
    // Force a throw mid-try by spying on EventEntity.validate (called when
    // creating the destination event, post-source-close). vi.spyOn handles
    // the ES-module-read-only constraint that direct assignment hits.
    const origValidate = EventEntity.validate;
    const validateSpy = vi.spyOn(EventEntity, 'validate').mockImplementation((rec) => {
      if (rec.sourceEventId === EVT) {
        // The destination event has sourceEventId pointing at the source —
        // throw on that write only, after source closes have committed.
        throw new Error('synthetic mid-try throw');
      }
      return origValidate(rec);
    });
    try {
      document.querySelector('[data-testid="move-wizard-save"]').click();
    } finally {
      validateSpy.mockRestore();
    }
    // Toast appeared (Layer 2 caught the throw + surfaced the user signal).
    const toast = document.querySelector('[data-testid="move-wizard-save-error-toast"]');
    expect(toast).toBeTruthy();
    expect(toast.textContent).toMatch(/error mid-save/i);
  });
});

describe('OI-0162-C — idempotency guards on already-closed source', () => {
  beforeEach(() => {
    seedBase();
    seedFeedDeliveryAndZeroCheck();
  });

  it('full-event move on a source whose dateOut is already set: refuses, no destination writes', () => {
    // Simulate the post-first-save state: source event is closed, paddock
    // window is closed, group windows are closed.
    add('events', EventEntity.create({
      id: '00000000-0000-0000-0000-deadbeef0001', operationId: OP, farmId: FARM,
      type: 'graze', dateIn: '2026-04-25', dateOut: '2026-05-05',
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    const closedEvt = { id: '00000000-0000-0000-0000-deadbeef0001', dateIn: '2026-04-25', dateOut: '2026-05-05' };
    openMoveWizard(closedEvt, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="location-picker-item-${DST_LOC}"]`).click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
    document.querySelector('[data-testid="move-wizard-save"]').click();
    // Refuse-to-act guard fired — error in statusEl, no new event in store.
    const status = document.querySelector('[data-testid="move-wizard-status"]');
    expect(status.textContent).toMatch(/already closed/i);
    const newEvents = getAll('events').filter(e =>
      e.id !== EVT && e.id !== '00000000-0000-0000-0000-deadbeef0001');
    expect(newEvents.length).toBe(0);
  });

  it('full-event move on a source with zero open group windows: refuses with "nothing to move"', () => {
    // Close every GW pre-wizard-open. This is the "stale dashboard view"
    // path — the source event hasn't been closed yet but no groups remain.
    add('events', EventEntity.create({
      id: '00000000-0000-0000-0000-deadbeef0002', operationId: OP, farmId: FARM,
      type: 'graze', dateIn: '2026-04-25', dateOut: null,
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    const evt = { id: '00000000-0000-0000-0000-deadbeef0002', dateIn: '2026-04-25', dateOut: null };
    // No GWs seeded for this event — sourceGWs.length === 0 immediately.
    openMoveWizard(evt, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="location-picker-item-${DST_LOC}"]`).click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const status = document.querySelector('[data-testid="move-wizard-status"]');
    expect(status.textContent).toMatch(/no open groups/i);
  });
});

describe('OI-0162 full-OI live-repro regression — 2026-05-06 D → B-3', () => {
  it('first save closes source cleanly + creates destination with group windows; second save refuses', () => {
    seedBase();
    seedFeedDeliveryAndZeroCheck();

    // --- First save (full-event move; the actual 2026-05-06 sequence) ---
    driveToStep3New();
    // Bug A regression: zero radios rendered.
    expect(document.querySelectorAll('[data-testid^="move-wizard-transfer-move-"]').length).toBe(0);
    // Click Save with default state — no error toast, wizard closes
    // (Bug B's pre-flight passed by construction since no Move-choice
    // toggles exist).
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const errToast = document.querySelector('[data-testid="move-wizard-save-error-toast"]');
    expect(errToast).toBeFalsy();
    // Source closed cleanly.
    const src = getById('events', EVT);
    expect(src.dateOut).toBeTruthy();
    // Source paddock window closed.
    const srcPw = getById('eventPaddockWindows', SRC_PW);
    expect(srcPw.dateClosed).toBeTruthy();
    // Both source GWs closed.
    expect(getById('eventGroupWindows', GW_SHENK).dateLeft).toBeTruthy();
    expect(getById('eventGroupWindows', GW_BULL).dateLeft).toBeTruthy();
    // Exactly one destination event created with two group windows
    // (Shenk Culls + Bull Group).
    const newEventsAfterFirst = getAll('events').filter(e => e.id !== EVT);
    expect(newEventsAfterFirst.length).toBe(1);
    const destEvtId = newEventsAfterFirst[0].id;
    const destGWs = getAll('eventGroupWindows').filter(w => w.eventId === destEvtId);
    expect(destGWs.length).toBe(2);

    // --- Second save (the buggy re-click on the same closed source) ---
    // Bug C regression: the wizard refuses to act and no second destination
    // event is written. Pre-OI-0162 this produced the orphan 01b1617f.
    const closedSrc = { id: EVT, dateIn: '2026-04-25', dateOut: src.dateOut };
    openMoveWizard(closedSrc, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="location-picker-item-${DST_LOC}"]`).click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const status = document.querySelector('[data-testid="move-wizard-status"]');
    expect(status.textContent).toMatch(/already closed/i);
    const newEventsAfterSecond = getAll('events').filter(e => e.id !== EVT);
    expect(newEventsAfterSecond.length).toBe(1); // unchanged from first save
  });
});

// Silence the deliberate logger.error in the Layer-2 throw simulation.
vi.stubGlobal('console', {
  ...console,
  // eslint-disable-next-line no-empty-function
  error: () => {},
});
