/**
 * @file OI-0271: one map from stored `locations.land_use` values to the visible
 * label (the same text as the location form's Land use options). Screens show
 * this label, never the raw stored value (e.g. never "mixed_use").
 */

/** Stored value → visible label. Order matches the location form options. */
export const LAND_USE_LABELS = Object.freeze({
  pasture: 'Pasture',
  mixed_use: 'Mixed-use',
  crop: 'Crop',
});

/**
 * @param {string|null|undefined} landUse - stored land_use value
 * @returns {string} visible label; unset → Pasture (the land default); unknown → "—"
 */
export function landUseLabel(landUse) {
  if (landUse == null || landUse === '') return LAND_USE_LABELS.pasture;
  return LAND_USE_LABELS[landUse] ?? '\u2014';
}
