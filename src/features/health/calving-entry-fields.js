import { defineEntryFields } from '../assistant/entry-fields.js';
/** Calving sheet review fields (bound in calving.js through bindEntryFields). */
export const CALVING_ENTRY_FIELDS = defineEntryFields('calving', {
  date: { required: true }, stillbirth: {}, calfTag: {}, calfSex: {}, calfWeight: {}, calfClassId: {}, calfGroupId: {}, notes: {},
}, {
  driedOffDate: { when: 'dairy operations only (dried-off date control shown)' },
});
