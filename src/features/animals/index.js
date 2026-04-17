/** @file Animals screen — V1 parity rebuild. Single-page layout: filter chips, groups, animal list, sheets. */

import { el, clear, text } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, remove, subscribe, getVisibleGroups, getActiveFarmId } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert, unitLabel } from '../../utils/units.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import * as GroupEntity from '../../entities/group.js';
import * as AnimalClassEntity from '../../entities/animal-class.js';
import * as AnimalEntity from '../../entities/animal.js';
import * as MembershipEntity from '../../entities/animal-group-membership.js';
import { openWeightSheet, renderWeightSheetMarkup } from '../health/weight.js';
import { openBcsSheet, renderBcsSheetMarkup } from '../health/bcs.js';
import { openTreatmentSheet, renderTreatmentSheetMarkup } from '../health/treatment.js';
import { openBreedingSheet, renderBreedingSheetMarkup } from '../health/breeding.js';
import { openHeatSheet, renderHeatSheetMarkup } from '../health/heat.js';
import { openCalvingSheet, renderCalvingSheetMarkup } from '../health/calving.js';

// ─── State ──────────────────────────────────────────────────────────────
let unsubs = [];
let selectedFilter = null;  // group ID or null (All)
let searchQuery = '';
let showCulled = false;
let selectedAnimals = new Set();
let sortColumn = 'tag';
let sortAsc = true;

// Sheet instances
let groupSheet = null;
let classSheet = null;
let animalSheet = null;

// ─── Main Entry ─────────────────────────────────────────────────────────

