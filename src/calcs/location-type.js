/** @file Classify locations by `location.type` (OI-0209). */

export function isConfinementLocation(loc) {
  return loc?.type === 'confinement';
}

/**
 * Open paddock windows on `date` for an event (inclusive open, exclusive close).
 */
export function openPaddockWindowsOnDate(paddockWindows = [], { eventId, date } = {}) {
  return (paddockWindows || []).filter((pw) => {
    if (eventId && pw.eventId !== eventId) return false;
    return (pw.dateOpened || '9999-12-31') <= date
      && (!pw.dateClosed || pw.dateClosed > date);
  });
}

function locFrom(locations, locationId) {
  if (!locations) return null;
  if (typeof locations.get === 'function') return locations.get(locationId);
  if (Array.isArray(locations)) return locations.find((l) => l.id === locationId) || null;
  return locations[locationId] || null;
}

/** True when every open window on `date` is a confinement location. */
export function isPureConfinementOnDate({ paddockWindows, locations, eventId, date } = {}) {
  const open = openPaddockWindowsOnDate(paddockWindows, { eventId, date });
  if (!open.length) return false;
  return open.every((pw) => isConfinementLocation(locFrom(locations, pw.locationId)));
}

export function hasInvalidFeedConversion(feedEntries = [], feedCheckItems = [], batches = {}) {
  function invalidBatch(batchId) {
    const b = batches?.[batchId];
    const weight = Number(b?.weightPerUnitKg);
    const dm = Number(b?.dmPct);
    return !b || !Number.isFinite(weight) || weight <= 0 || !Number.isFinite(dm) || dm <= 0;
  }
  for (const entry of feedEntries || []) {
    if (entry?.batchId && invalidBatch(entry.batchId)) return true;
  }
  for (const item of feedCheckItems || []) {
    if (item?.batchId && invalidBatch(item.batchId)) return true;
  }
  return false;
}
