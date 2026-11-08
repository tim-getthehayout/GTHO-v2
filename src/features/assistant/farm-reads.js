/** GTHO-owned read capabilities. No utterance catalog, writes or model-memory answers. */
import { animalHeadCount } from '../../calcs/window-helpers.js';
import { lastClosedGraze } from '../map/paddock-facts.js';

export const FARM_READ_TOOLS = Object.freeze([
  { name: 'animal-reproductive-evidence', description: 'Read one resolved animal ID, stored open-set assessment and reproductive evidence.' },
  { name: 'open-animal-set', description: 'Read the active female cow/heifer set with confirmedBred false, head count and unresolved evidence.' },
  { name: 'paddock-grazing-evidence', description: 'Read one resolved paddock ID, its latest closed grazing window and current windows.' },
]);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const unknown = reason => ({ state: 'unknown', reason });

/** Same predicate for named animals and counts; class role is authoritative, never its label. */
export function assessOpenAnimal(animal, animalClass) {
  if (!animal) return unknown('animal-not-found');
  if (animal.active === false || animal.cullDate || animal.sex === 'male') {
    return { state: 'known', value: false, reason: 'outside-open-set' };
  }
  if (animalClass?.role && !['cow', 'heifer'].includes(animalClass.role)) {
    return { state: 'known', value: false, reason: 'outside-open-set' };
  }
  if (animal.active !== true || animal.sex !== 'female' || !animalClass?.role || typeof animal.confirmedBred !== 'boolean') {
    return unknown('incomplete-open-set-evidence');
  }
  return { state: 'known', value: animal.confirmedBred === false, reason: 'stored-open-set-definition' };
}

/**
 * The trusted binding must verify signed identity AND current operation membership,
 * returning true or throwing. getAll may read the local store or an authorized backend.
 * This port never treats an ephemeral transport token as farm authorization.
 */
export function createFarmReadPort({ authorize, getAll }) {
  if (typeof authorize !== 'function' || typeof getAll !== 'function') throw new Error('farm-read-bindings-required');
  return async (scope, name, args = {}) => {
    if (!uuid(scope?.operationId) || !uuid(scope?.actorId) || await authorize(scope) !== true) throw new Error('farm-read-unauthorized');
    const field = name === 'animal-reproductive-evidence' ? 'animalId' : name === 'paddock-grazing-evidence' ? 'locationId' : null;
    if (!FARM_READ_TOOLS.some(tool => tool.name === name)) throw new Error('farm-read-tool-not-allowed');
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => key !== field) || (field && !uuid(args[field]))) throw new Error('farm-read-invalid-arguments');
    const rows = async entity => (await getAll(entity)).filter(row => row.operationId === scope.operationId);
    let result;
    if (name === 'paddock-grazing-evidence') {
      const location = (await rows('locations')).find(row => row.id === args.locationId);
      if (!location) return unknown('paddock-not-found');
      const events = new Set((await rows('events')).map(row => row.id));
      const windows = (await rows('eventPaddockWindows')).filter(row => row.locationId === location.id && events.has(row.eventId));
      const closed = lastClosedGraze(location.id, windows);
      result = { location, lastClosed: closed ? { state: 'known', value: closed } : unknown('no-closed-grazing-evidence'), currentWindows: windows.filter(row => !row.dateClosed) };
    } else {
      const animals = await rows('animals');
      const classes = new Map((await rows('animalClasses')).map(row => [row.id, row]));
      if (name === 'open-animal-set') {
        const open = [], unresolved = [];
        for (const animal of animals) {
          const assessment = assessOpenAnimal(animal, classes.get(animal.classId));
          if (assessment.state === 'unknown') unresolved.push(animal.id);
          else if (assessment.value) open.push(animal);
        }
        result = { animals: open, headCount: open.reduce((sum, animal) => sum + animalHeadCount(animal), 0), unresolvedAnimalIds: unresolved };
      } else {
        const animal = animals.find(row => row.id === args.animalId);
        if (!animal) return unknown('animal-not-found');
        const animalClass = classes.get(animal.classId);
        result = {
          animal, animalClass: animalClass ?? null, open: assessOpenAnimal(animal, animalClass),
          breedingRecords: (await rows('animalBreedingRecords')).filter(row => row.animalId === animal.id),
          heatRecords: (await rows('animalHeatRecords')).filter(row => row.animalId === animal.id),
          calvingRecords: (await rows('animalCalvingRecords')).filter(row => row.damId === animal.id),
        };
      }
    }
    // A downstream model/provider cannot mutate local records through returned references.
    return globalThis.structuredClone(result);
  };
}
