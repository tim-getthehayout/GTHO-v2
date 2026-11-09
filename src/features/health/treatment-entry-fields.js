import { defineEntryFields } from '../assistant/entry-fields.js';
/** Treatment sheet review fields (bound in treatment.js through bindEntryFields). */
export const TREATMENT_ENTRY_FIELDS = defineEntryFields('treatment', {
  date: { required: true }, time: {}, treatmentTypeId: { required: true }, product: {}, doseAmount: {}, doseUnitId: {}, withdrawalDate: {}, notes: {},
});
