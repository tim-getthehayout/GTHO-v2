import { defineEntryFields } from '../assistant/entry-fields.js';
/** Place wizard review fields (bound in place-wizard.js through bindEntryFields). */
export const PLACE_ENTRY_FIELDS = defineEntryFields('place', {
  dateIn: { required: true }, timeIn: {}, destType: { required: true }, locationId: {}, locationIds: {}, existingEventId: {}, destFarmId: {}, stripGraze: {}, stripSizePct: {}, stripCount: {}, noPasture: {},
}, {
  preGraze: { when: "destType 'new' to land paddocks and not no_pasture (pre-graze card shown)" },
});
