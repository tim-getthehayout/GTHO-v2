import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { resetForms, seed, button, fill, queueSpy, OP, FARM } from './manual-entry-helpers.js';
import { getAll, init, getById } from '../../src/data/store.js';
import * as Animal from '../../src/entities/animal.js';
import * as Class from '../../src/entities/animal-class.js';
import * as AiBull from '../../src/entities/ai-bull.js';
import * as Pref from '../../src/entities/user-preference.js';
import * as Bcs from '../../src/entities/animal-bcs-score.js';
import { openBreedingSheet } from '../../src/features/health/breeding.js';
import { openBcsSheet } from '../../src/features/health/bcs.js';
import { openHeatSheet } from '../../src/features/health/heat.js';
import { openAnimalSheet } from '../../src/features/animals/index.js';
import { renderFieldModeHome, FIELD_MODULES_DEFAULT } from '../../src/features/field-mode/index.js';
vi.mock('../../src/features/auth/session.js', async original => ({ ...await original(), getUser: () => ({ id: 'user' }) }));
let animal, queued;
beforeEach(() => { resetForms(); animal = seed('animals', Animal, { id: 'female', tagNum: 'A1', sex: 'female' }); queued = queueSpy(); });
afterEach(() => vi.restoreAllMocks());
const panel = id => document.getElementById(id + '-sheet-panel');
function dates(root, time = '13:45') { fill(root, 'input[type="date"]', '2026-03-08'); fill(root, 'input[type="time"]', time); }
it.each(['13:45', ''])('breeding heat Save routes only to heat records with time %s', time => {
  openBreedingSheet(animal, OP); const root = panel('breeding'); dates(root, time); fill(root, 'textarea', 'Standing heat'); button(root, 'Save').click();
  expect(getAll('animalBreedingRecords')).toHaveLength(0);
  expect(getAll('animalHeatRecords')).toHaveLength(1);
  expect(getAll('animalHeatRecords')[0]).toMatchObject({ animalId: animal.id, observedAt: `2026-03-08T${time || '00:00'}:00`, notes: 'Standing heat' });
  expect(queued('animal_heat_records')[0].observed_at).toBe(`2026-03-08T${time || '00:00'}:00`);
});
it.each(['ai', 'bull'])('actual %s breeding persists timestamps, expected date and selected reference', method => {
  const sire = method === 'ai' ? seed('aiBulls', AiBull, { name: 'AI sire' }) : seed('animals', Animal, { sex: 'male', tagNum: 'S1' });
  openBreedingSheet(animal, OP); const root = panel('breeding'); dates(root);
  fill(root, 'select', method, 'change'); const section = root.querySelector(method === 'ai' ? '#ae-evt-ai-fields' : '#ae-evt-bull-fields');
  fill(section, 'select', sire.id, 'change'); root.querySelectorAll('input[type="date"]')[1].value = '2026-12-16';
  button(root, 'Save').click(); const row = getAll('animalBreedingRecords')[0];
  expect(row).toMatchObject({ animalId: animal.id, bredAt: '2026-03-08T13:45:00', expectedCalving: '2026-12-16', method });
  expect(row[method === 'ai' ? 'sireAiBullId' : 'sireAnimalId']).toBe(sire.id);
  expect(queued('animal_breeding_records').at(-1)).toMatchObject({ bred_at: '2026-03-08T13:45:00', expected_calving: '2026-12-16' });
  init(); expect(getById('animalBreedingRecords', row.id).bredAt).toBe(row.bredAt);
});
it.each(['breeding', 'bcs', 'heat'])('%s invalid date writes no row', kind => {
  ({ breeding: openBreedingSheet, bcs: openBcsSheet, heat: openHeatSheet })[kind](animal, OP);
  const root = panel(kind); if (kind === 'bcs') button(root, '3').click();
  fill(root, 'input[type="date"]', ''); button(root, 'Save').click();
  for (const type of ['animalBreedingRecords', 'animalBcsScores', 'animalHeatRecords']) expect(getAll(type)).toHaveLength(0);
  expect(root.querySelector('.auth-error').textContent).not.toBe('');
});
it.each([['sheep', 5], ['goat', 5], ['beef_cattle', 9]])('%s BCS uses its existing %s scale and scoredAt', (species, max) => {
  const cls = seed('animalClasses', Class, { name: 'Dam', species, role: 'cow' });
  openBcsSheet({ ...animal, classId: cls.id }, OP); const root = panel('bcs'); dates(root); button(root, String(max)).click(); button(root, 'Save').click();
  expect(getAll('animalBcsScores')[0]).toMatchObject({ animalId: animal.id, score: max, scoredAt: '2026-03-08T13:45:00', likelyCull: false });
  expect(queued('animal_bcs_scores')[0]).toMatchObject({ score: max, scored_at: '2026-03-08T13:45:00', likely_cull: false });
  expect(Bcs.validate({ ...getAll('animalBcsScores')[0], score: Infinity }).valid).toBe(false);
  expect(Bcs.validate({ ...getAll('animalBcsScores')[0], score: 6 }, { maxScore: 5 }).valid).toBe(false);
});
it('BCS requires an actual chosen score; standalone heat is reached from animal edit', () => {
  openBcsSheet(animal, OP); button(panel('bcs'), 'Save').click(); expect(getAll('animalBcsScores')).toHaveLength(0);
  openAnimalSheet(animal, OP, FARM); button(panel('ae'), '+ Record heat').click();
  const root = panel('heat'); dates(root, ''); fill(root, 'textarea', 'Observed'); button(root, 'Save').click();
  expect(getAll('animalHeatRecords')[0]).toMatchObject({ animalId: animal.id, observedAt: '2026-03-08T00:00:00', notes: 'Observed' });
});
it('enabled Field-mode heat retains its canonical Save without changing default actions', () => {
  expect(FIELD_MODULES_DEFAULT).not.toContain('heat'); seed('userPreferences', Pref, { userId: 'user', fieldModeQuickActions: ['heat'] });
  const mount = document.createElement('div'); document.body.append(mount); renderFieldModeHome(mount);
  mount.querySelector('[data-testid="field-mode-tile-heat"]').click();
  const picker = document.querySelector('#hp-sheet-panel'); [...picker.querySelectorAll('div')].filter(node => node.textContent === 'A1').at(-1).click();
  dates(picker, ''); fill(picker, 'textarea', 'Field observation'); button(picker, 'Save').click();
  expect(getAll('animalHeatRecords')[0]).toMatchObject({ observedAt: '2026-03-08T00:00:00', notes: 'Field observation' });
  expect(queued('animal_heat_records')[0].observed_at).toBe('2026-03-08T00:00:00');
});

it.each(['breeding', 'bcs', 'heat'])('%s rejects malformed time rather than coercing it', kind => {
  ({ breeding: openBreedingSheet, bcs: openBcsSheet, heat: openHeatSheet })[kind](animal, OP);
  const root = panel(kind); if (kind === 'bcs') button(root, '3').click();
  Object.defineProperty(root.querySelector('input[type="time"]'), 'value', { value: '25:61', configurable: true });
  button(root, 'Save').click();
  for (const type of ['animalBreedingRecords', 'animalBcsScores', 'animalHeatRecords']) expect(getAll(type)).toHaveLength(0);
});
