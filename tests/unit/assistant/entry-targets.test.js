import { describe, it, expect } from 'vitest';
import { resolveEntryTarget, CHOOSE_ENTRY_QUESTION } from '../../../src/features/assistant/entry-targets.js';

const data = {
  animals: [{ id: 'a1', tagNum: '42', name: 'Daisy', active: true }, { id: 'a2', tagNum: '43', name: 'Rosie', active: true }, { id: 'a3', tagNum: '44', name: 'Rosie', active: true }, { id: 'a4', tagNum: '45', name: 'Gone', active: false }],
  groups: [{ id: 'g1', name: 'Heifers' }, { id: 'g2', name: 'Cows' }, { id: 'g3', name: 'Bulls' }, { id: 'g4', name: 'Old', archivedAt: '2026-01-01' }, { id: 'g5', name: 'Steers' }],
  locations: [
    { id: 'l1', name: 'North 40', farmId: 'f1' }, { id: 'l2', name: 'South', farmId: 'f1' },
    { id: 'l3', name: 'River', farmId: 'f2' }, { id: 'l4', name: 'Hill', farmId: 'f1' },
    { id: 'l5', name: 'E - 1', farmId: 'f1' }, { id: 'l6', name: 'E - 2', farmId: 'f1' },
    { id: 'l7', name: 'E-11', farmId: 'f1' }, { id: 'l8', name: 'Corral', fieldCode: 'e1', farmId: 'f1' },
  ],
  events: [{ id: 'e1', farmId: 'f1' }, { id: 'e2', farmId: 'f1' }, { id: 'e3', farmId: 'f1', dateOut: '2026-11-01' }, { id: 'e4', farmId: 'f1' }],
  eventPaddockWindows: [
    { id: 'pw1', eventId: 'e1', locationId: 'l1', dateClosed: null },
    { id: 'pw2', eventId: 'e2', locationId: 'l2', dateClosed: null },
    { id: 'pw5', eventId: 'e4', locationId: 'l5', dateClosed: null },
    { id: 'pw6', eventId: 'e4', locationId: 'l6', dateClosed: null },
    { id: 'pw7', eventId: 'e4', locationId: 'l7', dateClosed: null },
    { id: 'pw8', eventId: 'e3', locationId: 'l5', dateClosed: null },
  ],
  eventGroupWindows: [{ id: 'gw1', eventId: 'e1', groupId: 'g1', dateLeft: null }, { id: 'gw2', eventId: 'e1', groupId: 'g2', dateLeft: null }, { id: 'gw5', eventId: 'e2', groupId: 'g5', dateLeft: null }],
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
    expect(await resolve('feeding', {})).toMatchObject({ status: 'question', question: 'How many bales, and which paddock?', pending: { field: 'paddock', ui: 'feeding' } });
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
  it('move by a group is scoped to that group like the UI group launch; by source paddock it is the whole event', async () => {
    expect(await resolve('move', { group: 'heifers', to: 'Hill' }, { destType: 'new' })).toMatchObject({ status: 'resolved', target: { ui: 'move', id: 'e1', farmId: 'f1', scopedGroupWindowId: 'gw1' }, fill: { locationId: 'l4' } });
    expect(await resolve('move', { from: 'North 40', to: 'Hill' })).toMatchObject({ target: { id: 'e1', scopedGroupWindowId: null } });
    // Like the UI group Move buttons, a group alone on its event is still a scoped (scoped-last) move.
    expect(await resolve('move', { group: 'Steers', to: 'Hill' })).toMatchObject({ target: { id: 'e2', scopedGroupWindowId: 'gw5' } });
    expect(await resolve('move', { from: 'South', to: 'Hill' })).toMatchObject({ target: { id: 'e2', scopedGroupWindowId: null } });
    // Cross-farm destination: the destination farm is left for the sheet.
    expect(await resolve('move', { group: 'Steers', to: 'River' })).toMatchObject({ status: 'resolved', target: { farmId: 'f1' }, fill: { locationId: 'l3' } });
    expect(await resolve('move', { group: 'Heifers', to: 'South' }, { destType: 'join' })).toMatchObject({ fill: { existingEventId: 'e2' } });
    expect(await resolve('move', { group: 'Bulls', to: 'Hill' })).toEqual({ status: 'question', question: "Bulls isn't in a paddock right now. Which group are you moving?" });
  });
  it('place needs an unplaced group; the farm comes from the named destination paddock', async () => {
    expect(await resolve('place', { group: 'Bulls', to: 'River' })).toMatchObject({ status: 'resolved', target: { ui: 'place', id: 'g3', farmId: 'f2' }, fill: { locationId: 'l3' } });
    expect(await resolve('place', { group: 'Heifers', to: 'River' })).toEqual({ status: 'question', question: 'Heifers is already in a paddock. Did you mean a move?' });
  });
});

