import { describe, it, expect } from 'vitest';
import { defineEntryFields, bindEntryFields, entryFieldSpec } from '../../../src/features/assistant/entry-fields.js';
import { FARM_ENTRY_FIELD_HINTS, FARM_ENTRY_UIS, openEntryFields } from '../../../src/features/assistant/farm-entry-contract.js';

const field = () => ({ get: () => null, set: () => {} });

describe('sheet-owned entry field definitions', () => {
  it('bind only declared fields, require every static field and take required from the definition', () => {
    const definition = defineEntryFields('x', { date: { required: true }, notes: {} }, { 'feed:*': { required: true, when: 'per line' }, extra: {} });
    const bound = bindEntryFields(definition, { date: field(), notes: field(), 'feed:a|b': field() });
    expect(Object.fromEntries(Object.entries(bound).map(([name, spec]) => [name, spec.required]))).toEqual({ date: true, notes: false, 'feed:a|b': true });
    expect(() => bindEntryFields(definition, { date: field(), notes: field(), invented: field() })).toThrow('undeclared-entry-field:x.invented');
    expect(() => bindEntryFields(definition, { date: field() })).toThrow('missing-entry-field:x.notes');
    expect(entryFieldSpec(definition, 'feed:')).toBeNull();
  });
  it('hints exist for exactly the five first-slice surfaces, with required flags and dynamic conditions', () => {
    expect(Object.keys(FARM_ENTRY_FIELD_HINTS).sort()).toEqual([...FARM_ENTRY_UIS].sort());
    expect(FARM_ENTRY_FIELD_HINTS.treatment.fields.filter(f => f.required).map(f => f.name)).toEqual(['date', 'treatmentTypeId']);
    expect(FARM_ENTRY_FIELD_HINTS.move.dynamicFields.map(f => f.name)).toEqual(['dateIn', 'timeIn', 'postGraze', 'preGraze', 'feed:*']);
    expect(FARM_ENTRY_FIELD_HINTS.move.dynamicFields.every(f => typeof f.when === 'string')).toBe(true);
  });
  it('accepts an open sheet field list only when every name is declared', () => {
    expect(openEntryFields('move', ['dateOut', 'destType', 'feed:b|l'])).toEqual([{ name: 'dateOut', required: true }, { name: 'destType', required: true }, { name: 'feed:b|l', required: true }]);
    expect(openEntryFields('move', ['dateOut', 'made-up'])).toBeNull();
    expect(openEntryFields('weather', ['date'])).toBeNull();
  });
});

describe('open-sheet field hint', () => {
  it('parses only declared names for a first-slice sheet', async () => {
    const { parseOpenSheet } = await import('../../../src/features/assistant/server/compose.js');
    const encode = value => value;
    expect(parseOpenSheet(encode({ ui: 'calving', fields: ['date', 'driedOffDate'] }))).toEqual({ ui: 'calving', fields: [{ name: 'date', required: true }, { name: 'driedOffDate', required: false }] });
    expect(parseOpenSheet(encode({ ui: 'calving', fields: ['date', 'bogus'] }))).toBeNull();
    expect(parseOpenSheet('move')).toBeNull();
    expect(parseOpenSheet(null)).toBeNull();
  });
  it('the API sends the open sheet with each command until cleared', async () => {
    const { createAssistantApi } = await import('../../../src/features/assistant/client/api.js');
    const seen = [];
    const api = createAssistantApi({ supabaseUrl: 'https://p.invalid', anonKey: 'a', getAccessToken: async () => 'jwt', fetch: async (url, init) => { seen.push(JSON.parse(init.body).openSheet); return Response.json({ session: {} }); } });
    api.setOpenSheet({ ui: 'move', fields: ['dateOut', 'feed:b|l'] });
    await api.command('c', 'turn');
    api.setOpenSheet(null);
    await api.command('c', 'turn');
    expect(seen[0]).toEqual({ ui: 'move', fields: ['dateOut', 'feed:b|l'] });
    expect(seen[1]).toBeUndefined();
  });
});
