/** @file Feedback screen — SP-7. Desktop-only admin view for managing submissions. */
/* global __BUILD_STAMP__ */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, remove, subscribe } from '../../data/store.js';
import { getUser } from '../auth/session.js';
import * as SubmissionEntity from '../../entities/submission.js';
import { formatShortDate } from '../../utils/date-format.js';

// ─── Config ─────────────────────────────────────────────────────────────

const CAT = {
  roadblock: { label: '\uD83D\uDEA7 Roadblock', cls: 'br' },
  bug:       { label: 'Bug', cls: 'br' },
  ux:        { label: 'UX friction', cls: 'ba' },
  feature:   { label: 'Missing feature', cls: 'bp' },
  calc:      { label: 'Calculation', cls: 'bt' },
  idea:      { label: 'Idea', cls: 'bg' },
  question:  { label: 'Question', cls: 'bt' },
};

const AREA = {
  dashboard: 'Dashboard', animals: 'Animals', 'rotation-calendar': 'Rotation Calendar',
  locations: 'Locations', feed: 'Feed', harvest: 'Harvest', 'field-mode': 'Field Mode',
  reports: 'Reports', settings: 'Settings', sync: 'Sync / Data', other: 'Other',
};

const STATUS_CLS = { open: 'ba', planned: 'bg', resolved: 'bt', closed: 'bb' };

let unsubs = [];
let resolveSheet = null;
let editSheet = null;

// ─── Badge ──────────────────────────────────────────────────────────────

export function getFeedbackBadgeCount() {
  return getAll('submissions').filter(s => s.status === 'open' || s.status === 'resolved').length;
}

// ─── Main Screen ────────────────────────────────────────────────────────

export function renderFeedbackScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const screenEl = el('div', { 'data-testid': 'feedback-screen' });
  container.appendChild(screenEl);

  function render() {
    clear(screenEl);
    renderConfirmSection(screenEl);
    renderStats(screenEl);
    renderBriefSection(screenEl);
    renderList(screenEl);
  }

  render();
  unsubs.push(subscribe('submissions', render));
}

// ─── Confirmation Section ───────────────────────────────────────────────

function renderConfirmSection(container) {
  const resolved = getAll('submissions').filter(s => s.status === 'resolved');
  if (!resolved.length) return;

  const section = el('div', { style: { marginBottom: '14px' } });
  section.appendChild(el('div', { className: 'banner ban-teal', style: { marginBottom: '10px', background: 'var(--teal-l)', borderRadius: 'var(--radius)', padding: '10px 14px' } }, [
    el('div', { style: { fontSize: '14px', fontWeight: '600', color: 'var(--teal-d)', marginBottom: '2px' } }, [t('feedback.confirmTitle')]),
    el('div', { style: { fontSize: '12px', color: 'var(--teal-d)', opacity: '0.85' } }, [t('feedback.confirmSubtitle')]),
  ]));

  for (const sub of resolved) {
    const catInfo = CAT[sub.category] || { label: sub.category || '?', cls: 'bb' };
    section.appendChild(el('div', { className: 'fb-confirm-item' }, [
      el('div', { className: 'fb-confirm-tag' }, [
        el('span', { className: `badge ${catInfo.cls}` }, [catInfo.label]),
        ` \u00B7 ${sub.version || '?'} \u00B7 by ${sub.submitterName || 'user'}`,
      ]),
      el('div', { style: { fontSize: '14px', marginBottom: '6px', lineHeight: '1.5' } }, [sub.note || '']),
      sub.resolutionNote ? el('div', { style: { fontSize: '12px', color: 'var(--teal-d)', background: 'var(--teal-l)', padding: '6px 10px', borderRadius: 'var(--radius)', marginBottom: '8px' } }, [`Fix: ${sub.resolutionNote}`]) : null,
      sub.resolvedInVersion ? el('div', { style: { fontSize: '11px', color: 'var(--text3)', marginBottom: '10px' } }, [`Resolved in ${sub.resolvedInVersion}`]) : null,
      el('div', { className: 'btn-row' }, [
        el('button', { className: 'btn btn-teal btn-sm', onClick: () => confirmFixed(sub.id) }, [t('feedback.thisIsFixed')]),
        el('button', { className: 'btn btn-outline btn-sm', style: { color: 'var(--red)', borderColor: 'var(--red)' }, onClick: () => reopenIssue(sub) }, [t('feedback.stillBroken')]),
      ]),
    ].filter(Boolean)));
  }

  container.appendChild(section);
}