describe('feeding paddock aliases and multi-target resolution (OI-0206)', () => {
  it('resolves e1, E-1 and E - 1 to E - 1 when that alias is unique', async () => {
    // Remove the colliding Corral fieldCode for this uniqueness check via a local table.
    const rows = async table => {
      if (table === 'locations') return data.locations.filter(row => row.id !== 'l8');
      return data[table] ?? [];
    };
    const run = (name) => resolveEntryTarget({ ui: 'feeding', names: { paddock: name }, rows });
    for (const name of ['e1', 'E-1', 'E - 1']) {
      expect(await run(name)).toMatchObject({ status: 'resolved', target: { id: 'e4' }, fill: { locationId: 'l5' } });
    }
    expect(await run('E-11')).toMatchObject({ status: 'resolved', fill: { locationId: 'l7' } });
  });

  it('asks for disambiguation when aliases collide and never picks the first match', async () => {
    const result = await resolve('feeding', { paddock: 'e1' });
    expect(result.status).toBe('question');
    expect(result.question).toMatch(/E - 1/);
    expect(result.question).toMatch(/Corral/);
  });

  it('replaces the colliding alias with a short disambiguating answer and keeps date and lines', async () => {
    const rows = async table => {
      if (table === 'eventPaddockWindows') {
        return [...data.eventPaddockWindows, { id: 'pw8', eventId: 'e4', locationId: 'l8', dateClosed: null }];
      }
      return data[table] ?? [];
    };
    const result = await resolveEntryTarget({
      ui: 'feeding',
      names: {},
      fields: {},
      utterance: 'Corral',
      pendingClarification: {
        field: 'paddock',
        ui: 'feeding',
        names: { paddock: 'e1' },
        fields: { date: '2026-11-09', time: '13:00', lines: [{ batchId: 'b1', qty: 4 }] },
      },
      rows,
    });
    expect(result).toMatchObject({
      status: 'resolved',
      target: { ui: 'feeding', id: 'e4' },
      fill: { locationId: 'l8' },
    });
  });

  it('keeps two named paddocks on the same open event and does not collapse them', async () => {
    const rows = async table => {
      if (table === 'locations') return data.locations.filter(row => row.id !== 'l8');
      return data[table] ?? [];
    };
    const result = await resolveEntryTarget({
      ui: 'feeding', names: { paddock: 'e1, e2' }, rows,
    });
    expect(result).toMatchObject({
      status: 'resolved',
      target: { ui: 'feeding', id: 'e4' },
      fill: { locationId: 'l5', locationIds: ['l5', 'l6'] },
    });
    expect(result.summary).toContain('E - 1');
    expect(result.summary).toContain('E - 2');
  });

  it('accepts an array of two names the same way as a comma-separated string', async () => {
    const rows = async table => {
      if (table === 'locations') return data.locations.filter(row => row.id !== 'l8');
      return data[table] ?? [];
    };
    const result = await resolveEntryTarget({
      ui: 'feeding', names: { paddock: ['E - 1', 'E - 2'] }, rows,
    });
    expect(result.fill.locationIds).toEqual(['l5', 'l6']);
  });

  it('rejects closed paddocks and closed or missing parent events', async () => {
    const rows = async table => {
      if (table === 'eventPaddockWindows') {
        return [{ id: 'pw-closed', eventId: 'e4', locationId: 'l5', dateClosed: '2026-11-02' }];
      }
      return data[table] ?? [];
    };
    expect(await resolveEntryTarget({ ui: 'feeding', names: { paddock: 'E - 1' }, rows })).toMatchObject({
      status: 'question',
    });
    const closedParent = async table => {
      if (table === 'locations') return data.locations.filter(row => row.id !== 'l8');
      if (table === 'eventPaddockWindows') return data.eventPaddockWindows.filter(row => row.eventId === 'e3');
      return data[table] ?? [];
    };
    expect(await resolveEntryTarget({ ui: 'feeding', names: { paddock: 'E - 1' }, rows: closedParent })).toEqual({
      status: 'question',
      question: 'Nothing is grazing E - 1 right now. Which paddock did you feed?',
    });
  });

  it('does not silently merge paddocks on different open events', async () => {
    const result = await resolve('feeding', { paddock: 'North 40, South' });
    expect(result.status).toBe('question');
    expect(result.question).toMatch(/different events/i);
  });

  it('asks whether a stated quantity is a total or per paddock and does not guess', async () => {
    const rows = async table => {
      if (table === 'locations') return data.locations.filter(row => row.id !== 'l8');
      return data[table] ?? [];
    };
    const result = await resolveEntryTarget({
      ui: 'feeding',
      names: { paddock: 'e1, e2' },
      fields: { lines: [{ qty: 4 }] },
      rows,
    });
    expect(result.status).toBe('question');
    expect(result.question).toMatch(/total/i);
    expect(result.question).toMatch(/per paddock/i);
  });
});

