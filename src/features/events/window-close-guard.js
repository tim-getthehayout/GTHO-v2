/** @file OI-0185 — shared dry-run-close validator for event close + move.
 *
 *  `executeClose` and `executeMoveWizard` close every open child window of an
 *  event to a chosen out-datetime. If any window opens AFTER that datetime the
 *  entity validator throws (the OI-0137 date-ordering guards on paddock and
 *  group windows reject `close < open`) — and pre-OI-0185 the throw landed
 *  mid-write, leaving a partial close that orphaned the affected groups (live
 *  repro 2026-06-14, E-series → D, 46 head).
 *
 *  This helper dry-runs each open child window's proposed close through its
 *  entity `validate()` BEFORE any write fires and returns a structured list
 *  of conflicts. Both `close.js` and `move-wizard.js` consume it:
 *
 *  - close.js — full pre-flight (all open GWs + PWs).
 *  - move-wizard.js — source-event pre-flight, scoped to `sourceGWs` and
 *    extending PW coverage only when the last group is leaving (matching the
 *    existing write order).
 *
 *  The `entityError` field captures the raw validator string for tests + logs
 *  only — the user-facing surface (close.js statusEl today, the OI-0186
 *  guided dialog tomorrow) renders plain copy from the structured fields.
 */

import { getAll } from '../../data/store.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';

/**
 * @typedef {Object} WindowCloseConflict
 * @property {'paddock'|'group'} kind     paddock window vs. group window
 * @property {string} windowId            event_paddock_window.id / event_group_window.id
 * @property {string} eventId             parent event id
 * @property {string} [locationId]        paddock-window only — drives location-name display
 * @property {string} [groupId]           group-window only — drives group-name display
 * @property {string} openDate            window's date_opened / date_joined
 * @property {string} outDate             proposed close/move-out date
 * @property {string} entityError         raw validator string (logs/tests only)
 */

/**
 * Dry-run every open child window's proposed close against the chosen
 * out-datetime. Returns a list of conflicts; caller aborts with zero writes
 * when the list is non-empty.
 *
 * The proposed `headCount` / `avgWeightKg` are carried forward from the open
 * window's existing values (since `closeGroupWindow` recomputes live values
 * via getLiveWindowHeadCount/AvgWeight at write time, but the OI-0137 date
 * validators do not depend on those — so a forward-carry is sufficient to
 * exercise the date guard the pre-flight is here for). When the existing
 * `avgWeightKg` is 0 or missing we substitute 1 so the validator does not
 * spuriously flag an avg-weight conflict alongside the date conflict.
 *
 * @param {string} eventId
 * @param {string} outDate                YYYY-MM-DD
 * @param {string|null} [outTime]         HH:mm or null
 * @param {Object} [opts]
 * @param {string[]} [opts.scopedGroupWindowIds]  restrict GW check to these ids (scoped move)
 * @param {boolean} [opts.includePaddockWindows]  default true; close.js always true; move-wizard sets false unless last group leaves
 * @returns {WindowCloseConflict[]}
 */
export function checkWindowCloses(eventId, outDate, outTime = null, opts = {}) {
  if (!eventId || !outDate) return [];
  const conflicts = [];
  const includePaddockWindows = opts.includePaddockWindows !== false;
  const scopedIds = Array.isArray(opts.scopedGroupWindowIds)
    ? new Set(opts.scopedGroupWindowIds)
    : null;

  const openGWs = getAll('eventGroupWindows').filter(w => w.eventId === eventId && !w.dateLeft);
  const gwTargets = scopedIds ? openGWs.filter(w => scopedIds.has(w.id)) : openGWs;
  for (const gw of gwTargets) {
    const proposed = {
      ...gw,
      dateLeft: outDate,
      timeLeft: outTime,
      headCount: typeof gw.headCount === 'number' && gw.headCount >= 0 ? gw.headCount : 0,
      avgWeightKg: typeof gw.avgWeightKg === 'number' && gw.avgWeightKg > 0 ? gw.avgWeightKg : 1,
    };
    const v = GroupWindowEntity.validate(proposed);
    if (!v.valid) {
      conflicts.push({
        kind: 'group',
        windowId: gw.id,
        eventId,
        groupId: gw.groupId,
        openDate: gw.dateJoined,
        outDate,
        entityError: v.errors.join(', '),
      });
    }
  }

  if (includePaddockWindows) {
    const openPWs = getAll('eventPaddockWindows').filter(w => w.eventId === eventId && !w.dateClosed);
    for (const pw of openPWs) {
      const proposed = { ...pw, dateClosed: outDate, timeClosed: outTime };
      const v = PaddockWindowEntity.validate(proposed);
      if (!v.valid) {
        conflicts.push({
          kind: 'paddock',
          windowId: pw.id,
          eventId,
          locationId: pw.locationId,
          openDate: pw.dateOpened,
          outDate,
          entityError: v.errors.join(', '),
        });
      }
    }
  }

  return conflicts;
}

/**
 * Convenience: does the event have ANY conflicting open window?
 * @param {string} eventId
 * @param {string} outDate
 * @param {string|null} [outTime]
 * @param {Object} [opts] same shape as checkWindowCloses
 * @returns {boolean}
 */
export function hasWindowCloseConflict(eventId, outDate, outTime = null, opts = {}) {
  return checkWindowCloses(eventId, outDate, outTime, opts).length > 0;
}
