/**
 * @file Shared map intent so sheets can open draw/pin/pick mode without a cycle.
 * OI-0263: intents open the Map view (`#/events?view=map`); Back/Close returns to the caller.
 */

import { navigate } from '../../ui/router.js';
import { MAP_VIEW_HASH } from '../events/calendar-state.js';

/** @type {{ mode: 'view'|'draw'|'pin'|'pick', locationId?: string, todoId?: string } } */
export let mapIntent = { mode: 'view' };

export function setMapIntent(next) {
  mapIntent = next || { mode: 'view' };
}

export function startDrawLocation(locationId) {
  mapIntent = { mode: 'draw', locationId: locationId || null };
  navigate(MAP_VIEW_HASH); // OI-0263: Map view in Locations & Rotation
}

export function startDropTodoPin(todoId) {
  mapIntent = { mode: 'pin', todoId };
  navigate(MAP_VIEW_HASH); // OI-0263: Map view in Locations & Rotation
}

export function openFarmMap() {
  mapIntent = { mode: 'view' };
  navigate(MAP_VIEW_HASH); // OI-0263: Map view in Locations & Rotation
}
