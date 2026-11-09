/** DOM/store-free grazing evidence shared by the map popup and server reads. */
export function lastClosedGraze(locationId, sourceWindows) {
  const windows = (sourceWindows || []).filter((w) => w.locationId === locationId && w.dateClosed);
  if (!windows.length) return null;
  windows.sort((a, b) => String(b.dateClosed).localeCompare(String(a.dateClosed))
    || String(b.timeClosed || '').localeCompare(String(a.timeClosed || '')));
  return windows[0];
}