export function renderAnimalsScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];
  selectedAnimals = new Set();

  const operations = getAll('operations');
  const farms = getAll('farms');
  if (!operations.length || !farms.length) {
    container.appendChild(el('div', { className: 'empty' }, [t('error.generic')]));
    return;
  }
  const operationId = operations[0].id;
  const farmId = getActiveFarmId() || farms[0].id;
  const unitSys = getUnitSystem();

  // ── Containers ──
  const filterWrap = el('div', { className: 'agc-wrap' });
  const configRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' } });
  const groupsCard = el('div', { className: 'card', style: { marginBottom: '8px' } });
  const actionBar = el('div', { id: 'animals-action-bar', style: { display: 'none', position: 'sticky', top: '0', zIndex: '30', background: 'var(--green)', color: 'white', padding: '10px 14px', borderRadius: 'var(--radius)', marginBottom: '10px' } });
  const animalListWrap = el('div', { 'data-testid': 'animals-list' });

  container.appendChild(filterWrap);
  container.appendChild(configRow);
  container.appendChild(groupsCard);
  container.appendChild(actionBar);
  container.appendChild(animalListWrap);

  // Health sheet wrappers
  container.appendChild(renderWeightSheetMarkup());
  container.appendChild(renderBcsSheetMarkup());
  container.appendChild(renderTreatmentSheetMarkup());
  container.appendChild(renderBreedingSheetMarkup());
  container.appendChild(renderHeatSheetMarkup());
  container.appendChild(renderCalvingSheetMarkup());

  // ── Render functions ──
  function renderFilterHeader() {
    clear(filterWrap);
    const groups = getAll('groups').filter(g => !g.archived);
    const chipsEl = el('div', { className: 'agc-chips' });

    // "All" chip
    chipsEl.appendChild(el('span', {
      className: `agc-chip${selectedFilter === null ? ' active' : ''}`,
      onClick: () => { selectedFilter = null; renderAll(); },
    }, ['All']));

    // Per-group chips
    for (const g of groups) {
      const isActive = selectedFilter === g.id;
      chipsEl.appendChild(el('span', {
        className: `agc-chip${isActive ? ' active' : ''}`,
        onClick: () => { selectedFilter = isActive ? null : g.id; renderAll(); },
      }, [
        el('span', { className: 'agc-dot', style: { background: g.color || 'var(--green)' } }),
        g.name,
      ]));
    }
    filterWrap.appendChild(chipsEl);

    // Search bar
    const searchInput = el('input', {
      type: 'search', placeholder: t('animal.searchPlaceholder') || 'Search by tag, EID, class…',
      value: searchQuery,
      style: { width: '100%', padding: '9px 32px 9px 12px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', boxSizing: 'border-box' },
    });
    searchInput.addEventListener('input', () => { searchQuery = searchInput.value; renderAnimalList(); });
    filterWrap.appendChild(el('div', { style: { position: 'relative' } }, [searchInput]));

    // Secondary controls
    const showCulledCheck = el('input', { type: 'checkbox', style: { accentColor: 'var(--amber)' } });
    if (showCulled) showCulledCheck.checked = true;
    showCulledCheck.addEventListener('change', () => { showCulled = showCulledCheck.checked; renderAnimalList(); });

    filterWrap.appendChild(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '7px' } }, [
      el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' } }, [
        showCulledCheck, 'Show culled',
      ]),
      el('button', {
        className: 'btn btn-green btn-xs', style: { whiteSpace: 'nowrap', marginLeft: 'auto' },
        onClick: () => openAnimalSheet(null, operationId, farmId),
      }, ['+ Add animal']),
    ]));
  }

  function renderConfigRow() {
    clear(configRow);
    configRow.appendChild(el('button', { className: 'btn btn-outline btn-xs', onClick: () => openClassesManager(operationId) }, ['\uD83D\uDC04 Classes']));
    configRow.appendChild(el('button', { className: 'btn btn-outline btn-xs', onClick: () => openTreatmentsManager(operationId) }, ['\uD83D\uDC89 Treatments']));
    configRow.appendChild(el('button', { className: 'btn btn-outline btn-xs', onClick: () => openAISiresManager(operationId) }, ['\uD83D\uDC02 AI Sires']));
  }

  function renderGroupsList() {
    clear(groupsCard);
    const groups = getAll('groups').filter(g => !g.archived);
    const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);

    // Header
    groupsCard.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } }, [
      el('div', { className: 'sec', style: { margin: '0' } }, ['Groups']),
      el('button', { className: 'btn btn-green btn-xs', onClick: (e) => { e.stopPropagation(); openGroupSheet(null, operationId, farmId); } }, ['+ Add group']),
    ]));

    for (const g of groups) {
      const headCount = memberships.filter(m => m.groupId === g.id).length;
      const animals = getAll('animals');
      const groupAnimalIds = new Set(memberships.filter(m => m.groupId === g.id).map(m => m.animalId));
      const groupAnimals = animals.filter(a => groupAnimalIds.has(a.id));

      // Sex breakdown
      const females = groupAnimals.filter(a => a.sex === 'female').length;
      const males = groupAnimals.filter(a => a.sex === 'male').length;
      const sexLine = [females > 0 ? `${females} female` : null, males > 0 ? `${males} male` : null].filter(Boolean).join(', ');

      // Weight + DMI
      const weightRecords = getAll('animalWeightRecords');
      const classes = getAll('animalClasses');
      let totalWeightKg = 0;
      for (const a of groupAnimals) {
        const latestW = weightRecords.filter(w => w.animalId === a.id).sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];
        const cls = a.classId ? classes.find(c => c.id === a.classId) : null;
        totalWeightKg += latestW?.weightKg ?? cls?.defaultWeightKg ?? 0;
      }
      const avgWeightDisplay = headCount > 0 ? display(totalWeightKg / headCount, 'weight', unitSys, 0) : '—';
      const dmiKg = totalWeightKg * 0.025;
      const dmiDisplay = display(dmiKg, 'weight', unitSys, 0);

      // Status badge
      const gws = getAll('eventGroupWindows').filter(gw => gw.groupId === g.id && !gw.dateLeft);
      const activeGw = gws[0];
      const activeEvent = activeGw ? getById('events', activeGw.eventId) : null;
      const isPlaced = !!(activeEvent && !activeEvent.dateOut);
      let locName = '';
      if (isPlaced) {
        const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === activeEvent.id && !pw.dateClosed);
        const loc = pws[0] ? getById('locations', pws[0].locationId) : null;
        locName = loc?.name || '';
      }

      const isFiltered = selectedFilter === g.id;

      const row = el('div', {
        style: { borderLeft: `3px solid ${g.color || 'var(--green)'}`, marginBottom: '6px', cursor: 'pointer', padding: '10px 12px', background: isFiltered ? 'var(--green-l)' : 'transparent', borderRadius: isFiltered ? '0 var(--radius) var(--radius) 0' : '0' },
        onClick: () => { selectedFilter = isFiltered ? null : g.id; renderAll(); },
      }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }, [
          el('div', {}, [
            el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [
              g.name, ' ',
              isPlaced
                ? el('span', { className: 'badge bt' }, [`active \u00B7 ${locName}`])
                : el('span', { className: 'badge bb' }, ['unplaced']),
            ]),
            sexLine ? el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '2px' } }, [sexLine]) : null,
            el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [
              `${headCount} head \u00B7 avg ${avgWeightDisplay} ${unitLabel('weight', unitSys)} \u00B7 DMI target ${dmiDisplay} ${unitLabel('weight', unitSys)}/day`,
            ]),
          ].filter(Boolean)),
          el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' }, onClick: (e) => e.stopPropagation() }, [
            el('button', { className: 'btn btn-outline btn-xs', onClick: () => openGroupSheet(g, operationId, farmId) }, ['Edit']),
            el('button', { className: 'btn btn-outline btn-xs', onClick: () => openGroupWeightsSheet(g, operationId) }, ['Weights']),
            el('button', { style: { border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: '18px', padding: '2px 4px' }, onClick: () => { if (confirm(`Delete group "${g.name}"?`)) remove('groups', g.id, 'groups'); } }, ['\u00D7']),
          ]),
        ]),
      ]);
      groupsCard.appendChild(row);
    }

    if (!groups.length) {
      groupsCard.appendChild(el('div', { className: 'empty' }, ['No groups yet. Add one to organize your herd.']));
    }
  }

  function renderActionBar() {
    clear(actionBar);
    if (selectedAnimals.size === 0) { actionBar.style.display = 'none'; return; }
    actionBar.style.display = 'block';
    actionBar.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } }, [
      el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [`${selectedAnimals.size} selected`]),
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
        el('button', { className: 'btn btn-sm', style: { background: 'white', color: 'var(--green-d)', padding: '6px 12px' }, onClick: () => openAnimalMoveSheet(operationId) }, ['Move to group']),
        el('button', { className: 'btn btn-sm', style: { background: 'white', color: 'var(--green-d)', padding: '6px 12px' } }, ['New group']),
        el('button', { className: 'btn btn-sm', style: { background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: 'white', padding: '6px 12px' }, onClick: () => { selectedAnimals.clear(); renderAnimalList(); renderActionBar(); } }, ['Cancel']),
      ]),
    ]));
  }

  function renderAnimalList() {
    const scrollTop = animalListWrap.scrollTop;
    clear(animalListWrap);

    const allAnimals = getAll('animals');
    const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);
    const classes = getAll('animalClasses');
    const groups = getAll('groups');
    const weightRecords = getAll('animalWeightRecords');

    // Filter
    let filtered = allAnimals;
    if (!showCulled) filtered = filtered.filter(a => !a.culled);
    if (selectedFilter) {
      const groupAnimalIds = new Set(memberships.filter(m => m.groupId === selectedFilter).map(m => m.animalId));
      filtered = filtered.filter(a => groupAnimalIds.has(a.id));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a => {
        const tag = (a.tagNum || '').toLowerCase();
        const eid = (a.eid || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        const cls = a.classId ? (classes.find(c => c.id === a.classId)?.name || '').toLowerCase() : '';
        return tag.includes(q) || eid.includes(q) || name.includes(q) || cls.includes(q);
      });
    }

    // Build lookup maps
    const membershipMap = new Map();
    for (const m of memberships) { if (!membershipMap.has(m.animalId)) membershipMap.set(m.animalId, m); }
    const latestWeightMap = new Map();
    for (const w of weightRecords) {
      const existing = latestWeightMap.get(w.animalId);
      if (!existing || (w.date || '') > (existing.date || '')) latestWeightMap.set(w.animalId, w);
    }

    // Sort
    filtered.sort((a, b) => {
      let va, vb;
      if (sortColumn === 'tag') { va = a.tagNum || a.name || ''; vb = b.tagNum || b.name || ''; }
      else if (sortColumn === 'class') { va = classes.find(c => c.id === a.classId)?.name || ''; vb = classes.find(c => c.id === b.classId)?.name || ''; }
      else if (sortColumn === 'group') {
        const ga = membershipMap.get(a.id)?.groupId; const gb = membershipMap.get(b.id)?.groupId;
        va = ga ? (groups.find(g => g.id === ga)?.name || '') : ''; vb = gb ? (groups.find(g => g.id === gb)?.name || '') : '';
      } else if (sortColumn === 'weight') {
        va = latestWeightMap.get(a.id)?.weightKg ?? 0; vb = latestWeightMap.get(b.id)?.weightKg ?? 0;
        return sortAsc ? va - vb : vb - va;
      }
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    // Sort header
    function sortEl(label, col) {
      const isActive = sortColumn === col;
      return el('span', {
        style: { cursor: 'pointer', color: isActive ? 'var(--green)' : 'var(--text2)', fontWeight: isActive ? '600' : '400' },
        onClick: () => { if (sortColumn === col) sortAsc = !sortAsc; else { sortColumn = col; sortAsc = true; } renderAnimalList(); },
      }, [label + (isActive ? (sortAsc ? ' \u2191' : ' \u2193') : '')]);
    }

    animalListWrap.appendChild(el('div', { style: { display: 'flex', gap: '10px', padding: '4px 0 6px', borderBottom: '0.5px solid var(--border)', fontSize: '11px' } }, [
      el('div', { style: { width: '22px', flexShrink: '0' } }),
      el('div', { style: { flex: '1' } }, [sortEl('Tag / ID', 'tag'), ' \u00B7 ', sortEl('Class', 'class'), ' \u00B7 ', sortEl('Group', 'group')]),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [sortEl('Weight', 'weight')]),
    ]));

    if (!filtered.length) {
      animalListWrap.appendChild(el('div', { className: 'empty' }, ['No animals match this filter']));
      animalListWrap.scrollTop = scrollTop;
      return;
    }

    // Animal rows
    for (const animal of filtered) {
      const mem = membershipMap.get(animal.id);
      const grp = mem ? groups.find(g => g.id === mem.groupId) : null;
      const cls = animal.classId ? classes.find(c => c.id === animal.classId) : null;
      const latestW = latestWeightMap.get(animal.id);
      const weightDisplay = latestW?.weightKg ? display(latestW.weightKg, 'weight', unitSys, 0) : '—';
      const isSelected = selectedAnimals.has(animal.id);
      const isCulled = animal.culled;

      // Location badge
      let locBadge = null;
      if (grp) {
        const gws2 = getAll('eventGroupWindows').filter(gw => gw.groupId === grp.id && !gw.dateLeft);
        const ae = gws2[0] ? getById('events', gws2[0].eventId) : null;
        if (ae && !ae.dateOut) {
          const pws2 = getAll('eventPaddockWindows').filter(pw => pw.eventId === ae.id && !pw.dateClosed);
          const loc2 = pws2[0] ? getById('locations', pws2[0].locationId) : null;
          if (loc2) locBadge = el('span', { className: 'badge bt', style: { fontSize: '10px' } }, [loc2.name]);
        }
      }

      // Checkbox
      const checkbox = el('div', {
        style: { width: '22px', height: '22px', borderRadius: '6px', border: `1.5px solid ${isSelected ? 'var(--green)' : 'var(--border2)'}`, background: isSelected ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', cursor: 'pointer' },
        onClick: (e) => {
          e.stopPropagation();
          if (selectedAnimals.has(animal.id)) selectedAnimals.delete(animal.id);
          else selectedAnimals.add(animal.id);
          renderAnimalList();
          renderActionBar();
        },
      }, isSelected ? [
        el('svg', { width: '12', height: '12', viewBox: '0 0 12 12', fill: 'none' }, [
          el('polyline', { points: '2,6 5,9 10,3', stroke: 'white', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        ]),
      ] : []);

      const row = el('div', { style: { padding: '8px 0', borderBottom: '0.5px solid var(--border)', opacity: isCulled ? '0.5' : '1' } }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
          checkbox,
          el('div', { style: { flex: '1', minWidth: '0', cursor: 'pointer' }, onClick: () => openAnimalSheet(animal, operationId, farmId) }, [
            el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [
              animal.tagNum || animal.name || `A-${animal.id.slice(0, 5)}`, ' ',
              el('span', { style: { fontSize: '11px', color: 'var(--text2)', fontWeight: '400' } }, [animal.sex === 'female' ? '\u2640' : '\u2642']),
              locBadge ? [' ', locBadge] : null,
            ].flat().filter(Boolean)),
            el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [
              `${cls?.name || 'No class'} \u00B7 ${grp?.name || 'No group'}`,
            ]),
          ]),
          el('div', { style: { textAlign: 'right', flexShrink: '0' } }, [
            el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [`${weightDisplay} ${unitLabel('weight', unitSys)}`]),
          ]),
        ]),
        // Quick-action buttons
        el('div', { style: { display: 'flex', gap: '5px', marginTop: '5px', marginLeft: '30px', flexWrap: 'wrap' } }, [
          el('button', { className: 'btn btn-outline btn-xs', onClick: () => openAnimalSheet(animal, operationId, farmId) }, ['Edit']),
          el('button', { className: 'btn btn-outline btn-xs', onClick: () => openWeightSheet(animal, operationId) }, ['\u2696 Weight']),
          el('button', { className: 'btn btn-outline btn-xs', onClick: () => openTreatmentSheet(animal, operationId) }, ['\uD83D\uDC89 Treatment']),
          animal.sex === 'female' ? el('button', { className: 'btn btn-outline btn-xs', onClick: () => openBreedingSheet(animal, operationId) }, ['\u2640 Breeding']) : null,
          el('button', { className: 'btn btn-outline btn-xs', onClick: () => openBcsSheet(animal, operationId) }, ['\uD83D\uDCCA BCS']),
        ].filter(Boolean)),
      ]);

      animalListWrap.appendChild(row);
    }

    animalListWrap.scrollTop = scrollTop;
  }

  function renderAll() {
    renderFilterHeader();
    renderConfigRow();
    renderGroupsList();
    renderActionBar();
    renderAnimalList();
  }

  renderAll();

  // Subscriptions
  const reRenderAll = () => renderAll();
  unsubs.push(subscribe('groups', reRenderAll));
  unsubs.push(subscribe('animalClasses', reRenderAll));
  unsubs.push(subscribe('animals', reRenderAll));
  unsubs.push(subscribe('animalGroupMemberships', reRenderAll));
  unsubs.push(subscribe('animalWeightRecords', () => renderAnimalList()));
  unsubs.push(subscribe('animalBcsScores', () => renderAnimalList()));
}

