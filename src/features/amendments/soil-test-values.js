/** One strict adapter for the full soil form and the Locations shortcut. */
import { getById } from '../../data/store.js';
import * as SoilTest from '../../entities/soil-test.js';
import { isCalendarDate, optionalFormNumber } from '../../utils/form-values.js';
import { t } from '../../i18n/i18n.js';
export function soilTestFormValues(operationId, raw) {
  if (!isCalendarDate(raw.testedAt)) throw new Error(t('manualEntry.invalidDate'));
  const location = getById('locations', raw.locationId);
  if (!location || location.archived || location.operationId !== operationId) throw new Error(t('manualEntry.invalidReference'));
  const data = { operationId, locationId: raw.locationId, testedAt: new Date(raw.testedAt + 'T12:00:00Z').toISOString(), unit: raw.unit?.trim() || null };
  for (const [key, field] of Object.entries(SoilTest.FIELDS)) if (field.type === 'numeric') data[key] = optionalFormNumber(raw[key] ?? '');
  for (const key of ['extractionMethod', 'lab', 'notes']) data[key] = raw[key]?.trim() || null;
  const result = SoilTest.validate(SoilTest.create(data));
  if (!result.valid) throw new Error(result.errors.join('; '));
  return data;
}