function confirmFixed(id) {
  const user = getUser();
  update('submissions', id, { status: 'closed', confirmedBy: user?.email || 'user', confirmedAt: new Date().toISOString() }, SubmissionEntity.validate, SubmissionEntity.toSupabaseShape, 'submissions');
}

function reopenIssue(original) {
  const user = getUser();
  // Close original
  update('submissions', original.id, { status: 'closed', confirmedBy: user?.email || 'user', confirmedAt: new Date().toISOString() }, SubmissionEntity.validate, SubmissionEntity.toSupabaseShape, 'submissions');
  // Create regression
  const reg = SubmissionEntity.create({
    operationId: original.operationId, submitterId: original.submitterId,
    type: original.type, category: original.category, area: original.area,
    note: `[Regression] ${original.note}`, status: 'open',
    screen: original.screen, linkedTo: original.id,
    version: typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'dev',
  });
  add('submissions', reg, SubmissionEntity.validate, SubmissionEntity.toSupabaseShape, 'submissions');
}

// ─── Stats Strip ────────────────────────────────────────────────────────

function renderStats(container) {
  const subs = getAll('submissions');
  if (!subs.length) return;

  const counts = { open: 0, planned: 0, resolved: 0, closed: 0, support: 0 };
  for (const s of subs) {
    if (s.status in counts) counts[s.status]++;
    if (s.type === 'support' && s.status === 'open') counts.support++;
  }

  const badges = [
    el('span', { className: 'badge ba' }, [`${counts.open} open`]),
  ];
  if (counts.planned) badges.push(el('span', { className: 'badge bg' }, [`${counts.planned} planned`]));
  badges.push(el('span', { className: 'badge bt' }, [`${counts.resolved} awaiting`]));
  badges.push(el('span', { className: 'badge bb' }, [`${counts.closed} closed`]));
  if (counts.support) badges.push(el('span', { className: 'badge bt' }, [`\uD83C\uDD98 ${counts.support} support`]));

  container.appendChild(el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' } }, badges));
}

// ─── Dev Brief ──────────────────────────────────────────────────────────

function renderBriefSection(container) {
  const card = el('div', { className: 'card' });
  card.appendChild(el('div', { className: 'sec' }, [t('feedback.briefTitle')]));
  card.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' } }, [t('feedback.briefSubtitle')]));

  const briefOut = el('div', { style: { display: 'none' } });
  const briefText = el('pre', { className: 'fb-brief-box' });
  briefOut.appendChild(briefText);

  const copyBtn = el('button', { className: 'btn btn-outline', style: { display: 'none' }, onClick: () => {
    navigator.clipboard.writeText(briefText.textContent).then(() => {
      copyBtn.textContent = t('feedback.copied');
      copyBtn.style.color = 'var(--green)';
      setTimeout(() => { copyBtn.textContent = t('feedback.copy'); copyBtn.style.color = ''; }, 2000);
    });
  } }, [t('feedback.copy')]);

  card.appendChild(el('div', { className: 'btn-row', style: { marginBottom: '10px' } }, [
    el('button', { className: 'btn btn-outline', onClick: () => {
      briefText.textContent = generateBrief();
      briefOut.style.display = 'block';
      copyBtn.style.display = '';
    } }, [t('feedback.generateBrief')]),
    copyBtn,
  ]));
  card.appendChild(briefOut);
  container.appendChild(card);
}

function generateBrief() {
  const subs = getAll('submissions');
  const buildVer = typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'dev';
  const open = subs.filter(s => s.status === 'open');
  const awaiting = subs.filter(s => s.status === 'resolved');
  const closed = subs.filter(s => s.status === 'closed').slice(0, 10);
  const testers = [...new Set(subs.map(s => s.submitterName || s.submitterId || 'user').filter(Boolean))];

  let out = `GET THE HAY OUT \u2014 DEV SESSION BRIEF\nGenerated: ${new Date().toISOString().slice(0, 10)}\nVersion: ${buildVer}\nTesters: ${testers.join(', ')}\nOpen: ${open.length} \u00B7 Awaiting: ${awaiting.length} \u00B7 Closed: ${closed.length}\n${'═'.repeat(40)}\n\nOPEN ITEMS (${open.length})\n${'─'.repeat(40)}\n`;

  const catOrder = ['roadblock', 'bug', 'calc', 'ux', 'feature', 'idea', 'question'];
  for (const cat of catOrder) {
    const items = open.filter(s => s.category === cat);
    if (!items.length) continue;
    const catLabel = CAT[cat]?.label || cat;
    out += `\n[${catLabel.toUpperCase()}]${cat === 'roadblock' ? ' \u2190 HIGH PRIORITY' : ''}\n`;
    items.forEach((s, i) => {
      out += `${i + 1}. ${s.note}\n   [${s.screen || ''}] area:${AREA[s.area] || s.area || '?'} \u2014 ${formatShortDate(s.createdAt)}\n`;
    });
  }

  if (awaiting.length) {
    out += `\n${'═'.repeat(40)}\nAWAITING CONFIRMATION (${awaiting.length})\n${'─'.repeat(40)}\n`;
    awaiting.forEach((s, i) => {
      out += `${i + 1}. ${s.note}\n   Fix in ${s.resolvedInVersion || '?'}: ${s.resolutionNote || ''}\n`;
    });
  }

  if (closed.length) {
    out += `\n${'═'.repeat(40)}\nCLOSED (last 10)\n${'─'.repeat(40)}\n`;
    closed.forEach((s, i) => {
      out += `${i + 1}. ${s.note}\n   Fixed in ${s.resolvedInVersion || '?'}: ${s.resolutionNote || ''}${s.confirmedBy ? `. Confirmed: ${s.confirmedBy}` : ''}\n`;
    });
  }

  return out;
}

// ─── Submission List ────────────────────────────────────────────────────

function renderList(container) {
  const card = el('div', { className: 'card', style: { marginTop: '10px' } });

  // Filters
  let typeFilter = 'all', areaFilter = 'all', statusFilter = 'all';
  const filterStyle = { fontSize: '12px', padding: '5px 8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' };

  const typeSelect = el('select', { style: filterStyle }, [
    el('option', { value: 'all' }, ['All types']),
    el('option', { value: 'feedback' }, ['Feedback']),
    el('option', { value: 'support' }, ['Support']),
  ]);
  const areaSelect = el('select', { style: filterStyle }, [
    el('option', { value: 'all' }, ['All areas']),
    ...Object.entries(AREA).map(([v, l]) => el('option', { value: v }, [l])),
  ]);
  const statusSelect = el('select', { style: filterStyle }, [
    el('option', { value: 'all' }, ['All']),
    ...['open', 'planned', 'resolved', 'closed'].map(s => el('option', { value: s }, [s.charAt(0).toUpperCase() + s.slice(1)])),
    ...Object.keys(CAT).map(c => el('option', { value: `cat:${c}` }, [CAT[c].label])),
    el('option', { value: 'has-response' }, ['Has Dev Response']),
  ]);

  const listEl = el('div');

  function renderRows() {
    typeFilter = typeSelect.value;
    areaFilter = areaSelect.value;
    statusFilter = statusSelect.value;
    clear(listEl);

    let subs = getAll('submissions').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (typeFilter !== 'all') subs = subs.filter(s => s.type === typeFilter);
    if (areaFilter !== 'all') subs = subs.filter(s => s.area === areaFilter);
    if (statusFilter !== 'all') {
      if (statusFilter.startsWith('cat:')) subs = subs.filter(s => s.category === statusFilter.slice(4));
      else if (statusFilter === 'has-response') subs = subs.filter(s => s.devResponse);
      else subs = subs.filter(s => s.status === statusFilter);
    }

    if (!subs.length) { listEl.appendChild(el('div', { className: 'empty' }, [t('feedback.noItems')])); return; }

    for (const sub of subs) {
      const catInfo = CAT[sub.category] || { label: sub.category || '?', cls: 'bb' };
      const sCls = STATUS_CLS[sub.status] || 'bb';
      const isSupport = sub.type === 'support';

      const row = el('div', { className: `fb-row${isSupport ? ' fb-item-support' : ''}` });

      // Header
      const badges = [
        el('span', { className: `badge ${catInfo.cls}` }, [catInfo.label]),
        el('span', { className: `badge ${sCls}` }, [sub.status]),
      ];
      if (isSupport) badges.push(el('span', { className: 'badge bt', style: { fontSize: '10px' } }, ['\uD83C\uDD98 support']));
      if (sub.area) badges.push(el('span', { className: 'badge bb', style: { fontSize: '10px', opacity: '0.85' } }, [AREA[sub.area] || sub.area]));
      if (sub.linkedTo) badges.push(el('span', { className: 'badge br' }, ['regression']));
      if (sub.priority && sub.priority !== 'normal') badges.push(el('span', { style: { fontSize: '10px', color: 'var(--text2)', marginLeft: '4px' } }, [`\uD83D\uDD34 ${sub.priority.charAt(0).toUpperCase() + sub.priority.slice(1)}`]));

      row.appendChild(el('div', { className: 'fb-row-head' }, [
        el('span', {}, badges),
        el('button', { style: { border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: '13px', padding: '4px 6px', borderRadius: 'var(--radius)' }, title: 'Edit', onClick: () => openEditSheet(sub) }, ['\u270F\uFE0F']),
      ]));

      // Note
      row.appendChild(el('div', { style: { fontSize: '14px', marginTop: '4px', lineHeight: '1.5' } }, [sub.note || '']));

      // Resolution
      if ((sub.status === 'resolved' || sub.status === 'closed') && sub.resolutionNote) {
        row.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--teal-d)', background: 'var(--teal-l)', padding: '4px 8px', borderRadius: 'var(--radius)', marginTop: '4px' } }, [`Fix (${sub.resolvedInVersion || '?'}): ${sub.resolutionNote}`]));
      }
      if (sub.status === 'closed' && sub.confirmedBy) {
        row.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginTop: '3px' } }, [`Confirmed: ${sub.confirmedBy}`]));
      }

      // Dev response
      if (sub.devResponse) {
        row.appendChild(el('div', { className: 'fb-dev-resp' }, [
          el('div', { style: { fontSize: '11px', fontWeight: '600', marginBottom: '4px', opacity: '0.8' } }, [t('feedback.devResponse')]),
          el('div', { style: { fontSize: '13px' } }, [sub.devResponse]),
        ]));
      }

      // Detail line
      row.appendChild(el('div', { className: 'fb-row-detail' }, [
        [sub.screen ? `Screen: ${sub.screen}` : null, sub.version, formatShortDate(sub.createdAt)].filter(Boolean).join(' \u00B7 '),
      ]));

      // Actions
      if (sub.status === 'open') {
        row.appendChild(el('button', { className: 'btn btn-outline btn-xs', style: { marginTop: '8px' }, onClick: () => openResolveSheet(sub) }, [t('feedback.markResolved')]));
      }

      listEl.appendChild(row);
    }
  }

  typeSelect.addEventListener('change', renderRows);
  areaSelect.addEventListener('change', renderRows);
  statusSelect.addEventListener('change', renderRows);

  card.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } }, [
    el('div', { className: 'sec', style: { margin: '0' } }, [t('feedback.allSubmissions')]),
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' } }, [typeSelect, areaSelect, statusSelect]),
  ]));
  card.appendChild(listEl);
  container.appendChild(card);
  renderRows();
}

