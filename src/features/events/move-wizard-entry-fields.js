import { defineEntryFields } from '../assistant/entry-fields.js';
/** Move wizard review fields (bound in move-wizard.js through bindEntryFields). */
export const MOVE_ENTRY_FIELDS = defineEntryFields('move', {
  dateOut: { required: true }, timeOut: {}, destType: { required: true }, locationId: {}, locationIds: {}, feedLocationId: {}, existingEventId: {}, destFarmId: {}, stripGraze: {}, stripSizePct: {}, stripCount: {},
}, {
  dateIn: { required: true, when: "destType 'new' (open-destination section shown)" },
  timeIn: { when: "destType 'new' (open-destination section shown)" },
  postGraze: { when: 'full-event or scoped-last move from a land paddock (post-graze card shown)' },
  preGraze: { when: "destType 'new' to land paddocks (pre-graze card shown)" },
  'feed:*': { required: true, when: 'one per feed transfer line left at the source paddock' },
});
