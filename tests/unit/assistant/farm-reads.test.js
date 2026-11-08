import { describe, it, expect, vi } from 'vitest';
import { assessOpenAnimal, createFarmReadPort, FARM_READ_TOOLS } from '../../../src/features/assistant/farm-reads.js';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const operationId = id(1), actorId = id(2), foreign = id(3);
const scope = { operationId, actorId };
const animal = { id: id(4), operationId, active: true, sex: 'female', classId: id(5), confirmedBred: false };
const cow = { id: id(5), operationId, role: 'cow', name: 'A label that is not used as a role' };
function setup(patch = {}) {
  const data = { animals: [animal], animalClasses: [cow], animalBreedingRecords: [], animalHeatRecords: [], animalCalvingRecords: [], locations: [], events: [], eventPaddockWindows: [], ...patch };
  const authorize = vi.fn(async () => true);
  const getAll = vi.fn(entity => data[entity] || []);
  return { data, authorize, getAll, read: createFarmReadPort({ authorize, getAll }) };
}
describe('stored open set, not a default unchecked checkbox or pregnancy diagnosis', () => {
  it.each(['cow', 'heifer'])('includes active female %s with explicit false', role => {
    expect(assessOpenAnimal(animal, { ...cow, role })).toMatchObject({ state: 'known', value: true });
  });
  it.each([
    [{ sex: 'male' }, {}], [{ active: false }, {}], [{ cullDate: '2026-11-01' }, {}],
    [{ confirmedBred: true }, {}], [{}, { role: 'calf', name: 'Cow' }],
    [{}, { role: 'bull' }], [{}, { role: 'ewe' }],
  ])('excludes males, calves, non-cow/heifer roles and inactive/culled/bred animals', (patch, cls) => {
    expect(assessOpenAnimal({ ...animal, ...patch }, { ...cow, ...cls })).toMatchObject({ state: 'known', value: false });
  });
  it.each([
    [{ active: undefined }, cow], [{ sex: undefined }, cow], [{ confirmedBred: undefined }, cow],
    [{}, undefined], [{}, { ...cow, role: '' }],
  ])('does not replace missing reproductive evidence with no', (patch, cls) => {
    expect(assessOpenAnimal({ ...animal, ...patch }, cls).state).toBe('unknown');
  });
});
describe('authorized farm reads', () => {
  it('uses capability names, not an exhaustive list of question phrases', () => {
    expect(FARM_READ_TOOLS.map(tool => tool.name)).toEqual(['animal-reproductive-evidence', 'open-animal-set', 'paddock-grazing-evidence']);
  });
  it('uses the same open predicate for a named animal and count, and returns scoped evidence', async () => {
    const foreignRecord = { id: id(15), operationId: foreign, animalId: animal.id, damId: animal.id };
    const ownedRecord = { ...foreignRecord, id: id(16), operationId };
    const { read } = setup({ animals: [animal, { ...animal, id: id(6), sex: 'male' }, { ...animal, id: id(7), confirmedBred: undefined }, { ...animal, id: id(8), operationId: foreign }], animalBreedingRecords: [ownedRecord, foreignRecord], animalHeatRecords: [ownedRecord, foreignRecord], animalCalvingRecords: [ownedRecord, foreignRecord] });
    const named = await read(scope, 'animal-reproductive-evidence', { animalId: animal.id });
    const set = await read(scope, 'open-animal-set');
    expect(named.open.value).toBe(true);
    expect(named.breedingRecords).toEqual([ownedRecord]);
    expect(named.heatRecords).toEqual([ownedRecord]);
    expect(named.calvingRecords).toEqual([ownedRecord]);
    expect(set.animals.map(row => row.id)).toEqual([animal.id]);
    expect(set.headCount).toBe(1);
    expect(set.unresolvedAnimalIds).toEqual([id(7)]);
  });
  it('uses existing head-count semantics for a composite instead of counting its row as one', async () => {
    const { read } = setup({ animals: [{ ...animal, isBulk: true, bulkHeadCount: 12 }] });
    expect((await read(scope, 'open-animal-set')).headCount).toBe(12);
  });
  it('does not use a class from another operation', async () => {
    const { read } = setup({ animalClasses: [{ ...cow, operationId: foreign }] });
    expect((await read(scope, 'animal-reproductive-evidence', { animalId: animal.id })).open.state).toBe('unknown');
  });
  it('does not disclose a foreign animal as found or treat a missing one as not open', async () => {
    const { read } = setup({ animals: [{ ...animal, operationId: foreign }] });
    expect(await read(scope, 'animal-reproductive-evidence', { animalId: animal.id })).toEqual({ state: 'unknown', reason: 'animal-not-found' });
  });
  it('rechecks authorization on every read before retrieving any data', async () => {
    const { read, authorize, getAll } = setup();
    authorize.mockResolvedValueOnce(false);
    await expect(read(scope, 'open-animal-set')).rejects.toThrow('unauthorized');
    expect(getAll).not.toHaveBeenCalled();
    await read(scope, 'open-animal-set');
    authorize.mockRejectedValueOnce(new Error('revoked'));
    await expect(read(scope, 'open-animal-set')).rejects.toThrow('revoked');
    expect(authorize).toHaveBeenCalledTimes(3);
  });
  it('rejects unrecognized tools, malformed IDs, SQL/identity injections and missing bindings', async () => {
    const { read } = setup();
    await expect(read(scope, 'sql', {})).rejects.toThrow('not-allowed');
    await expect(read(scope, 'animal-reproductive-evidence', { animalId: 'cow' })).rejects.toThrow('invalid-arguments');
    await expect(read(scope, 'open-animal-set', { operationId: foreign })).rejects.toThrow('invalid-arguments');
    await expect(read({}, 'open-animal-set')).rejects.toThrow('unauthorized');
    expect(() => createFarmReadPort({})).toThrow('bindings-required');
  });
  it('returns independently copied evidence without writing to or sorting source records', async () => {
    const { read, data } = setup();
    const before = JSON.stringify(data);
    const result = await read(scope, 'animal-reproductive-evidence', { animalId: animal.id });
    result.animal.confirmedBred = true;
    result.animalClass.role = 'bull';
    expect(JSON.stringify(data)).toBe(before);
  });
  it('uses the normal last-closed-graze helper and reports active windows separately', async () => {
    const location = { id: id(20), operationId, name: 'Paddock' };
    const event = { id: id(21), operationId };
    const base = { operationId, locationId: location.id, eventId: event.id };
    const earlier = { ...base, id: id(22), dateClosed: '2026-11-01', timeClosed: '10:00' };
    const later = { ...base, id: id(23), dateClosed: '2026-11-01', timeClosed: '12:00' };
    const active = { ...base, id: id(24), dateClosed: null };
    const { read, data } = setup({ locations: [location], events: [event], eventPaddockWindows: [earlier, active, later, { ...later, id: id(25), operationId: foreign, dateClosed: '2026-11-08' }, { ...later, id: id(26), eventId: id(27), dateClosed: '2026-11-07' }] });
    const before = JSON.stringify(data);
    const result = await read(scope, 'paddock-grazing-evidence', { locationId: location.id });
    expect(result.lastClosed).toEqual({ state: 'known', value: later });
    expect(result.currentWindows).toEqual([active]);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('missing paddock or closed windows means missing evidence, not never grazed', async () => {
    const { read } = setup({ locations: [{ id: id(20), operationId }] });
    expect((await read(scope, 'paddock-grazing-evidence', { locationId: id(20) })).lastClosed.state).toBe('unknown');
    expect((await read(scope, 'paddock-grazing-evidence', { locationId: id(21) })).state).toBe('unknown');
  });
});
