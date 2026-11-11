import { describe, it, expect, beforeAll, beforeEach,vi } from 'vitest';
import { _reset, add, update, getAll, getById } from '../../../src/data/store.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as FarmSettingEntity from '../../../src/entities/farm-setting.js';
import * as LocationEntity from '../../../src/entities/location.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as PaddockWindowEntity from '../../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as GroupWindowEntity from '../../../src/entities/event-group-window.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import * as FeedEntryEntity from '../../../src/entities/event-feed-entry.js';
import * as FeedCheckEntity from '../../../src/entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../../src/entities/event-feed-check-item.js';
import * as WeightEntity from '../../../src/entities/animal-weight-record.js';
import * as BatchEntity from '../../../src/entities/batch.js';
import * as TreatmentTypeEntity from '../../../src/entities/treatment-type.js';
import * as FeedTypeEntity from '../../../src/entities/feed-type.js';
import { placeInitialBalance } from '../../../src/features/feed/batch-balances.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const SRC_LOC = '00000000-0000-0000-0000-0000000000c1';
const DST_LOC = '00000000-0000-0000-0000-0000000000c2';
const EVT = '00000000-0000-0000-0000-0000000000d1';
const SRC_PW = '00000000-0000-0000-0000-0000000000e1';
const GROUP_A = '00000000-0000-0000-0000-0000000000f1';
const GROUP_B = '00000000-0000-0000-0000-0000000000f2';
const GW_A = '00000000-0000-0000-0000-000000000101';
const GW_B = '00000000-0000-0000-0000-000000000102';

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
  // Two groups on one event — both open.
  add('groups', GroupEntity.create({ id: GROUP_A, operationId: OP, farmId: FARM, name: 'Group A' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('groups', GroupEntity.create({ id: GROUP_B, operationId: OP, farmId: FARM, name: 'Group B' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_A, operationId: OP, eventId: EVT, groupId: GROUP_A,
    dateJoined: '2026-04-01', headCount: 10, avgWeightKg: 450,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_B, operationId: OP, eventId: EVT, groupId: GROUP_B,
    dateJoined: '2026-04-01', headCount: 12, avgWeightKg: 520,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  // Seed a tiny membership so live head count > 0 — the executeMoveWizard
  // step uses getLiveWindowHeadCount which reads memberships.
  for (let i = 0; i < 10; i++) {
    const aid = `00000000-0000-0000-0000-00000000a${i.toString().padStart(3, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `A${i}`, active: true,
      dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP_A,
      dateJoined: '2026-04-01', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
  for (let i = 0; i < 12; i++) {
    const aid = `00000000-0000-0000-0000-00000000b${i.toString().padStart(3, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `B${i}`, active: true,
      dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP_B,
      dateJoined: '2026-04-01', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
});


import { createFarmUiPorts } from '../../../src/features/assistant/farm-ui.js';
const actor = '00000000-0000-4000-8000-000000000002';
async function reviewEntry(target,fields) {
  const scope = { operationId: OP,actorId: actor }, conversationRef = crypto.randomUUID();
  let proposal = { id: crypto.randomUUID(),revision: 1,destination: target.ui,intent: 'data-entry',fields };
  let saved,corrected = 0;
  const ports = createFarmUiPorts({ scope,conversationRef,authorize: async () => true,resolveTarget: async () => target,
    onCorrect: async ({ fields }) => { corrected++;proposal = { ...proposal,revision: proposal.revision + 1,fields };await ports.renderReview(scope,proposal); },
    onConfirm: async ({ evidence }) => { const receipt = await ports.recordConfirmation(scope,proposal,evidence);saved = await ports.applyConfirmedWrite(scope,proposal,receipt,JSON.stringify([OP,conversationRef,proposal.id,proposal.revision])); },
  });
  await ports.renderReview(scope,proposal);
  return { ports,scope,proposal: () => proposal,saved: () => saved,corrected: () => corrected };
}
async function confirm(selector,review) {
  document.querySelector(selector).click();
  await vi.waitFor(() => expect(review.corrected() > 0 || review.saved()).toBeTruthy());
  if (!review.saved()) { document.querySelector(selector).click();await vi.waitFor(() => expect(review.saved(),document.querySelector('.auth-error')?.textContent).toBeTruthy()); }
}
describe('assistant uses populated normal entry UIs', () => {
  for (const mode of ['full','remaining','last']) it(`Move ${mode} uses its original terminal write and leaves no duplicate on replay`,async () => {
    if (mode === 'last') update('eventGroupWindows',GW_B,{ dateLeft: '2026-04-02' },GroupWindowEntity.validate,GroupWindowEntity.toSupabaseShape,'event_group_windows');
    const review = await reviewEntry({ ui: 'move',id: EVT,farmId: FARM,scopedGroupWindowId: mode === 'full' ? null : GW_A },{ destType: 'new',locationId: DST_LOC,dateOut: '2026-11-08',dateIn: '2026-11-08' });
    expect(getAll('events')).toHaveLength(1);
    await confirm('[data-testid="move-wizard-save"]',review);
    expect(getAll('events')).toHaveLength(2);
    expect(!!getById('events',EVT).dateOut).toBe(mode !== 'remaining');
    expect(review.saved().localSavedAt).toBeTruthy();
    const receipt = getAll('assistantReviewConfirmations').at(-1).id,proposal = review.proposal();
    const key = JSON.stringify([OP,getAll('assistantProposals').at(-1).conversationId,proposal.id,proposal.revision]);
    expect(await review.ports.applyConfirmedWrite(review.scope,proposal,receipt,key)).toEqual(review.saved());
    expect(getAll('events')).toHaveLength(2);
  });
  it('Move Back and destination correction retain the assistant confirmation gate and scoped context',async () => {
    const review = await reviewEntry({ ui: 'move',id: EVT,farmId: FARM,scopedGroupWindowId: GW_A },{ destType: 'new',locationId: DST_LOC,dateOut: '2026-11-08',dateIn: '2026-11-08' });
    document.querySelector('#move-wizard-sheet-panel .btn-outline').click();
    expect(document.querySelector('[data-testid="move-wizard-save"]')).toBeNull();expect(getAll('events')).toHaveLength(1);
    const next = [...document.querySelectorAll('#move-wizard-sheet-panel button')].find(button => /next/i.test(button.textContent));expect(next).toBeTruthy();next.click();
    await confirm('[data-testid="move-wizard-save"]',review);
    expect(getAll('events')).toHaveLength(2);expect(getById('eventGroupWindows',GW_B).dateLeft).toBeNull();
  });
  function seedDeliveredFeed() {
    const batch = seedBatch();
    const entry = FeedEntryEntity.create({ operationId: OP,eventId: EVT,batchId: batch.id,locationId: SRC_LOC,date: '2026-11-07',time: '08:00',quantity: 8 });add('eventFeedEntries',entry,FeedEntryEntity.validate,FeedEntryEntity.toSupabaseShape,'event_feed_entries');
    const check = FeedCheckEntity.create({ operationId: OP,eventId: EVT,date: '2026-11-08',time: '08:00' });add('eventFeedChecks',check,FeedCheckEntity.validate,FeedCheckEntity.toSupabaseShape,'event_feed_checks');
    const item = FeedCheckItemEntity.create({ operationId: OP,feedCheckId: check.id,batchId: batch.id,locationId: SRC_LOC,remainingQuantity: 3 });add('eventFeedCheckItems',item,FeedCheckItemEntity.validate,FeedCheckItemEntity.toSupabaseShape,'event_feed_check_items');
    return batch;
  }
  for (const choice of ['move','residual']) it(`Move normal ${choice} follow-up uses live remaining, retains post-graze observations and commits one durable receipt`,async () => {
    const batch = seedDeliveredFeed();
    const review = await reviewEntry({ ui: 'move',id: EVT,farmId: FARM },{ destType: 'new',locationId: DST_LOC,dateOut: '2026-11-08',timeOut: '09:00',dateIn: '2026-11-08',timeIn: '09:00',postGraze: { notes: 'Checked after grazing' },[`feed:${batch.feedTypeId}|${SRC_LOC}`]: { choice,residual: '2' } });
    // The live open-sheet field set includes the dynamic follow-ups, all declared by the sheet's definition.
    const open = review.ports.openSheet();
    expect(open.ui).toBe('move');
    expect(open.fields).toEqual(expect.arrayContaining(['dateIn','postGraze',`feed:${batch.feedTypeId}|${SRC_LOC}`]));
    expect(getAll('events')).toHaveLength(1);await confirm('[data-testid="move-wizard-save"]',review);
    const transferred = getAll('eventFeedEntries').filter(row => row.eventId !== EVT);
    if (choice === 'move') { expect(transferred).toHaveLength(1);expect(transferred[0].quantity).toBe(3); } else expect(transferred).toHaveLength(0);
    expect(getAll('eventFeedCheckItems').at(-1).remainingQuantity).toBe(choice === 'move' ? 3 : 2);
    expect(getAll('paddockObservations').some(row => row.notes === 'Checked after grazing')).toBe(true);expect(review.saved().localSavedAt).toBeTruthy();
  });
  it('Move invalid residual follow-up refuses before any farm close/create writes',async () => {
    const batch = seedDeliveredFeed();const review = await reviewEntry({ ui: 'move',id: EVT,farmId: FARM },{ destType: 'new',locationId: DST_LOC,dateOut: '2026-11-08',dateIn: '2026-11-08',[`feed:${batch.feedTypeId}|${SRC_LOC}`]: { choice: 'residual',residual: '-1' } });
    document.querySelector('[data-testid="move-wizard-save"]').click();await vi.waitFor(() => expect(review.corrected()).toBe(1));document.querySelector('[data-testid="move-wizard-save"]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="move-wizard-status"]').textContent).not.toBe(''));
    expect(review.saved()).toBeUndefined();expect(getAll('events')).toHaveLength(1);expect(getById('events',EVT).dateOut).toBeNull();expect(getAll('eventFeedChecks')).toHaveLength(1);expect(getAll('paddockObservations')).toHaveLength(0);
  });
  it('Calving correction creates a new revision; only a new normal Save clears confirmedBred',async () => {
    const dam = getAll('animals')[0];update('animals',dam.id,{ confirmedBred: true },AnimalEntity.validate,AnimalEntity.toSupabaseShape,'animals');
    const review = await reviewEntry({ ui: 'calving',id: dam.id },{ date: '2026-11-08',stillbirth: true });
    document.querySelector('[data-testid="calving-sheet-notes"]').value = 'corrected note';
    await confirm('[data-testid="calving-sheet-save"]',review);
    expect(getAll('animalCalvingRecords')).toHaveLength(1);
    expect(getById('animals',dam.id).confirmedBred).toBe(false);
    const revisions = getAll('assistantProposalRevisions');expect(revisions).toHaveLength(2);expect(revisions[0].supersededById).toBe(revisions[1].id);
    expect(getAll('assistantReviewConfirmations')).toHaveLength(1);
  });
  it('Place populates an unplaced group and saves through the existing final step',async () => {
    update('eventGroupWindows',GW_A,{ dateLeft: '2026-04-02' },GroupWindowEntity.validate,GroupWindowEntity.toSupabaseShape,'event_group_windows');
    for (const animal of getAll('animals')) { const weight = WeightEntity.create({ operationId: OP,animalId: animal.id,weightKg: 450,source: 'manual',recordedAt: '2026-11-01T12:00:00Z' });add('animalWeightRecords',weight,WeightEntity.validate,WeightEntity.toSupabaseShape,'animal_weight_records'); }
    const review = await reviewEntry({ ui: 'place',id: GROUP_A,farmId: FARM },{ destType: 'new',locationId: DST_LOC,dateIn: '2026-11-08',timeIn: '09:00' });
    expect(getAll('events')).toHaveLength(1);await confirm('[data-testid="place-wizard-save"]',review);
    expect(getAll('events')).toHaveLength(2);expect(getAll('eventGroupWindows').filter(row => row.groupId === GROUP_A && !row.dateLeft)).toHaveLength(1);
  });
  it('Treatment saves the populated normal date, product and dose via its entity',async () => {
    const type = TreatmentTypeEntity.create({ operationId: OP,name: 'Treatment',categoryId: crypto.randomUUID() });
    add('treatmentTypes',type,TreatmentTypeEntity.validate,TreatmentTypeEntity.toSupabaseShape,'treatment_types');
    const review = await reviewEntry({ ui: 'treatment',id: getAll('animals')[0].id },{ date: '2026-11-07',time: '09:15',treatmentTypeId: type.id,doseAmount: '2.5',product: 'Test product',entryTarget: { animal: 'tag 1' } });
    expect(getAll('animalTreatments')).toHaveLength(0);await confirm('#treatment-sheet-panel .btn-green',review);
    expect(getAll('animalTreatments')[0]).toMatchObject({ product: 'Test product',doseAmount: 2.5,treatedAt: new Date('2026-11-07T09:15').toISOString() });
  });
  function seedBatch() {
    const type = FeedTypeEntity.create({ operationId: OP,name: 'Hay',category: 'forage',unit: 'bale' });add('feedTypes',type,FeedTypeEntity.validate,FeedTypeEntity.toSupabaseShape,'feed_types');
    const batch = BatchEntity.create({ operationId: OP,feedTypeId: type.id,name: 'Hay',quantity: 10,unit: 'bale',weightPerUnitKg: 500,dmPct: 85 });add('batches',batch,BatchEntity.validate,BatchEntity.toSupabaseShape,'batches');
    placeInitialBalance({ operationId: OP,batchId: batch.id,locationId: SRC_LOC,quantity: 10 });return batch;
  }
  it('Feeding durably saves both the entry and original inventory deduction',async () => {
    const batch = seedBatch(),review = await reviewEntry({ ui: 'feeding',id: EVT },{ date: '2026-11-08',time: '09:00',locationId: SRC_LOC,lines: [{ batchId: batch.id,qty: 2,sourceLocationId: SRC_LOC }] });
    expect(getById('batches',batch.id).remaining).toBe(10);await confirm('#deliver-feed-sheet-panel .btn-green',review);
    expect(getById('batches',batch.id).remaining).toBe(8);expect(getAll('eventFeedEntries')).toHaveLength(1);expect(review.saved().localSavedAt).toBeTruthy();
  });
  it('Feeding rolls back an earlier line if a later normal inventory preflight fails',async () => {
    const batch = seedBatch(),review = await reviewEntry({ ui: 'feeding',id: EVT },{ date: '2026-11-08',time: '09:00',locationId: SRC_LOC,lines: [{ batchId: batch.id,qty: 2,sourceLocationId: SRC_LOC },{ batchId: batch.id,qty: 20,sourceLocationId: SRC_LOC }] });
    document.querySelector('#deliver-feed-sheet-panel .btn-green').click();await vi.waitFor(() => expect(review.corrected() === 1 || document.querySelector('#deliver-feed-sheet-panel .auth-error').textContent !== '').toBe(true));
    document.querySelector('#deliver-feed-sheet-panel .btn-green').click();await vi.waitFor(() => expect(document.querySelector('#deliver-feed-sheet-panel .auth-error').textContent).not.toBe(''));
    expect(review.saved()).toBeUndefined();expect(getById('batches',batch.id).remaining).toBe(10);expect(getAll('eventFeedEntries')).toHaveLength(0);
  });
  it('Place rejects an already-placed group before farm writes',async () => {
    await expect(reviewEntry({ ui: 'place',id: GROUP_A,farmId: FARM },{ destType: 'new',locationId: DST_LOC })).rejects.toThrow('group-already-placed');
    expect(getAll('events')).toHaveLength(1);
  });
  it('read capabilities use the same scoped evidence port, not a question list',async () => {
    const review = await reviewEntry({ ui: 'calving',id: getAll('animals')[0].id },{ stillbirth: true });
    expect((await review.ports.context(review.scope)).readTools).toHaveLength(3);
    const result = await review.ports.read(review.scope,'paddock-grazing-evidence',{ locationId: SRC_LOC });
    expect(result.lastClosed.state).toBe('unknown');
  });
});