// ─── Resolve Sheet ──────────────────────────────────────────────────────

function ensureResolveSheetDOM() {
  if (document.getElementById('resolve-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'resolve-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => resolveSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'resolve-sheet-panel' }),
  ]));
}

function openResolveSheet(sub) {
  ensureResolveSheetDOM();
  if (!resolveSheet) resolveSheet = new Sheet('resolve-sheet-wrap');
  const panel = document.getElementById('resolve-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const buildVer = typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'dev';

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '14px' } }, [t('feedback.resolveTitle')]));

  const noteInput = el('textarea', { style: { width: '100%', minHeight: '80px', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' } });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, [t('feedback.resolvePrompt')]), noteInput]));
  panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' } }, [`Tagged to version: ${buildVer}`]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row' }, [
    el('button', { className: 'btn btn-teal', onClick: () => {
      clear(statusEl);
      if (!noteInput.value.trim()) { statusEl.appendChild(el('span', {}, ['Resolution note is required'])); return; }
      update('submissions', sub.id, { status: 'resolved', resolutionNote: noteInput.value.trim(), resolvedInVersion: buildVer, resolvedAt: new Date().toISOString() }, SubmissionEntity.validate, SubmissionEntity.toSupabaseShape, 'submissions');
      resolveSheet.close();
    } }, [t('feedback.resolveBtn')]),
    el('button', { className: 'btn btn-outline', onClick: () => resolveSheet.close() }, [t('action.cancel')]),
  ]));

  resolveSheet.open();
}

