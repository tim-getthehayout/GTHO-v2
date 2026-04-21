/**
 * @file Forage Types Settings card — list + Add/Edit buttons + delete guard (OI-0125 / SP-13).
 *
 * V1 exposed this card between Farms and Field Mode. V2 dropped the UI at
 * rebuild — only the onboarding seed step and the per-location picker existed.
 * This restores the list + Edit sheet so post-onboarding edits are possible.
 *
 * Delete guard: any `locations.forageTypeId === id` blocks delete. Single
 * confirm dialog otherwise. Archive is out of scope (column exists; UI is a
 * follow-up per SP-13).
 */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, remove } from '../../data/store.js';
import { openForageTypeSheet, renderForageTypeSheetMarkup } from './forage-type-sheet.js';

export { renderForageTypeSheetMarkup };

/**
 * Render the Forage Types card into the settings sections list.
 * Re-renders itself in place after add/edit/delete via a `rerender` closure
 * that each row-level action threads through — avoids a long-lived store
 * subscription that would need a DOM-teardown cleanup.
 * @param {string} operationId
 * @returns {HTMLElement}
 */
export function renderForageTypesSection(operationId) {
  const card = el('div', { className: 'card settings-card', 'data-testid': 'settings-forage-types' });
  const rerender = () => renderInto(card, operationId, rerender);
  rerender();
  return card;
}

function renderInto(card, operationId, rerender) {
  clear(card);

  const header = el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' },
  }, [
    el('h3', { className: 'settings-section-title', style: { margin: '0' } }, [t('forageType.section')]),
    el('button', {
      className: 'btn btn-outline btn-sm',
      'data-testid': 'settings-forage-add',
      onClick: () => openForageTypeSheet(null, operationId, rerender),
    }, [t('forageType.add')]),
  ]);
  card.appendChild(header);

  card.appendChild(el('div', {
    className: 'form-hint',
    style: { fontSize: '11px', color: 'var(--text2)', marginBottom: 'var(--space-2)' },
  }, [t('forageType.sectionSubtitle')]));

  const list = el('div', { 'data-testid': 'settings-forage-list' });
  const rows = getAll('forageTypes')
    .filter(f => !f.archived && f.operationId === operationId)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (rows.length === 0) {
    list.appendChild(el('div', { className: 'auth-info', 'data-testid': 'settings-forage-empty' }, [
      t('forageType.emptyState'),
    ]));
  } else {
    for (const ft of rows) {
      list.appendChild(renderRow(ft, operationId, rerender));
    }
  }

  card.appendChild(list);
}

function renderRow(ft, operationId, rerender) {
  const titleChildren = [
    el('strong', {}, [ft.name || '(unnamed)']),
  ];
  if (ft.isSeeded) {
    titleChildren.push(el('span', {
      className: 'obs-badge',
      style: { marginLeft: 'var(--space-1)' },
      'data-testid': `settings-forage-seeded-${ft.id}`,
    }, [t('forageType.seededBadge')]));
  }

  const meta = t('forageType.metaLine', {
    dm: formatMetaValue(ft.dmPct),
    n: formatMetaValue(ft.nPerTonneDm),
    p: formatMetaValue(ft.pPerTonneDm),
    k: formatMetaValue(ft.kPerTonneDm),
  });

  return el('div', {
    className: 'settings-field',
    'data-testid': `settings-forage-row-${ft.id}`,
    style: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: 'var(--space-2) 0', borderBottom: '0.5px solid var(--border)',
    },
  }, [
    el('div', {}, [
      el('div', { style: { fontSize: '14px' } }, titleChildren),
      el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [meta]),
    ]),
    el('div', { className: 'btn-row' }, [
      el('button', {
        className: 'btn btn-outline btn-sm',
        'data-testid': `settings-forage-edit-${ft.id}`,
        onClick: () => openForageTypeSheet(ft, operationId, rerender),
      }, [t('forageType.edit')]),
      el('button', {
        className: 'btn btn-red btn-sm',
        'data-testid': `settings-forage-delete-${ft.id}`,
        onClick: () => attemptDelete(ft, rerender),
      }, ['\u00D7']),
    ]),
  ]);
}

function formatMetaValue(v) {
  if (v == null) return '?';
  // Render integers without trailing ".0", fractional values with one decimal.
  return Number.isInteger(v) ? String(v) : Number(v).toFixed(1);
}

/**
 * Delete-guard: block when any location references the forage type.
 */
function attemptDelete(ft, rerender) {
  const referenced = getAll('locations').filter(l => !l.archived && l.forageTypeId === ft.id);
  if (referenced.length > 0) {
    window.alert(
      `${t('forageType.deleteBlockedTitle')}\n\n${t('forageType.deleteBlocked', { n: referenced.length })}`
    );
    return;
  }
  const ok = window.confirm(t('forageType.deleteConfirm', { name: ft.name || '' }));
  if (!ok) return;
  remove('forageTypes', ft.id, 'forage_types');
  if (rerender) rerender();
}
