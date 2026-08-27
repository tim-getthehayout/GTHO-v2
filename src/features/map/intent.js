/** @file Shared map intent so sheets can open draw/pin mode without a cycle. */

import { navigate } from '../../ui/router.js';

/** @type {{ mode: 'view'|'draw'|'pin', locationId?: string, todoId?: string } | null} */
export let mapIntent = { mode: 'view' };

export function setMapIntent(next) {
  mapIntent = next;
}

export function startDrawLocation(locationId) {
  mapIntent = { mode: 'draw', locationId: locationId || null };
  navigate('#/map');
}

export function startDropTodoPin(todoId) {
  mapIntent = { mode: 'pin', todoId };
  navigate('#/map');
}

export function openFarmMap() {
  mapIntent = { mode: 'view' };
  navigate('#/map');
}
