/**
 * @file #449 dairy visibility from the store. Kept light (store + pure calcs
 * only) so the header can import it without pulling in the Milk page.
 */
import { getAll, getActiveFarmId } from '../../data/store.js';
import { isDairyVisible } from './milk-calcs.js';

/** Store context for the visibility rule. */
export function dairyCtxFromStore(farmId = getActiveFarmId()) {
  return {
    farmId,
    farms: getAll('farms'),
    farmSettings: getAll('farmSettings'),
    animals: getAll('animals'),
    animalClasses: getAll('animalClasses'),
  };
}

/** Visibility for the active farm (All farms: any farm shown). */
export function isDairyVisibleNow(farmId = getActiveFarmId()) {
  return isDairyVisible(dairyCtxFromStore(farmId));
}
