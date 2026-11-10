import { defineEntryFields } from '../assistant/entry-fields.js';
/** Log feeding sheet review fields (bound in delivery.js through bindEntryFields). */
export const FEEDING_ENTRY_FIELDS = defineEntryFields('feeding', {
  date: { required: true }, time: {}, locationId: { required: true }, lines: { required: true },
  locationIds: {}, quantityBasis: {}, allocatedLines: {}, carryover: {},
});
