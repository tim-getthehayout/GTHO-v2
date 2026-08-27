/** @file Shared map intent so sheets can open draw/pin/pick mode without a cycle. */

import { navigate } from '../../ui/router.js';

/** @type {{ mode: 'view'|'draw'|'pin'|'pick', locationId?: string, todoId?: string } } */
export let mapIntent = { mode: 'view' };

export function setMapIntent(next) {
  mapIntent = next || { mode: 'view' };
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