// ─── Group Sheet (Add/Edit) ────────────────────────────────────────────

function ensureGroupSheetDOM() {
  if (document.getElementById('group-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'group-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => groupSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'group-sheet-panel' }),
  ]));
}

function openGroupSheet(existingGroup, operationId, farmId) {
  ensureGroupSheetDOM();
  if (!groupSheet) groupSheet = new Sheet('group-sheet-wrap');
  const panel = document.getElementById('group-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const isEdit = !!existingGroup;
  const colors = ['#639922', '#1D9E75', '#185FA5', '#BA7517', '#E24B4A', '#534AB7'];
  let selectedColor = existingGroup?.color || colors[0];

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '12px' } }, [isEdit ? 'Edit group' : 'Add group']));

  const nameInput = el('input', { type: 'text', placeholder: 'Cow herd, Yearlings…', value: existingGroup?.name || '', style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Group name']), nameInput]));

  // Color picker
  const colorPicker = el('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } });
  function renderColorPicker() {
    clear(colorPicker);
    for (const c of colors) {
      colorPicker.appendChild(el('div', {
        style: { width: '28px', height: '28px', borderRadius: '50%', background: c, cursor: 'pointer', border: `2px solid ${c === selectedColor ? 'var(--text)' : 'transparent'}` },
        onClick: () => { selectedColor = c; renderColorPicker(); },
      }));
    }
  }
  renderColorPicker();
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Color']), colorPicker]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '12px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      const name = nameInput.value.trim();
      if (!name) { statusEl.appendChild(el('span', {}, ['Name is required'])); return; }
      try {
        if (isEdit) {
          update('groups', existingGroup.id, { name, color: selectedColor }, GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
        } else {
          const record = GroupEntity.create({ operationId, name, color: selectedColor });
          add('groups', record, GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
        }
        groupSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Save group']),
    el('button', { className: 'btn btn-outline', onClick: () => groupSheet.close() }, ['Cancel']),
  ]));

  if (isEdit) {
    panel.appendChild(el('div', { style: { marginTop: '8px' } }, [
      el('button', { className: 'btn btn-red btn-sm', style: { width: 'auto' }, onClick: () => { if (confirm(`Delete group "${existingGroup.name}"?`)) { remove('groups', existingGroup.id, 'groups'); groupSheet.close(); } } }, ['Delete group']),
    ]));
  }

  groupSheet.open();
}

// ─── Classes Manager Sheet ──────────────────────────────────────────────

function ensureClassesSheetDOM() {
  if (document.getElementById('manage-classes-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'manage-classes-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => classSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'manage-classes-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
  ]));
}

function openClassesManager(operationId) {
  ensureClassesSheetDOM();
  if (!classSheet) classSheet = new Sheet('manage-classes-wrap');
  const panel = document.getElementById('manage-classes-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const unitSys = getUnitSystem();

  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '600' } }, ['Animal classes']),
    el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, ['Weight and DMI defaults per class']),
  ]));

  const classList = el('div', { style: { marginBottom: '12px' } });
  function renderClassList() {
    clear(classList);
    const classes = getAll('animalClasses');
    for (const cls of classes) {
      const weightDisplay = cls.defaultWeightKg ? display(cls.defaultWeightKg, 'weight', unitSys, 0) : '—';
      const isArchived = cls.archived;
      classList.appendChild(el('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '0.5px solid var(--border)', fontSize: '13px', opacity: isArchived ? '0.45' : '1' },
      }, [
        el('span', {}, [
          el('strong', {}, [cls.name]), ' ',
          el('span', { className: 'badge bb' }, [cls.species || '']), ' ',
          el('span', { className: 'badge bt' }, [`${weightDisplay} ${unitLabel('weight', unitSys)}`]), ' ',
          cls.dmiPct ? el('span', { className: 'badge bg' }, [`${cls.dmiPct}% DMI`]) : null,
        ].filter(Boolean)),
        el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
          el('button', { className: 'btn btn-outline btn-xs', onClick: () => openClassEditForm(cls, operationId, unitSys) }, ['Edit']),
          el('button', { style: { border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: '16px' }, onClick: () => { if (confirm(`Delete class "${cls.name}"?`)) { remove('animalClasses', cls.id, 'animal_classes'); renderClassList(); } } }, ['\u00D7']),
        ]),
      ]));
    }
  }
  renderClassList();
  panel.appendChild(classList);

  panel.appendChild(el('div', { className: 'div' }));

  // Add form
  const addFormTitle = el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px' } }, ['Add class']);
  panel.appendChild(addFormTitle);
  const inputs = {};
  inputs.name = el('input', { type: 'text', placeholder: 'Cow, Heifer, Steer…' });
  inputs.species = el('select', {}, [
    el('option', {}, ['Beef cattle']), el('option', {}, ['Dairy cattle']),
    el('option', {}, ['Sheep']), el('option', {}, ['Goats']), el('option', {}, ['Other']),
  ]);
  inputs.defaultWeightKg = el('input', { type: 'number', placeholder: '1200', step: '1' });
  inputs.dmiPct = el('input', { type: 'number', placeholder: '2.5', step: '0.1', min: '0.5', max: '6' });

  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Class name *']), inputs.name]),
    el('div', { className: 'field' }, [el('label', {}, ['Species']), inputs.species]),
  ]));
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, [`Default weight (${unitLabel('weight', unitSys)})`]), inputs.defaultWeightKg]),
    el('div', { className: 'field' }, [el('label', {}, ['DMI % of body weight']), inputs.dmiPct]),
  ]));

  const addStatusEl = el('div', { className: 'auth-error' });
  panel.appendChild(addStatusEl);
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '8px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(addStatusEl);
      let defaultWeightKg = parseFloat(inputs.defaultWeightKg.value) || null;
      if (defaultWeightKg != null && unitSys === 'imperial') defaultWeightKg = convert(defaultWeightKg, 'weight', 'toMetric');
      try {
        const record = AnimalClassEntity.create({ operationId, name: inputs.name.value.trim(), species: inputs.species.value, defaultWeightKg, dmiPct: parseFloat(inputs.dmiPct.value) || null });
        add('animalClasses', record, AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
        inputs.name.value = ''; inputs.defaultWeightKg.value = ''; inputs.dmiPct.value = '';
        renderClassList();
      } catch (err) { addStatusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Add class']),
    el('button', { className: 'btn btn-outline', onClick: () => classSheet.close() }, ['Done']),
  ]));

  classSheet.open();
}

