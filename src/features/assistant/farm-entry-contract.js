import { entryFieldHints, entryFieldSpec } from './entry-fields.js';
import { TREATMENT_ENTRY_FIELDS } from '../health/treatment-entry-fields.js';
import { CALVING_ENTRY_FIELDS } from '../health/calving-entry-fields.js';
import { FEEDING_ENTRY_FIELDS } from '../feed/delivery-entry-fields.js';
import { MOVE_ENTRY_FIELDS } from '../events/move-wizard-entry-fields.js';
import { PLACE_ENTRY_FIELDS } from '../events/place-wizard-entry-fields.js';

/** DOM-free description of the five existing entry UIs, shared by the browser
 * review bridge and the backend context/validation. The browser UI binding stays
 * authoritative: unknown fields are rejected when the normal UI is populated.
 */
export const FARM_ENTRY_UIS = Object.freeze(['treatment', 'calving', 'feeding', 'move', 'place']);
export const FARM_ENTRY_INSTRUCTIONS = 'Match intent to an existing entry UI. Use its required/optional fields as prompts. Present that normal UI populated; correction needs a new revision and confirmation. Missing evidence is not no.';
/** Record each UI opens on; target IDs come from host resolution, never model output. */
export const FARM_ENTRY_TARGET_TABLE = Object.freeze({ treatment: 'animals', calving: 'animals', feeding: 'events', move: 'events', place: 'groups' });
/** Field definitions owned by each sheet; the sheets bind their review fields
 * through these same objects, so hints cannot drift from the sheets. */
export const FARM_ENTRY_DEFINITIONS = Object.freeze({ treatment: TREATMENT_ENTRY_FIELDS, calving: CALVING_ENTRY_FIELDS, feeding: FEEDING_ENTRY_FIELDS, move: MOVE_ENTRY_FIELDS, place: PLACE_ENTRY_FIELDS });
/** Derived, never hand-written: {fields:[{name,required}], dynamicFields:[{name,required,when}]}.
 * The exact dynamic set of an open sheet is reported separately (openEntryFields). */
export const FARM_ENTRY_FIELD_HINTS = Object.freeze(Object.fromEntries(FARM_ENTRY_UIS.map(ui => [ui, entryFieldHints(FARM_ENTRY_DEFINITIONS[ui])])));

/** Validates the field names an open sheet reports (only declared names survive). */
export function openEntryFields(ui, names) {
  const definition = FARM_ENTRY_DEFINITIONS[ui];
  if (!definition || !Array.isArray(names)) return null;
  const valid = names.filter(name => typeof name === 'string' && entryFieldSpec(definition, name));
  return valid.length === names.length ? valid.map(name => ({ name, required: entryFieldSpec(definition, name).required })) : null;
}
