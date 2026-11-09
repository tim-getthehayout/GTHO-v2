import { describe, it, expect } from 'vitest';
import { resolveEntryTarget, CHOOSE_ENTRY_QUESTION } from '../../../src/features/assistant/entry-targets.js';

const data = {
  animals: [{ id: 'a1', tagNum: '42', name: 'Daisy', active: true }, { id: 'a2', tagNum: '43', name: 'Rosie', active: true }, { id: 'a3', tagNum: '44', name: 'Rosie', active: true }, { id: 'a4', tagNum: '45', name: 'Gone', active: false }],
  groups: [{ id: 'g1', name: 'Heifers' }, { id: 'g2', name: 'Cows' }, { id: 'g3', name: 'Bulls' }, { id: 'g4', name: 'Old', archivedAt: '2026-01-01' }],
  locations: [{ id: 'l1', name: 'North 40', farmId: 'f1' }, { id: 'l2', name: 'South', farmId: 'f1' }, { id: 'l3', name: 'River', farmId: 'f2' }, { id: 'l4', name: 'Hill', farmId: 'f1' }],
  events: [{ id: 'e1', farmId: 'f1' }, { id: 'e2', farmId: 'f1' }],
  eventPaddockWindows: [{ id: 'pw1', eventId: 'e1', locationId: 'l1', dateClosed: null }, { id: 'pw2', eventId: 'e2', locationId: 'l2', dateClosed: null }],
  eventGroupWindows: [{ id: 'gw1', eventId: 'e1', groupId: 'g1', dateLeft: null }, { id: 'gw2', eventId: 'e1', groupId: 'g2', dateLeft: null }],
};
const resolve = (ui, names, fields) => resolveEntryTarget({ ui, names, fields, rows: async table => data[table] ?? [] });

describe('entry target resolution (names -> host IDs, one question otherwise)', () => {
  it('matches exactly after case, surrounding punctuation and spoken numbers only; never fuzzy', async () => {
    expect(await resolve('treatment', { animal: 'forty-two' })).toMatchObject({ status: 'resolved', target: { id: 'a1' } });
    expect(await resolve('treatment', { animal: 'Tag Forty Two.' })).toMatchObject({ status: 'resolved', target: { id: 'a1' } });
    expect(await resolve('treatment', { animal: 'daisy' })).toMatchObject({ status: 'resolved', target: { id: 'a1' } });
    expect(await resolve('treatment', { animal: 'Daisey' })).toMatchObject({ status: 'question' });
    expect(await resolve('treatment', { animal: 'four two' })).toMatchObject({ status: 'question' });
    expect(await resolve('treatment', { animal: '420' })).toMatchObject({ status: 'question' });
  });
  it('treatment and calving resolve an animal by tag or name', async () => {
    expect(await resolve('treatment', { animal: 'tag 42' })).toMatchObject({ status: 'resolved', target: { ui: 'treatment', id: 'a1' } });
    expect(await resolve('calving', { animal: 'daisy' })).toMatchObject({ status: 'resolved', target: { ui: 'calving', id: 'a1' } });
  });
  it('asks exactly one question when a name is missing, unknown or ambiguous; never defaults', async () => {
    expect(await resolve('treatment', {})).toEqual({ status: 'question', question: 'Which animal was treated?' });
    expect(await resolve('calving', { animal: 'Gone' })).toEqual({ status: 'question', question: "I couldn't find an animal called “Gone”. Which cow calved?" });
    expect(await resolve('treatment', { animal: 'Rosie' })).toEqual({ status: 'question', question: 'Which animal did you mean: tag 43 (Rosie) or tag 44 (Rosie)?' });
    expect(await resolve('feeding', {})).toEqual({ status: 'question', question: 'Which paddock did you feed?' });
    expect(await resolve('move', { group: 'Heifers' })).toEqual({ status: 'question', question: 'Where are they moving to?' });
    expect(await resolve('place', { group: 'Bulls' })).toEqual({ status: 'question', question: 'Which paddock are you placing them in?' });
  });
  it('an unknown or ambiguous surface asks which first-slice entry was meant', async () => {
    expect(await resolve('harvest', {})).toEqual({ status: 'question', question: CHOOSE_ENTRY_QUESTION });
    expect(CHOOSE_ENTRY_QUESTION).toBe('Which entry did you mean: treatment, calving, feeding, move or place?');
  });
  it('feeding resolves the open event at the named paddock and fills locationId', async () => {
    expect(await resolve('feeding', { paddock: 'North 40' })).toMatchObject({ status: 'resolved', target: { ui: 'feeding', id: 'e1' }, fill: { locationId: 'l1' } });
    expect(await resolve('feeding', { paddock: 'River' })).toEqual({ status: 'question', question: 'Nothing is grazing River right now. Which paddock did you feed?' });
  });
  it('move by a group sharing an event is scoped to that group; by source paddock it is the whole event', async () => {
    expect(await resolve('move', { group: 'heifers', to: 'Hill' }, { destType: 'new' })).toMatchObject({ status: 'resolved', target: { ui: 'move', id: 'e1', farmId: 'f1', scopedGroupWindowId: 'gw1' }, fill: { locationId: 'l4' } });
    expect(await resolve('move', { from: 'North 40', to: 'Hill' })).toMatchObject({ target: { id: 'e1', scopedGroupWindowId: null } });
    expect(await resolve('move', { group: 'Heifers', to: 'South' }, { destType: 'join' })).toMatchObject({ fill: { existingEventId: 'e2' } });
    expect(await resolve('move', { group: 'Bulls', to: 'Hill' })).toEqual({ status: 'question', question: "Bulls isn't in a paddock right now. Which group are you moving?" });
  });
  it('place needs an unplaced group; the farm comes from the named destination paddock', async () => {
    expect(await resolve('place', { group: 'Bulls', to: 'River' })).toMatchObject({ status: 'resolved', target: { ui: 'place', id: 'g3', farmId: 'f2' }, fill: { locationId: 'l3' } });
    expect(await resolve('place', { group: 'Heifers', to: 'River' })).toEqual({ status: 'question', question: 'Heifers is already in a paddock. Did you mean a move?' });
  });
});