function openClassEditForm(cls, operationId, unitSys) {
  // Inline edit — reopen the manager with the class pre-filled
  // For simplicity, use a prompt-based edit (the full inline edit is complex)
  const newName = prompt('Class name:', cls.name);
  if (newName !== null && newName.trim()) {
    update('animalClasses', cls.id, { name: newName.trim() }, AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  }
}

// ─── Treatments Manager Sheet ───────────────────────────────────────────

function openTreatmentsManager(operationId) {
  const wrapId = 'manage-treatments-wrap';
  if (!document.getElementById(wrapId)) {
    document.body.appendChild(el('div', { className: 'sheet-wrap', id: wrapId, style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => treatSheet?.close() }),
      el('div', { className: 'sheet-panel', id: 'manage-treatments-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
    ]));
  }
  let treatSheet = new Sheet(wrapId);
  const panel = document.getElementById('manage-treatments-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '600' } }, ['Treatment types']),
    el('button', { className: 'btn btn-outline btn-xs', onClick: () => treatSheet.close() }, ['Done']),
  ]));
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' } }, ['Define treatment types used when logging health events.']));

  const typesList = el('div', { style: { marginBottom: '12px' } });
  function renderTypesList() {
    clear(typesList);
    const types = getAll('treatmentTypes');
    for (const tt of types) {
      typesList.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '0.5px solid var(--border)' } }, [
        el('div', {}, [
          el('span', { style: { fontSize: '13px', fontWeight: '500' } }, [`\uD83D\uDC89 ${tt.name}`]),
          tt.category ? el('span', { className: 'badge bb', style: { fontSize: '10px', marginLeft: '6px' } }, [tt.category]) : null,
        ].filter(Boolean)),
        el('button', { style: { border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: '16px', padding: '0 2px' }, onClick: () => { remove('treatmentTypes', tt.id, 'treatment_types'); renderTypesList(); } }, ['\u00D7']),
      ]));
    }
  }
  renderTypesList();
  panel.appendChild(typesList);

  panel.appendChild(el('div', { className: 'div' }));
  panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px' } }, ['Add treatment type']));

  const ttNameInput = el('input', { type: 'text', placeholder: 'e.g. Vaccinate \u2014 BVD', style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });
  const ttCatSelect = el('select', { style: { height: '100%', padding: '9px 8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', width: '100%' } }, [
    el('option', { value: '' }, ['No category']),
    el('option', {}, ['Vaccine']), el('option', {}, ['Parasite Control']),
    el('option', {}, ['Antibiotic']), el('option', {}, ['Wound/Surgery']),
    el('option', {}, ['Nutritional']), el('option', {}, ['Other']),
  ]);
  panel.appendChild(el('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } }, [
    el('div', { className: 'field', style: { flex: '2', margin: '0' } }, [ttNameInput]),
    el('div', { className: 'field', style: { flex: '1', margin: '0' } }, [ttCatSelect]),
  ]));

  panel.appendChild(el('button', { className: 'btn btn-green btn-sm', style: { padding: '10px 16px' }, onClick: () => {
    const name = ttNameInput.value.trim();
    if (!name) return;
    const { create, validate, toSupabaseShape } = require('../../entities/treatment-type.js');
    const rec = create({ operationId, name, category: ttCatSelect.value || null });
    add('treatmentTypes', rec, validate, toSupabaseShape, 'treatment_types');
    ttNameInput.value = '';
    renderTypesList();
  } }, ['Add']));

  treatSheet.open();
}

