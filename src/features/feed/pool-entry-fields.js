/** Staged OI-0210 target contract only; NOT a general voice/tool rollout. */
import { defineEntryFields } from '../assistant/entry-fields.js';
const base={feedTypeName:{required:true},locationName:{required:true},quantity:{required:true},unit:{required:true},date:{required:true},time:{required:true}};
export const FEED_POOL_CHECK_FIELDS=defineEntryFields('feed-pool-check',base);
export const FEED_POOL_MOVE_FIELDS=defineEntryFields('feed-pool-move',{...base,destinationName:{required:true},destinationType:{required:true}});
