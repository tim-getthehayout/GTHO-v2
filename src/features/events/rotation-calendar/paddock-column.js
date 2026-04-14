/**
 * @file Paddock column — CP-54.
 * Left-hand column (180px fixed): one row per paddock with name, acreage, status tag.
 * See V2_DESIGN_SYSTEM.md §4.3.
 */

import { el } from '../../../ui/dom.js';
import { t } from '../../../i18n/i18n.js';
import { display } from '../../../utils/units.js';

/**
 * Determine the status tag for a paddock row.
 * @param {object} location
 * @param {object} [activeEvent] - Active event on this paddock, if any
 * @param {object} [linkedPrimary] - Primary linked paddock, if this is a linked member
 * @param {object} [stripInfo] - { currentStrip, totalStrips } if strip-grazed
 * @returns {string}
 */
function getStatusTag(location, activeEvent, linkedPrimary, stripInfo) {
  if (linkedPrimary) return `Linked to ${linkedPrimary.name}`;
  if (activeEvent && stripInfo) return `● Active · strip ${stripInfo.currentStrip}/${stripInfo.totalStrips}`;
  if (activeEvent) return '● Active';
  if (location._isLinkedPrimary) return 'Primary · linked';
  if (location._isSubMoveDestination) return 'Sub-move destination';
  if (location._isNeverGrazed) return 'Never grazed';
  return '';
}

/**
 * Render the paddock column.
 * @param {object} opts
 * @param {Array<object>} opts.locations - Visible paddock locations
 * @param {object} opts.activeEvents - Map of locationId → active event info
 * @param {object} opts.linkedPaddocks - Map of locationId → primary location
 * @param {object} opts.stripInfo - Map of locationId → { currentStrip, totalStrips }
 * @param {string} opts.unitSystem - 'metric' | 'imperial'
 * @returns {HTMLElement}
 */
export function renderPaddockColumn({ locations, activeEvents, linkedPaddocks, stripInfo, unitSystem }) {
  const header = el('div', { className: 'paddock-col__header' }, [
    el('span', {}, [t('nav.locations')]),
  ]);

  const rows = locations.map(loc => {
    const activeEvent = activeEvents[loc.id];
    const linked = linkedPaddocks[loc.id];
    const strip = stripInfo[loc.id];
    const tag = getStatusTag(loc, activeEvent, linked, strip);

    const areaDisplay = display(loc.areaHectares, 'area', unitSystem);

    const children = [
      el('div', { className: 'paddock-col__name' }, [loc.name]),
      el('div', { className: 'paddock-col__area' }, [areaDisplay]),
    ];

    if (tag) {
      const tagClass = activeEvent ? 'paddock-col__tag paddock-col__tag--active' : 'paddock-col__tag';
      children.push(el('div', { className: tagClass }, [tag]));
    }

    return el('div', {
      className: 'paddock-col__row',
      dataset: { testid: 'paddock-row', locationId: loc.id },
    }, children);
  });

  return el('div', { className: 'paddock-col', dataset: { testid: 'paddock-column' } }, [
    header,
    ...rows,
  ]);
}
