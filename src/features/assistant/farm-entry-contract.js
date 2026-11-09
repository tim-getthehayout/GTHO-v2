/** DOM-free description of the five existing entry UIs, shared by the browser
 * review bridge and the backend context/validation. The browser UI binding stays
 * authoritative: unknown fields are rejected when the normal UI is populated.
 */
export const FARM_ENTRY_UIS = Object.freeze(['treatment', 'calving', 'feeding', 'move', 'place']);
export const FARM_ENTRY_INSTRUCTIONS = 'Match intent to an existing entry UI. Use its required/optional fields as prompts. Present that normal UI populated; correction needs a new revision and confirmation. Missing evidence is not no.';
/** Record each UI opens on; target IDs come from host resolution, never model output. */
export const FARM_ENTRY_TARGET_TABLE = Object.freeze({ treatment: 'animals', calving: 'animals', feeding: 'events', move: 'events', place: 'groups' });
/** Stable field names each normal UI binds (dynamic follow-ups such as move-wizard
 * feed transfers or observation cards appear only once the UI is open). */
export const FARM_ENTRY_FIELD_HINTS = Object.freeze({
  treatment: Object.freeze(['date', 'time', 'treatmentTypeId', 'product', 'doseAmount', 'doseUnitId', 'withdrawalDate', 'notes']),
  calving: Object.freeze(['date', 'stillbirth', 'calfTag', 'calfSex', 'calfWeight', 'calfClassId', 'calfGroupId', 'notes']),
  feeding: Object.freeze(['date', 'time', 'locationId', 'lines']),
  move: Object.freeze(['dateOut', 'timeOut', 'dateIn', 'timeIn', 'destType', 'locationId', 'locationIds', 'feedLocationId', 'existingEventId', 'destFarmId', 'stripGraze', 'stripSizePct', 'stripCount']),
  place: Object.freeze(['dateIn', 'timeIn', 'destType', 'locationId', 'locationIds', 'existingEventId', 'destFarmId', 'stripGraze', 'stripSizePct', 'stripCount']),
});
