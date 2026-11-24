/**
 * @file Unit conversion — metric internal, display converted. See V2_INFRASTRUCTURE.md §1.
 * OI-0278: the shared display helper (formatMeasure, formatPerArea, unitSuffix,
 * shortUnit). Implementation lives in the store-free `units-core.js`; this
 * module wires the default unit system to the farm (`getUnitSystem()`), so
 * app callers may omit `unitSystem`.
 */

import { getUnitSystem } from './preferences.js';
import { setDefaultUnitSystemResolver } from './units-core.js';

setDefaultUnitSystemResolver(getUnitSystem);

export {
  DM_LBS_IN_AC_TO_KG_CM_HA,
  convert,
  display,
  unitLabel,
  MEASURE_TYPES,
  formatMeasure,
  formatPerArea,
  unitSuffix,
  shortUnit,
  DISPLAY_FAMILIES,
} from './units-core.js';