describe('feeding clarification continuity (OI-0206)', () => {
  const rows = async table => {
    if (table === 'locations') return data.locations.filter(row => row.id !== 'l8');
    return data[table] ?? [];
  };

  it('a short "e1" reply fills the pending paddock and keeps date, time and lines', async () => {
    const result = await resolveEntryTarget({
      ui: 'feeding',
      names: {},
      fields: {},
      utterance: 'e1',
      pendingClarification: {
        field: 'paddock',
        names: {},
        fields: { date: '2026-11-09', time: '13:00', lines: [{ batchId: 'b1', qty: 4 }] },
      },
      rows,
    });
    expect(result).toMatchObject({
      status: 'resolved',
      target: { ui: 'feeding', id: 'e4' },
      fill: { locationId: 'l5' },
    });
  });

  it('a short "total" reply does not invent a 2/2 split and asks for allocation', async () => {
    const result = await resolveEntryTarget({
      ui: 'feeding',
      names: { paddock: 'e1, e2' },
      fields: {},
      utterance: 'total',
      pendingClarification: {
        field: 'quantityBasis',
        names: { paddock: 'e1, e2' },
        fields: { date: '2026-11-09', lines: [{ batchId: 'b1', qty: 4 }] },
        fill: { locationId: 'l5', locationIds: ['l5', 'l6'] },
      },
      rows,
    });
    expect(result.status).toBe('question');
    expect(result.question).toMatch(/allocated/i);
    expect(result.pending.field).toBe('lineAllocations');
    expect(result.pending.fields.quantityBasis).toBe('total');
    expect(result.pending.fields.date).toBe('2026-11-09');
  });
it('asks for the leftover check time when timing is before, and never invents a same-instant time', async () => {
    const result = await resolveEntryTarget({
      ui: 'feeding',
      names: { paddock: 'e1' },
      fields: { lines: [{ batchId: 'b1', qty: 4 }], carryover: { remainingQuantity: 2, timing: 'before', batchId: 'b1' } },
      rows,
    });
    expect(result.status).toBe('question');
    expect(result.pending.field).toBe('carryoverTime');
    expect(result.question).toMatch(/time/i);
  });

  it('asks how to split a leftover across paddocks instead of copying it onto every target', async () => {
    const result = await resolveEntryTarget({
      ui: 'feeding',
      names: { paddock: 'e1, e2' },
      fields: { lines: [{ batchId: 'b1', qty: 4 }], quantityBasis: 'per-paddock', carryover: { remainingQuantity: 2, timing: 'same-instant', batchId: 'b1' } },
      rows,
    });
    expect(result.status).toBe('question');
    expect(result.pending.field).toBe('carryoverSplit');
  });

  it('ties an unallocated leftover to the single paddock it applies to', async () => {
    const result = await resolveEntryTarget({
      ui: 'feeding',
      names: { paddock: 'e1' },
      fields: { lines: [{ batchId: 'b1', qty: 4 }], carryover: { remainingQuantity: 2, timing: 'same-instant', batchId: 'b1' } },
      rows,
    });
    expect(result.status).toBe('resolved');
    expect(result.fill.carryover.items).toEqual([
      expect.objectContaining({ locationId: 'l5', remainingQuantity: 2, batchId: 'b1' }),
    ]);
  });
});
