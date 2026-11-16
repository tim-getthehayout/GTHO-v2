/** @file Picker for the shared closed feed-unit list. */
import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { FEED_UNITS, FEED_UNIT_LABEL_KEYS, normalizeFeedUnit } from '../../utils/feed-units.js';

/**
 * Build a select over FEED_UNITS. A legacy value is preselected by its folded
 * canonical form. An unrecognised value selects an empty "choose" option, so
 * nothing outside the list can be saved.
 */
export function feedUnitSelect(attrs, current, { requireChoice = false } = {}) {
  const selected = current == null || current === '' ? (requireChoice ? '' : FEED_UNITS[0]) : normalizeFeedUnit(current) ?? '';
  const options = FEED_UNITS.map(unit => el('option', { value: unit }, [t(FEED_UNIT_LABEL_KEYS[unit])]));
  if (selected === '') options.unshift(el('option', { value: '' }, [t('feed.unitChoose')]));
  const select = el('select', attrs, options);
  select.value = selected;
  return select;
}
