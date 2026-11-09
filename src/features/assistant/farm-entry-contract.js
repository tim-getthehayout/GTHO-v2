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
export const FARM_ENTRY_INSTRUCTIONS = [
  'Pick exactly one entry surface from data.entryUis (the only voice-entry surfaces). If the request fits none or more than one, answer with exactly data.chooseEntryQuestion and nothing else.',
  'Put the farm, paddock, group or animal names exactly as the user said them in fields.entryTarget using only the keys in data.targetNames for that surface (move: group or from, plus to). Never add a name the user did not say and never put record IDs there.',
  'Before proposing, call resolve-entry-target with {ui, entryTarget}. If it returns a question, answer with exactly that one question and nothing else; never guess or default.',
  'Use data.fieldHints (and data.openSheet once the sheet is open) for the other fields. The host fills paddock/event IDs from resolved names. Present that normal UI populated; correction needs a new revision and confirmation. Missing evidence is not no.',
].join(' ');
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
