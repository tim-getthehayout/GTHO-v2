/** @file OI-0102 — windows opened in one Save share open_cohort_id. */

import { getAll, getById, add } from '../../data/store.js';
import { t } from '../../i18n/i18n.js';
import { convert } from '../../utils/units.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';

/** Imperial acres summed across the set. Missing area is left out of the sum. */
export function summedPaddockAcres(locationIds) {
  let hectares = 0;
  let any = false;
  for (const id of locationIds) {
    const loc = getById('locations', id);
    const ha = loc?.areaHectares ?? loc?.areaHa;
    if (ha == null || ha === '') continue;
    const n = Number(ha);
    if (!Number.isFinite(n)) continue;
    hectares += n;
    any = true;
  }
  if (!any) return null;
  return convert(hectares, 'area', 'toImperial');
}

/** Names of the open paddocks on an event, earliest open first. */
export function openLocationNames(eventId, { includeClosed = false } = {}) {
  return getAll('eventPaddockWindows')
    .filter((w) => w.eventId === eventId && (includeClosed || !w.dateClosed))
    .sort((a, b) => (a.dateOpened || '').localeCompare(b.dateOpened || '')
      || (a.timeOpened || '').localeCompare(b.timeOpened || ''))
    .map((w) => getById('locations', w.locationId)?.name)
    .filter(Boolean);
}

export function locationIdsInUse() {
  return new Set(
    getAll('eventPaddockWindows').filter((w) => !w.dateClosed).map((w) => w.locationId),
  );
}

/** Refuse a Save that includes a paddock with an open window. */
export function assertLocationsFree(locationIds) {
  const inUse = locationIdsInUse();
  if (locationIds.some((id) => inUse.has(id))) {
    throw new Error(t('event.locationPicker.inUseBlocked'));
  }
}

/**
 * Write N paddock windows for one open action.
 * A single id gets a null cohort. Two or more share one new cohort id.
 * Strip graze applies only when there is exactly one location.
 * @returns {object[]} created windows
 */
export function openPaddockWindows({
  operationId, eventId, locationIds, dateOpened, timeOpened, strip,
}) {
  const ids = [...locationIds];
  assertLocationsFree(ids);
  const openCohortId = ids.length > 1 ? crypto.randomUUID() : null;
  const useStrip = ids.length === 1 && strip?.enabled;
  const windows = [];
  for (const locationId of ids) {
    const pw = PaddockWindowEntity.create({
      operationId,
      eventId,
      locationId,
      dateOpened,
      timeOpened: timeOpened || null,
      openCohortId,
      ...(useStrip ? {
        isStripGraze: true,
        stripGroupId: crypto.randomUUID(),
        areaPct: strip.areaPct,
      } : {}),
    });
    add(
      'eventPaddockWindows', pw,
      PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows',
    );
    windows.push(pw);
  }
  return windows;
}