// ─── AI Sires Manager Sheet ────────────────────────────────────────────

function openAISiresManager(operationId) {
  const wrapId = 'manage-ai-bulls-wrap';
  if (!document.getElementById(wrapId)) {
    document.body.appendChild(el('div', { className: 'sheet-wrap', id: wrapId, style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => siresSheet?.close() }),
      el('div', { className: 'sheet-panel', id: 'manage-ai-bulls-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
    ]));
  }
  let siresSheet = new Sheet(wrapId);
  const panel = document.getElementById('manage-ai-bulls-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '600' } }, ['AI sires']),
    el('button', { className: 'btn btn-outline btn-xs', onClick: () => siresSheet.close() }, ['Done']),
  ]));
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' } }, ['Name and registration number are snapshotted on each breeding record.']));

  const bullsList = el('div', { style: { marginBottom: '12px' } });
  function renderBullsList() {
    clear(bullsList);
    const bulls = getAll('aiBulls');
    for (const b of bulls) {
      bullsList.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '0.5px solid var(--border)' } }, [
        el('div', {}, [
          el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [
            b.name, b.regNumber ? el('span', { style: { fontSize: '11px', color: 'var(--text2)', marginLeft: '6px' } }, [b.regNumber]) : null,
          ].filter(Boolean)),
          (b.breed || b.epds) ? el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [[b.breed, b.epds].filter(Boolean).join(' \u00B7 ')]) : null,
        ].filter(Boolean)),
        el('button', { style: { border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: '16px' }, onClick: () => { remove('aiBulls', b.id, 'ai_bulls'); renderBullsList(); } }, ['\u00D7']),
      ]));
    }
  }
  renderBullsList();
  panel.appendChild(bullsList);
  panel.appendChild(el('div', { className: 'div' }));
  panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px' } }, ['Add sire']));

  const sInputs = {};
  sInputs.name = el('input', { type: 'text', placeholder: 'e.g. Connealy Confidence' });
  sInputs.reg = el('input', { type: 'text', placeholder: 'e.g. 17760326' });
  sInputs.breed = el('input', { type: 'text', placeholder: 'e.g. Angus' });
  sInputs.epds = el('input', { type: 'text', placeholder: 'e.g. CE+8 BW-1.2 WW+68' });

  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Sire name *']), sInputs.name]),
    el('div', { className: 'field' }, [el('label', {}, ['Reg #']), sInputs.reg]),
  ]));
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Breed']), sInputs.breed]),
    el('div', { className: 'field' }, [el('label', {}, ['EPDs']), sInputs.epds]),
  ]));

  panel.appendChild(el('button', { className: 'btn btn-green btn-sm', style: { width: 'auto', padding: '10px 20px' }, onClick: () => {
    const name = sInputs.name.value.trim();
    if (!name) return;
    const { create, validate, toSupabaseShape } = require('../../entities/ai-bull.js');
    const rec = create({ operationId, name, regNumber: sInputs.reg.value.trim() || null, breed: sInputs.breed.value.trim() || null, epds: sInputs.epds.value.trim() || null });
    add('aiBulls', rec, validate, toSupabaseShape, 'ai_bulls');
    sInputs.name.value = ''; sInputs.reg.value = ''; sInputs.breed.value = ''; sInputs.epds.value = '';
    renderBullsList();
  } }, ['Add sire']));

  siresSheet.open();
}

