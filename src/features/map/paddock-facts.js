/** @file Acreage and last closed grazing for a paddock. */

import { getAll } from '../../data/store.js';
import { lastClosedGraze as lastClosedGrazeFrom } from './grazing-evidence.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display } from '../../utils/units.js';

export function lastClosedGraze(locationId, sourceWindows = getAll('eventPaddockWindows')) {
  return lastClosedGrazeFrom(locationId, sourceWindows);
}

export function paddockFacts(loc) {
  const unitSys = getUnitSystem();
  const area = loc?.areaHectares != null ? display(loc.areaHectares, 'area', unitSys, 1) : 'No acreage';
  const closed = lastClosedGraze(loc?.id);
  const grazed = closed
    ? `Last grazed ${closed.dateClosed}${closed.timeClosed ? ' ' + closed.timeClosed : ''}`
    : 'No closed grazing';
  return { area, grazed };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&', '<': '<', '>': '>' }[c]));
}

export function paddockPopup(loc) {
  const { area, grazed } = paddockFacts(loc);
  const title = loc.fieldCode ? `${loc.name} (${loc.fieldCode})` : loc.name;
  return `<div class="paddock-popup"><strong>${escapeHtml(title)}</strong><div>${escapeHtml(area)}</div><div>${escapeHtml(grazed)}</div></div>`;
}
