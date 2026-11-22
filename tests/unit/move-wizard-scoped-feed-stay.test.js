// Historical batch-row UI/API regression fixture. Released pool forms run
// unmocked in manual-feed-pools and manual-pool-chart-refresh.
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 41 }));
/** @file Scoped-remaining moves hide Feed Transfer; feed stays on the source.
 *
 * Drives the real move-wizard DOM:
 *   - mode scoped-remaining + remaining feed: no Move / Leave as residual
 *     card; stay-copy is visible; Save writes no destination feed rows and
 *     leaves source entries (and no close-reading) on the open event.
 *   - full-event and scoped-last still show Move / Leave as residual and
 *     still transfer on the default Move choice once remaining is entered (OI-0259).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { _reset, add, update, getAll, getById } from '../../src/data/store.js';
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

const OP = '00000000-0000-0000-0000-000000003aa1';
const FARM = '00000000-0000-0000-0000-000000003bb1';
const SRC_LOC = '00000000-0000-0000-0000-000000003c11';
const DST_LOC = '00000000-0000-0000-0000-000000003c12';
const EVT = '00000000-0000-0000-0000-000000003d11';
const SRC_PW = '00000000-0000-0000-0000-000000003e11';
const GROUP_A = '00000000-0000-0000-0000-000000003f11';
const GROUP_B = '00000000-0000-0000-0000-000000003f12';
const GW_A = '00000000-0000-0000-0000-000000003101';
const GW_B = '00000000-0000-0000-0000-000000003102';
const FEED_TYPE = '00000000-0000-0000-0000-000000003f21';
const BATCH = '00000000-0000-0000-0000-000000003f22';

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
  for (const [id, name] of [[SRC_LOC, 'Source'], [DST_LOC, 'Dest']]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId: FARM, name, type: 'land',
      landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze',
    dateIn: '2026-04-01', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: SRC_PW, operationId: OP, eventId: EVT, locationId: SRC_LOC,
    dateOpened: '2026-04-01', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP_A, operationId: OP, farmId: FARM, name: 'Sheep' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('groups', GroupEntity.create({ id: GROUP_B, operationId: OP, farmId: FARM, name: 'Cows' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_A, operationId: OP, eventId: EVT, groupId: GROUP_A,
    dateJoined: '2026-04-01', headCount: 10, avgWeightKg: 80,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_B, operationId: OP, eventId: EVT, groupId: GROUP_B,
    dateJoined: '2026-04-01', headCount: 12, avgWeightKg: 520,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  for (const [groupId, hex, count] of [[GROUP_A, 'a', 4], [GROUP_B, 'b', 4]]) {
    for (let i = 0; i < count; i++) {
      const aid = `00000000-0000-0000-0000-00000003${hex}${i.toString().padStart(2, '0')}`;
      add('animals', AnimalEntity.create({
        id: aid, operationId: OP, tagNum: `${hex.toUpperCase()}${i}`, active: true,
        dateBorn: '2024-01-01', sex: 'F',
      }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
      add('animalGroupMemberships', MembershipEntity.create({
        operationId: OP, animalId: aid, groupId,
        dateJoined: '2026-04-01', dateLeft: null,
      }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
    }
  }
}

function seedFeed({ delivered, checkRemaining }) {
  add('feedTypes', FeedTypeEntity.create({
    id: FEED_TYPE, operationId: OP, name: 'Grass Hay', category: 'hay', unit: 'bales',
  }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FEED_TYPE, name: 'Hay Batch 1',
    quantity: 20, remaining: 5, unit: 'bales', weightPerUnitKg: 500, dmPct: 90,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('eventFeedEntries', FeedEntryEntity.create({
    operationId: OP, eventId: EVT, batchId: BATCH, locationId: SRC_LOC,
    date: '2026-04-02', quantity: delivered,
  }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
  if (checkRemaining != null) {
    const check = FeedCheckEntity.create({
      operationId: OP, eventId: EVT, date: '2026-04-04', time: '13:00',
    });
    add('eventFeedChecks', check, FeedCheckEntity.validate,
      FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
    add('eventFeedCheckItems', FeedCheckItemEntity.create({
      operationId: OP, feedCheckId: check.id,
      batchId: BATCH, locationId: SRC_LOC,
      remainingQuantity: checkRemaining,
    }), FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
  }
}

function driveToStep3({ scopedGroupWindowId } = {}) {
  const event = { id: EVT, dateIn: '2026-04-01', dateOut: null };
  openMoveWizard(event, OP, FARM, scopedGroupWindowId ? { scopedGroupWindowId } : {});
  document.querySelector('[data-testid="move-wizard-dest-new"]').click();
  document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
  document.querySelector(`[data-testid="location-picker-item-${DST_LOC}"]`).click();
  document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
}

function transferMoveRadios() {
  return document.querySelectorAll('[data-testid^="move-wizard-transfer-move-"]');
}
function transferResidualRadios() {
  return document.querySelectorAll('[data-testid^="move-wizard-transfer-residual-"]');
}
function feedStaysCopy() {
  return document.querySelector('[data-testid="move-wizard-feed-stays"]');
}

describe('move wizard — scoped-remaining feed stays on source', () => {
  beforeEach(seedBase);

  it('scoped-remaining with remaining feed hides Move / Residual and shows stay-copy', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    driveToStep3({ scopedGroupWindowId: GW_A });
    expect(feedStaysCopy()).toBeTruthy();
    expect(feedStaysCopy().textContent).toBe('Feed stays with groups remaining on this event.');
    expect(transferMoveRadios()).toHaveLength(0);
    expect(transferResidualRadios()).toHaveLength(0);
    expect(document.querySelector(`[data-testid="move-wizard-residual-input-${BATCH}-${SRC_LOC}"]`)).toBeFalsy();
    expect(document.querySelector(`[data-testid="move-wizard-transfer-label-${BATCH}-${SRC_LOC}"]`)).toBeFalsy();
    expect(document.body.textContent).not.toMatch(/Feed Transfer/);
    expect(document.body.textContent).not.toMatch(/No feed to transfer/);
    expect(document.body.textContent).not.toMatch(/nothing to move or leave behind/);
  });

  it('scoped-remaining with no feed still shows stay-copy, not the no-transfer hint', () => {
    driveToStep3({ scopedGroupWindowId: GW_A });
    expect(feedStaysCopy()).toBeTruthy();
    expect(feedStaysCopy().textContent).toBe('Feed stays with groups remaining on this event.');
    expect(document.body.textContent).not.toMatch(/No feed to transfer/);
    expect(transferMoveRadios()).toHaveLength(0);
  });

  it('saving a scoped-remaining move leaves source feed in place and writes no destination transfer', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    const sourceEntriesBefore = getAll('eventFeedEntries').filter(e => e.eventId === EVT);
    expect(sourceEntriesBefore).toHaveLength(1);
    const checksBefore = getAll('eventFeedChecks').length;
    driveToStep3({ scopedGroupWindowId: GW_A });
    document.querySelector('[data-testid="move-wizard-save"]').click();

    const src = getById('events', EVT);
    expect(src.dateOut, 'source event stays open').toBeFalsy();
    const destEvents = getAll('events').filter(e => e.id !== EVT);
    expect(destEvents).toHaveLength(1);

    const destEntries = getAll('eventFeedEntries').filter(e => e.eventId !== EVT);
    expect(destEntries).toHaveLength(0);
    const sourceEntriesAfter = getAll('eventFeedEntries').filter(e => e.eventId === EVT);
    expect(sourceEntriesAfter).toHaveLength(1);
    expect(sourceEntriesAfter[0].id).toBe(sourceEntriesBefore[0].id);
    expect(Number(sourceEntriesAfter[0].quantity)).toBe(10);
    expect(getAll('eventFeedChecks').length).toBe(checksBefore);
    expect(getAll('eventFeedChecks').some(c => c.isCloseReading)).toBe(false);
  });

  it('full-event still offers Move / Leave as residual and Move still transfers', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    driveToStep3();
    expect(feedStaysCopy()).toBeFalsy();
    expect(transferMoveRadios()).toHaveLength(1);
    expect(transferResidualRadios()).toHaveLength(1);
    expect(document.body.textContent).toMatch(/Feed Transfer/);
    expect(document.body.textContent).toMatch(/Move to new paddock/);
    expect(document.body.textContent).toMatch(/Leave as residual/);
    // OI-0259: remaining is required (no live prefill). Enter the prior live remaining.
    document.querySelector(`[data-testid="move-wizard-residual-input-${BATCH}-${SRC_LOC}"]`).value = '4';
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const destEntries = getAll('eventFeedEntries').filter(e => e.eventId !== EVT);
    expect(destEntries).toHaveLength(1);
    expect(Number(destEntries[0].quantity)).toBe(4);
  });

  it('scoped-last still offers Move / Leave as residual and Move still transfers', () => {
    update('eventGroupWindows', GW_B, { dateLeft: '2026-04-05' },
      GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    seedFeed({ delivered: 10, checkRemaining: 4 });
    driveToStep3({ scopedGroupWindowId: GW_A });
    expect(feedStaysCopy()).toBeFalsy();
    expect(transferMoveRadios()).toHaveLength(1);
    expect(transferResidualRadios()).toHaveLength(1);
    expect(document.body.textContent).toMatch(/Feed Transfer/);
    expect(document.body.textContent).toMatch(/Leave as residual/);
    document.querySelector(`[data-testid="move-wizard-residual-input-${BATCH}-${SRC_LOC}"]`).value = '4';
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const destEntries = getAll('eventFeedEntries').filter(e => e.eventId !== EVT);
    expect(destEntries).toHaveLength(1);
    expect(Number(destEntries[0].quantity)).toBe(4);
    const src = getById('events', EVT);
    expect(src.dateOut, 'last group leaving closes the event').toBeTruthy();
  });
});