// ─── Group Weights Sheet ───────────────────────────────────────────────

function openGroupWeightsSheet(group, operationId) {
  const wrapId = 'wt-sheet-wrap';
  if (!document.getElementById(wrapId)) {
    document.body.appendChild(el('div', { className: 'sheet-wrap', id: wrapId, style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => wtSheet?.close() }),
      el('div', { className: 'sheet-panel', id: 'wt-sheet-panel' }),
    ]));
  }
  let wtSheet = new Sheet(wrapId);
  const panel = document.getElementById('wt-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const unitSys = getUnitSystem();
  const memberships = getAll('animalGroupMemberships').filter(m => m.groupId === group.id && !m.dateLeft);
  const animals = getAll('animals');
  const weightRecords = getAll('animalWeightRecords');
  const groupAnimals = animals.filter(a => memberships.some(m => m.animalId === a.id));

  const todayStr = new Date().toISOString().slice(0, 10);
  const dateInput = el('input', { type: 'date', value: todayStr });

  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '600' } }, ['Update group weights']),
  ]));
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' } }, [`${group.name} \u00B7 ${groupAnimals.length} animals`]));
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Weigh date']), dateInput]));
  panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' } }, ['Enter new weights below. Leave blank to keep current weight unchanged.']));

  const weightInputs = [];
  for (const a of groupAnimals) {
    const latestW = weightRecords.filter(w => w.animalId === a.id).sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];
    const currentDisplay = latestW?.weightKg ? display(latestW.weightKg, 'weight', unitSys, 0) : '—';
    const cls = a.classId ? getAll('animalClasses').find(c => c.id === a.classId) : null;
    const newWtInput = el('input', { type: 'number', placeholder: 'New wt', step: '1', style: { width: '90px', padding: '7px 8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', textAlign: 'right' } });
    weightInputs.push({ animalId: a.id, input: newWtInput });

    panel.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '0.5px solid var(--border)' } }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [a.tagNum || a.name || `A-${a.id.slice(0, 5)}`]),
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${a.sex} \u00B7 ${cls?.name || ''}`]),
      ]),
      el('div', { style: { textAlign: 'right', fontSize: '12px', color: 'var(--text2)', marginRight: '4px' } }, [`Current: ${currentDisplay} ${unitLabel('weight', unitSys)}`]),
      newWtInput,
    ]));
  }

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '8px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      const { create, validate, toSupabaseShape } = require('../../entities/animal-weight-record.js');
      for (const wi of weightInputs) {
        const val = parseFloat(wi.input.value);
        if (isNaN(val) || val <= 0) continue;
        let weightKg = val;
        if (unitSys === 'imperial') weightKg = convert(val, 'weight', 'toMetric');
        const rec = create({ operationId, animalId: wi.animalId, weightKg, date: dateInput.value });
        add('animalWeightRecords', rec, validate, toSupabaseShape, 'animal_weight_records');
      }
      wtSheet.close();
    } }, ['Commit all changes']),
    el('button', { className: 'btn btn-outline', onClick: () => wtSheet.close() }, ['Cancel']),
  ]));

  wtSheet.open();
}

// ─── Animal Sheet (Add/Edit) ────────────────────────────────────────────

function ensureAnimalSheetDOM() {
  if (document.getElementById('ae-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'ae-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => animalSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'ae-sheet-panel', style: { maxHeight: '92vh', overflowY: 'auto' } }),
  ]));
}

function openAnimalSheet(existingAnimal, operationId, farmId) {
  ensureAnimalSheetDOM();
  if (!animalSheet) animalSheet = new Sheet('ae-sheet-wrap');
  const panel = document.getElementById('ae-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const isEdit = !!existingAnimal;
  const unitSys = getUnitSystem();
  const classes = getAll('animalClasses');
  const groups = getAll('groups').filter(g => !g.archived);
  const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);
  const currentMembership = isEdit ? memberships.find(m => m.animalId === existingAnimal.id) : null;
  const previousGroupId = currentMembership?.groupId || null;

  // Header
  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '600' } }, [isEdit ? 'Edit animal' : 'Add animal']),
    isEdit ? el('div', { style: { fontFamily: 'Menlo,monospace', fontSize: '11px', color: 'var(--text2)', background: 'var(--bg2)', padding: '3px 8px', borderRadius: 'var(--radius)' } }, [`A-${existingAnimal.id.slice(0, 5)}`]) : null,
  ].filter(Boolean)));

  const inputs = {};
  const sexState = { value: existingAnimal?.sex || 'female' };

  // Tag + EID
  inputs.tagNum = el('input', { type: 'text', placeholder: 'T-001', value: existingAnimal?.tagNum || '' });
  inputs.eid = el('input', { type: 'text', placeholder: '840-…', value: existingAnimal?.eid || '' });
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Ear tag #']), inputs.tagNum]),
    el('div', { className: 'field' }, [el('label', {}, ['EID #']), inputs.eid]),
  ]));

  // Sex + Class
  inputs.sex = el('select', {}, [
    el('option', { value: 'female', selected: sexState.value === 'female' }, ['Female']),
    el('option', { value: 'male', selected: sexState.value === 'male' }, ['Male']),
  ]);
  inputs.sex.addEventListener('change', () => { sexState.value = inputs.sex.value; });

  inputs.classId = el('select', {}, [
    el('option', { value: '' }, ['— none —']),
    ...classes.map(c => el('option', { value: c.id, selected: existingAnimal?.classId === c.id }, [c.name])),
  ]);
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Sex']), inputs.sex]),
    el('div', { className: 'field' }, [el('label', {}, ['Class']), inputs.classId]),
  ]));

  // Group
  inputs.groupId = el('select', {}, [
    el('option', { value: '' }, ['— none —']),
    ...groups.map(g => el('option', { value: g.id, selected: previousGroupId === g.id }, [g.name])),
  ]);
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Group']), inputs.groupId]));

  // Birth date + Notes
  inputs.birthDate = el('input', { type: 'date', value: existingAnimal?.birthDate || '' });
  inputs.notes = el('input', { type: 'text', value: existingAnimal?.notes || '' });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Birth date']), inputs.birthDate]));
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Notes']), inputs.notes]));
  inputs.name = { value: existingAnimal?.name || '' }; // hidden, use tagNum as primary

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '10px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => saveAnimal(existingAnimal, sexState, inputs, operationId, farmId, previousGroupId, statusEl) }, ['Save']),
    isEdit ? el('button', { className: 'btn btn-red', style: { width: 'auto', padding: '12px 16px' }, onClick: () => { if (confirm('Delete this animal?')) { remove('animals', existingAnimal.id, 'animals'); animalSheet.close(); } } }, ['Delete']) : null,
    el('button', { className: 'btn btn-outline', onClick: () => animalSheet.close() }, ['Cancel']),
  ].filter(Boolean)));

  animalSheet.open();
}

function saveAnimal(existingAnimal, sexState, inputs, operationId, farmId, previousGroupId, statusEl) {
  clear(statusEl);
  const data = {
    operationId,
    tagNum: inputs.tagNum.value.trim() || null,
    name: inputs.name?.value?.trim?.() || inputs.tagNum.value.trim() || null,
    eid: inputs.eid.value.trim() || null,
    sex: sexState.value,
    classId: inputs.classId.value || null,
    birthDate: inputs.birthDate.value || null,
    notes: inputs.notes.value.trim() || null,
  };
  const newGroupId = inputs.groupId.value || null;
  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    let animalId;
    if (existingAnimal) {
      update('animals', existingAnimal.id, data, AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
      animalId = existingAnimal.id;
    } else {
      const record = AnimalEntity.create(data);
      add('animals', record, AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
      animalId = record.id;
    }
    if (newGroupId !== previousGroupId) {
      if (previousGroupId) {
        const mems = getAll('animalGroupMemberships');
        const oldMem = mems.find(m => m.animalId === animalId && m.groupId === previousGroupId && !m.dateLeft);
        if (oldMem) update('animalGroupMemberships', oldMem.id, { dateLeft: todayStr, reason: 'move' }, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
      }
      if (newGroupId) {
        const newMem = MembershipEntity.create({ operationId, animalId, groupId: newGroupId, dateJoined: todayStr, reason: previousGroupId ? 'move' : 'initial' });
        add('animalGroupMemberships', newMem, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
      }
    }
    animalSheet.close();
  } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
}

// ─── Animal Move Sheet (multi-select action) ──────────────────────────

function openAnimalMoveSheet(operationId) {
  const wrapId = 'animal-move-wrap';
  if (!document.getElementById(wrapId)) {
    document.body.appendChild(el('div', { className: 'sheet-wrap', id: wrapId, style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => moveSheet?.close() }),
      el('div', { className: 'sheet-panel', id: 'animal-move-panel' }),
    ]));
  }
  let moveSheet = new Sheet(wrapId);
  const panel = document.getElementById('animal-move-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const selected = [...selectedAnimals];
  const animals = getAll('animals');
  const groups = getAll('groups').filter(g => !g.archived);
  const names = selected.map(id => { const a = animals.find(x => x.id === id); return a?.tagNum || a?.name || '?'; });

  const todayStr = new Date().toISOString().slice(0, 10);

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Move animals']));
  panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '2px' } }, [`${selected.length} animals selected`]));
  panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' } }, [names.join(', ')]));

  const dateInput = el('input', { type: 'date', value: todayStr });
  panel.appendChild(el('div', { className: 'two', style: { marginBottom: '12px' } }, [
    el('div', { className: 'field' }, [el('label', {}, ['Date']), dateInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Time']), el('input', { type: 'time' })]),
  ]));

  const groupSelect = el('select', {}, [
    el('option', { value: '' }, ['\u2014 select group \u2014']),
    ...groups.map(g => el('option', { value: g.id }, [g.name])),
  ]);
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Move to group']), groupSelect]));

  panel.appendChild(el('div', { className: 'btn-row' }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      const targetGroupId = groupSelect.value;
      if (!targetGroupId) return;
      const date = dateInput.value || todayStr;
      const memberships = getAll('animalGroupMemberships');
      for (const animalId of selected) {
        const oldMem = memberships.find(m => m.animalId === animalId && !m.dateLeft);
        if (oldMem) update('animalGroupMemberships', oldMem.id, { dateLeft: date, reason: 'move' }, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
        const newMem = MembershipEntity.create({ operationId, animalId, groupId: targetGroupId, dateJoined: date, reason: 'move' });
        add('animalGroupMemberships', newMem, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
      }
      selectedAnimals.clear();
      moveSheet.close();
    } }, ['Confirm']),
    el('button', { className: 'btn btn-outline', onClick: () => moveSheet.close() }, ['Cancel']),
  ]));

  moveSheet.open();
}