// ─── Edit Sheet ─────────────────────────────────────────────────────────

function ensureEditSheetDOM() {
  if (document.getElementById('edit-sub-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'edit-sub-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => editSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'edit-sub-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
  ]));
}

function openEditSheet(sub) {
  ensureEditSheetDOM();
  if (!editSheet) editSheet = new Sheet('edit-sub-wrap');
  const panel = document.getElementById('edit-sub-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));
  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' } }, [t('feedback.editTitle')]));

  let editType = sub.type || 'feedback';
  let editCat = sub.category || null;

  // Type toggle
  const typeRow = el('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } });
  function renderTypeToggle() {
    clear(typeRow);
    for (const [val, label] of [['feedback', '\uD83D\uDCAC Feedback'], ['support', '\uD83C\uDD98 Support']]) {
      typeRow.appendChild(el('button', {
        type: 'button', className: `fb-type-pill${editType === val ? ' sel' : ''}`,
        style: { flex: '1', padding: '7px', borderRadius: 'var(--radius)', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
        onClick: () => { editType = val; renderTypeToggle(); },
      }, [label]));
    }
  }
  renderTypeToggle();
  panel.appendChild(typeRow);

  // Category pills
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '6px' } }, [t('feedback.category')]));
  const catPills = el('div', { className: 'cat-pills', style: { marginBottom: '12px' } });
  function renderCatPills() {
    clear(catPills);
    for (const [key, info] of Object.entries(CAT)) {
      const isActive = editCat === key;
      const pillCls = { roadblock: 'cp-roadblock', bug: 'cp-bug', ux: 'cp-ux', feature: 'cp-feature', calc: 'cp-calc', idea: 'cp-idea', question: 'cp-question' }[key] || '';
      catPills.appendChild(el('button', {
        type: 'button', className: `cat-pill ${pillCls}${isActive ? ' sel' : ''}`,
        onClick: () => { editCat = key; renderCatPills(); },
      }, [info.label]));
    }
  }
  renderCatPills();
  panel.appendChild(catPills);

  // Area + Priority
  const areaSelect = el('select', {}, [
    el('option', { value: '' }, ['\u2014 pick area \u2014']),
    ...Object.entries(AREA).map(([v, l]) => el('option', { value: v, selected: sub.area === v }, [l])),
  ]);
  const prioritySelect = el('select', {}, [
    ...['normal', 'high', 'urgent', 'low'].map(p => el('option', { value: p, selected: sub.priority === p }, [p.charAt(0).toUpperCase() + p.slice(1)])),
  ]);
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, [t('feedback.area')]), areaSelect]),
    el('div', { className: 'field' }, [el('label', {}, [t('feedback.priority')]), prioritySelect]),
  ]));

  // Status
  const statusSelect = el('select', {}, [
    ...['open', 'planned', 'resolved', 'closed'].map(s => el('option', { value: s, selected: sub.status === s }, [s.charAt(0).toUpperCase() + s.slice(1)])),
  ]);
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, [t('feedback.status')]), statusSelect]));

  // Note
  const noteInput = el('textarea', { style: { width: '100%', minHeight: '80px', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' } });
  noteInput.value = sub.note || '';
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, [t('feedback.note')]), noteInput]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  // Save + Cancel
  panel.appendChild(el('div', { className: 'btn-row' }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      try {
        update('submissions', sub.id, { type: editType, category: editCat, area: areaSelect.value || null, priority: prioritySelect.value, status: statusSelect.value, note: noteInput.value.trim() }, SubmissionEntity.validate, SubmissionEntity.toSupabaseShape, 'submissions');
        editSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, [t('feedback.saveChanges')]),
    el('button', { className: 'btn btn-outline', onClick: () => editSheet.close() }, [t('action.cancel')]),
  ]));

  // Delete
  panel.appendChild(el('div', { style: { marginTop: '16px', paddingTop: '12px', borderTop: '0.5px solid var(--border)' } }, [
    el('button', { className: 'btn btn-outline btn-sm', style: { color: 'var(--red)', borderColor: 'var(--red)', width: '100%' }, onClick: () => {
      if (window.confirm(t('feedback.deleteConfirm'))) { remove('submissions', sub.id, 'submissions'); editSheet.close(); }
    } }, [t('feedback.deleteItem')]),
  ]));

  editSheet.open();
}
