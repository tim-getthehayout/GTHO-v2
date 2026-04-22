/** @file Animals screen — V1 parity rebuild. Single-page layout: filter chips, groups, animal list, sheets. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, remove, subscribe, getActiveFarmId, maybeSplitForGroup, reactivateGroup } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert, unitLabel } from '../../utils/units.js';
import * as GroupEntity from '../../entities/group.js';
import * as AnimalClassEntity from '../../entities/animal-class.js';
import * as AnimalEntity from '../../entities/animal.js';
import * as MembershipEntity from '../../entities/animal-group-membership.js';
import * as TreatmentTypeEntity from '../../entities/treatment-type.js';
import * as AiBullEntity from '../../entities/ai-bull.js';
import * as WeightRecordEntity from '../../entities/animal-weight-record.js';
import { openWeightSheet, renderWeightSheetMarkup } from '../health/weight.js';
import { openBcsSheet, renderBcsSheetMarkup } from '../health/bcs.js';
import { openTreatmentSheet, renderTreatmentSheetMarkup } from '../health/treatment.js';
import { openBreedingSheet, renderBreedingSheetMarkup } from '../health/breeding.js';
import { openHeatSheet, renderHeatSheetMarkup } from '../health/heat.js';
import { openCalvingSheet, renderCalvingSheetMarkup } from '../health/calving.js';
import { openCullSheet, buildCulledBanner } from './cull-sheet.js';
import { maybeShowEmptyGroupPrompt } from './empty-group-prompt.js';
import { ANIMAL_CLASSES_BY_SPECIES } from '../onboarding/seed-data.js';

// ─── State ──────────────────────────────────────────────────────────────
let unsubs = [];
let selectedFilter = null;  // group ID or null (All)
let searchQuery = '';
let showCulled = false;
let showArchivedGroups = false;  // OI-0090 / SP-11 Part 4
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
  const animalListWrap = el('div', { 'data-testid': 'animals-list' });

  container.appendChild(filterWrap);
  container.appendChild(configRow);
  container.appendChild(groupsCard);
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
    const groups = getAll('groups').filter(g => !g.archivedAt);
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
    const allGroups = getAll('groups');
    const groups = allGroups.filter(g => !g.archivedAt);
    const archived = allGroups.filter(g => g.archivedAt);
    const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);

    // Header — Groups title, Show archived toggle, + Add group
    const header = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' } }, [
      el('div', { className: 'sec', style: { margin: '0' } }, ['Groups']),
      el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
        archived.length ? el('label', {
          'data-testid': 'groups-show-archived-toggle',
          style: { fontSize: '11px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
        }, [
          el('input', {
            type: 'checkbox',
            checked: showArchivedGroups,
            onChange: (e) => { showArchivedGroups = e.target.checked; renderGroupsList(); },
          }),
          `Show archived (${archived.length})`,
        ]) : null,
        el('button', { className: 'btn btn-green btn-xs', onClick: (e) => { e.stopPropagation(); openGroupSheet(null, operationId, farmId); } }, ['+ Add group']),
      ].filter(Boolean)),
    ]);
    groupsCard.appendChild(header);

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
            isPlaced ? el('button', { className: 'btn btn-outline btn-xs', onClick: () => openSplitGroupSheet(g, operationId, farmId) }, ['Split']) : null,
            el('button', { className: 'btn btn-outline btn-xs', onClick: () => openGroupWeightsSheet(g, operationId) }, ['Weights']),
            el('button', { style: { border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: '18px', padding: '2px 4px' }, onClick: () => { if (confirm(`Delete group "${g.name}"?`)) remove('groups', g.id, 'groups'); } }, ['\u00D7']),
          ].filter(Boolean)),
        ]),
      ]);
      groupsCard.appendChild(row);
    }

    if (!groups.length) {
      groupsCard.appendChild(el('div', { className: 'empty' }, ['No groups yet. Add one to organize your herd.']));
    }

    // OI-0090 / SP-11 Part 4: archived groups section — shown when Show archived toggle is on.
    if (showArchivedGroups && archived.length) {
      groupsCard.appendChild(el('div', { className: 'sec', style: { marginTop: '14px', marginBottom: '6px', color: 'var(--text2)' } }, ['Archived groups']));
      const eventGws = getAll('eventGroupWindows');
      for (const g of archived) {
        const gwsForGroup = eventGws.filter(w => w.groupId === g.id);
        const eventCount = gwsForGroup.length;
        const lastGw = gwsForGroup.slice().sort((a, b) => (b.dateLeft || b.dateJoined || '').localeCompare(a.dateLeft || a.dateJoined || ''))[0];
        const lastHead = lastGw ? lastGw.headCount : 0;
        const archivedOn = g.archivedAt ? g.archivedAt.slice(0, 10) : '—';
        const deleteDisabled = eventCount > 0;

        groupsCard.appendChild(el('div', {
          'data-testid': `archived-group-row-${g.id}`,
          style: { borderLeft: `3px solid ${g.color || 'var(--text2)'}`, marginBottom: '6px', padding: '10px 12px', opacity: '0.85' },
        }, [
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' } }, [
            el('div', {}, [
              el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [
                g.name, ' ',
                el('span', { className: 'badge bb', style: { fontSize: '10px' } }, ['archived']),
              ]),
              el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '2px' } }, [
                `Archived ${archivedOn}${lastHead ? ` \u00B7 last headcount ${lastHead}` : ''}${eventCount ? ` \u00B7 ${eventCount} event${eventCount === 1 ? '' : 's'}` : ''}`,
              ]),
            ]),
            el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
              el('button', {
                className: 'btn btn-green btn-xs',
                'data-testid': `archived-group-reactivate-${g.id}`,
                onClick: () => { reactivateGroup(g.id); },
              }, ['Reactivate']),
              el('button', {
                className: 'btn btn-outline btn-xs',
                'data-testid': `archived-group-delete-${g.id}`,
                style: {
                  color: deleteDisabled ? 'var(--text2)' : 'var(--red)',
                  borderColor: deleteDisabled ? 'var(--border)' : 'var(--red)',
                  opacity: deleteDisabled ? '0.5' : '1',
                  cursor: deleteDisabled ? 'not-allowed' : 'pointer',
                },
                title: deleteDisabled ? `This group is on ${eventCount} event(s). Archive instead to preserve history.` : '',
                onClick: () => {
                  if (deleteDisabled) return;
                  if (!confirm(`Delete ${g.name}? This cannot be undone.`)) return;
                  remove('groups', g.id, 'groups');
                },
              }, ['Delete']),
            ]),
          ]),
        ]));
      }
    }
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
    if (!showCulled) filtered = filtered.filter(a => a.active !== false);
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
      const isCulled = animal.active === false;

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

      // OI-0093: no checkbox column; row's Edit button is the primary per-animal action.
      const row = el('div', {
        'data-testid': `animal-row-${animal.id}`,
        style: { padding: '8px 0', borderBottom: '0.5px solid var(--border)', opacity: isCulled ? '0.5' : '1' },
      }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
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
        el('div', { style: { display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' } }, [
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

function openGroupSheet(existingGroup, operationId, _farmId) {
  ensureGroupSheetDOM();
  if (!groupSheet) groupSheet = new Sheet('group-sheet-wrap');
  const panel = document.getElementById('group-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const isEdit = !!existingGroup;
  const unitSys = getUnitSystem();
  const colors = ['#639922', '#1D9E75', '#185FA5', '#BA7517', '#E24B4A', '#534AB7'];
  let selectedColor = existingGroup?.color || colors[0];
  const todayStr = new Date().toISOString().slice(0, 10);

  // Track selected animal IDs for the picker
  const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);
  const currentGroupMembers = isEdit ? new Set(memberships.filter(m => m.groupId === existingGroup.id).map(m => m.animalId)) : new Set();
  const pickedAnimals = new Set(currentGroupMembers);

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '12px' } }, [isEdit ? 'Edit group' : 'Add group']));

  // Two-column: name + color (v1 layout)
  const nameInput = el('input', { type: 'text', placeholder: 'Cow herd, Yearlings…', value: existingGroup?.name || '' });
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

  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Group name']), nameInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Color']), colorPicker]),
  ]));

  panel.appendChild(el('div', { className: 'div' }));

  // Animal picker section
  panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '6px' } }, ['Animals in group']));
  panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' } }, ['Tap to add/remove animals. Unassigned animals shown.']));

  const pickerEl = el('div', { style: { maxHeight: '220px', overflowY: 'auto', marginBottom: '10px' } });
  function renderAnimalPicker() {
    clear(pickerEl);
    const allAnimals = getAll('animals').filter(a => a.active !== false);
    const classes = getAll('animalClasses');
    const weightRecords = getAll('animalWeightRecords');

    for (const a of allAnimals) {
      const isPicked = pickedAnimals.has(a.id);
      const otherGroupMem = memberships.find(m => m.animalId === a.id && (!isEdit || m.groupId !== existingGroup?.id));
      const inOtherGroup = !!otherGroupMem && !isPicked;
      const cls = a.classId ? classes.find(c => c.id === a.classId) : null;
      const latestW = weightRecords.filter(w => w.animalId === a.id).sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];
      const weightStr = latestW?.weightKg ? display(latestW.weightKg, 'weight', unitSys, 0) + ' ' + unitLabel('weight', unitSys) : '';
      const otherGrp = otherGroupMem ? getAll('groups').find(g => g.id === otherGroupMem.groupId) : null;

      pickerEl.appendChild(el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: isPicked ? 'var(--green-l)' : 'var(--bg2)', borderRadius: 'var(--radius)', marginBottom: '4px', cursor: 'pointer', border: `0.5px solid ${isPicked ? 'var(--green-l2)' : 'var(--border)'}`, opacity: inOtherGroup ? '0.45' : '1' },
        onClick: () => {
          if (isPicked) pickedAnimals.delete(a.id);
          else pickedAnimals.add(a.id);
          renderAnimalPicker();
        },
      }, [
        el('div', {
          style: { width: '16px', height: '16px', borderRadius: '50%', border: `1.5px solid ${isPicked ? 'var(--green)' : 'var(--border2)'}`, background: isPicked ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0' },
        }, isPicked ? [el('svg', { width: '10', height: '10', viewBox: '0 0 12 12', fill: 'none' }, [el('polyline', { points: '2,6 5,9 10,3', stroke: 'white', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })])] : []),
        el('div', { style: { flex: '1', fontSize: '13px' } }, [
          el('strong', {}, [a.tagNum || a.name || `A-${a.id.slice(0, 5)}`]),
          ' ',
          el('span', { style: { color: 'var(--text2)', fontSize: '11px' } }, [
            [a.sex, cls?.name, weightStr, otherGrp?.name].filter(Boolean).join(' \u00B7 '),
          ]),
        ]),
      ]));
    }
  }
  renderAnimalPicker();
  panel.appendChild(pickerEl);

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '12px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      const name = nameInput.value.trim();
      if (!name) { statusEl.appendChild(el('span', {}, ['Name is required'])); return; }
      try {
        let groupId;
        if (isEdit) {
          update('groups', existingGroup.id, { name, color: selectedColor }, GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
          groupId = existingGroup.id;
        } else {
          const record = GroupEntity.create({ operationId, name, color: selectedColor });
          add('groups', record, GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
          groupId = record.id;
        }
        // Sync memberships: add new, remove deselected. OI-0094 entry #1: collect
        // affected groupIds so we can split their open windows after all membership
        // mutations land.
        const affectedGroupIds = new Set();
        const currentMems = memberships.filter(m => m.groupId === groupId);
        for (const m of currentMems) {
          if (!pickedAnimals.has(m.animalId)) {
            update('animalGroupMemberships', m.id, { dateLeft: todayStr, reason: 'removed' }, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
            affectedGroupIds.add(groupId);
          }
        }
        for (const animalId of pickedAnimals) {
          if (!currentMems.some(m => m.animalId === animalId)) {
            // Close any existing membership in another group
            const existingMem = memberships.find(m => m.animalId === animalId && m.groupId !== groupId);
            if (existingMem) {
              update('animalGroupMemberships', existingMem.id, { dateLeft: todayStr, reason: 'move' }, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
              affectedGroupIds.add(existingMem.groupId);
            }
            const newMem = MembershipEntity.create({ operationId, animalId, groupId, dateJoined: todayStr, reason: isEdit ? 'move' : 'initial' });
            add('animalGroupMemberships', newMem, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
            affectedGroupIds.add(groupId);
          }
        }
        for (const gid of affectedGroupIds) maybeSplitForGroup(gid, todayStr);
        // OI-0090: surface archive prompt for any group that just emptied out.
        for (const gid of affectedGroupIds) maybeShowEmptyGroupPrompt(gid);
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

// ─── Split Group Sheet (6B) ─────────────────────────────────────────────

function openSplitGroupSheet(group, operationId, _farmId) {
  const wrapId = 'split-sheet-wrap';
  if (!document.getElementById(wrapId)) {
    document.body.appendChild(el('div', { className: 'sheet-wrap', id: wrapId, style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => splitSheet?.close() }),
      el('div', { className: 'sheet-panel', id: 'split-sheet-panel', style: { maxHeight: '92vh', overflowY: 'auto' } }),
    ]));
  }
  let splitSheet = new Sheet(wrapId);
  const panel = document.getElementById('split-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const unitSys = getUnitSystem();
  const todayStr = new Date().toISOString().slice(0, 10);
  const memberships = getAll('animalGroupMemberships').filter(m => m.groupId === group.id && !m.dateLeft);
  const allAnimals = getAll('animals');
  const classes = getAll('animalClasses');
  const weightRecords = getAll('animalWeightRecords');
  const groups = getAll('groups').filter(g => !g.archivedAt && g.id !== group.id);
  const colors = ['#639922', '#1D9E75', '#185FA5', '#BA7517', '#E24B4A', '#534AB7'];

  // Find location
  const gws = getAll('eventGroupWindows').filter(gw => gw.groupId === group.id && !gw.dateLeft);
  const activeEvent = gws[0] ? getById('events', gws[0].eventId) : null;
  const pws = activeEvent ? getAll('eventPaddockWindows').filter(pw => pw.eventId === activeEvent.id && !pw.dateClosed) : [];
  const loc = pws[0] ? getById('locations', pws[0].locationId) : null;
  const locName = loc?.name || '';

  const splitAnimals = new Set();
  let destType = 'new';
  let newGroupColor = colors[1];
  let newGroupName = '';

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '2px' } }, ['Split group']));
  panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' } }, [`${group.name} \u00B7 ${memberships.length} head${locName ? ` \u00B7 at ${locName}` : ''}`]));

  // Date/time
  const dateInput = el('input', { type: 'date', value: todayStr });
  const timeInput = el('input', { type: 'time' });
  panel.appendChild(el('div', { className: 'two', style: { marginBottom: '12px' } }, [
    el('div', { className: 'field' }, [el('label', {}, ['Split date']), dateInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Time ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeInput]),
  ]));

  // Animal picker
  panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '6px' } }, ['Animals to split off']));
  panel.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginBottom: '8px' } }, ['Tap to select individual animals.']));

  const pickerEl = el('div', { style: { maxHeight: '200px', overflowY: 'auto', marginBottom: '12px' } });
  const previewEl = el('div');

  function renderSplitPicker() {
    clear(pickerEl);
    for (const m of memberships) {
      const a = allAnimals.find(x => x.id === m.animalId);
      if (!a) continue;
      const isPicked = splitAnimals.has(a.id);
      const cls = a.classId ? classes.find(c => c.id === a.classId) : null;
      const latestW = weightRecords.filter(w => w.animalId === a.id).sort((x, y) => (y.date || '').localeCompare(x.date || ''))[0];
      const wStr = latestW?.weightKg ? display(latestW.weightKg, 'weight', unitSys, 0) + ' ' + unitLabel('weight', unitSys) : '';

      pickerEl.appendChild(el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: isPicked ? 'var(--green-l)' : 'var(--bg2)', borderRadius: 'var(--radius)', marginBottom: '4px', cursor: 'pointer', border: `0.5px solid ${isPicked ? 'var(--green-l2)' : 'var(--border)'}` },
        onClick: () => { if (isPicked) splitAnimals.delete(a.id); else splitAnimals.add(a.id); renderSplitPicker(); renderPreview(); },
      }, [
        el('div', { style: { width: '16px', height: '16px', borderRadius: '50%', border: `1.5px solid ${isPicked ? 'var(--green)' : 'var(--border2)'}`, background: isPicked ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0' } },
          isPicked ? [el('svg', { width: '10', height: '10', viewBox: '0 0 12 12', fill: 'none' }, [el('polyline', { points: '2,6 5,9 10,3', stroke: 'white', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })])] : []),
        el('div', { style: { flex: '1', fontSize: '13px' } }, [
          el('strong', {}, [a.tagNum || a.name || `A-${a.id.slice(0, 5)}`]),
          ' ',
          el('span', { style: { color: 'var(--text2)', fontSize: '11px' } }, [[a.sex, cls?.name, wStr].filter(Boolean).join(' \u00B7 ')]),
        ]),
      ]));
    }
  }

  function renderPreview() {
    clear(previewEl);
    if (!splitAnimals.size) return;
    const remaining = memberships.length - splitAnimals.size;
    previewEl.appendChild(el('div', { className: 'card-inset', style: { marginTop: '12px' } }, [
      el('div', { style: { fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--text2)' } }, ['After split']),
      el('div', { style: { padding: '8px 10px', background: 'var(--bg2)', borderRadius: 'var(--radius)', borderLeft: `3px solid ${group.color || '#639922'}` } }, [
        el('div', { style: { fontSize: '12px', fontWeight: '600' } }, [`${group.name} (remaining)`]),
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${remaining} head`]),
      ]),
      el('div', { style: { textAlign: 'center', fontSize: '18px', padding: '4px 0', color: 'var(--text2)' } }, ['\u2193']),
      el('div', { style: { padding: '8px 10px', background: 'var(--bg2)', borderRadius: 'var(--radius)', borderLeft: `3px solid ${newGroupColor}` } }, [
        el('div', { style: { fontSize: '12px', fontWeight: '600' } }, [destType === 'new' ? (newGroupName || 'New group') : 'Existing group']),
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${splitAnimals.size} head`]),
      ]),
    ]));
  }

  renderSplitPicker();
  panel.appendChild(pickerEl);

  // Destination radio
  panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px' } }, ['Where are these animals going?']));
  const destRadios = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' } });
  const newFields = el('div');
  const existingFields = el('div', { style: { display: 'none' } });

  function renderDestRadios() {
    clear(destRadios);
    for (const [val, label] of [['new', 'New group'], ['existing', 'Existing group']]) {
      const radio = el('input', { type: 'radio', name: 'split-dest', value: val, style: { accentColor: 'var(--green)' } });
      if (val === destType) radio.checked = true;
      radio.addEventListener('change', () => {
        destType = val;
        newFields.style.display = val === 'new' ? 'block' : 'none';
        existingFields.style.display = val === 'existing' ? 'block' : 'none';
        renderPreview();
      });
      destRadios.appendChild(el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer' } }, [radio, el('span', { style: { fontSize: '13px' } }, [label])]));
    }
  }
  renderDestRadios();
  panel.appendChild(destRadios);

  // New group fields
  const newNameInput = el('input', { type: 'text', placeholder: 'e.g. Dry cows, Yearlings…' });
  newNameInput.addEventListener('input', () => { newGroupName = newNameInput.value; renderPreview(); });
  const newColorPicker = el('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } });
  function renderNewColorPicker() {
    clear(newColorPicker);
    for (const c of colors) {
      newColorPicker.appendChild(el('div', {
        style: { width: '28px', height: '28px', borderRadius: '50%', background: c, cursor: 'pointer', border: `2px solid ${c === newGroupColor ? 'var(--text)' : 'transparent'}` },
        onClick: () => { newGroupColor = c; renderNewColorPicker(); renderPreview(); },
      }));
    }
  }
  renderNewColorPicker();

  const placementSelect = el('select', {}, [
    el('option', { value: 'same' }, ['Same location as source group']),
    el('option', { value: 'unplaced' }, ['Unplaced \u2014 place later via Move']),
  ]);

  newFields.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['New group name']), newNameInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Color']), newColorPicker]),
  ]));
  newFields.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Placement after split']), placementSelect]));
  panel.appendChild(newFields);

  // Existing group fields
  const existGroupSelect = el('select', {}, [
    el('option', { value: '' }, ['\u2014 select group \u2014']),
    ...groups.map(g => el('option', { value: g.id }, [g.name])),
  ]);
  existingFields.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Move into group']), existGroupSelect]));
  panel.appendChild(existingFields);

  panel.appendChild(previewEl);

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '16px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      if (!splitAnimals.size) { statusEl.appendChild(el('span', {}, ['Select at least one animal'])); return; }
      const date = dateInput.value || todayStr;
      try {
        let targetGroupId;
        if (destType === 'new') {
          const name = newNameInput.value.trim();
          if (!name) { statusEl.appendChild(el('span', {}, ['Enter a group name'])); return; }
          const newGroup = GroupEntity.create({ operationId, name, color: newGroupColor });
          add('groups', newGroup, GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
          targetGroupId = newGroup.id;
        } else {
          targetGroupId = existGroupSelect.value;
          if (!targetGroupId) { statusEl.appendChild(el('span', {}, ['Select a group'])); return; }
        }
        // Move selected animals
        const allMems = getAll('animalGroupMemberships');
        for (const animalId of splitAnimals) {
          const oldMem = allMems.find(m => m.animalId === animalId && m.groupId === group.id && !m.dateLeft);
          if (oldMem) update('animalGroupMemberships', oldMem.id, { dateLeft: date, reason: 'split' }, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
          const newMem = MembershipEntity.create({ operationId, animalId, groupId: targetGroupId, dateJoined: date, reason: 'split' });
          add('animalGroupMemberships', newMem, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
        }
        // OI-0094 entry #2: split source group's open window. Target usually new so no-op;
        // maybeSplitForGroup is a safe guard when target is an existing placed group.
        maybeSplitForGroup(group.id, date);
        maybeSplitForGroup(targetGroupId, date);
        // OI-0090: source may be empty after split; prompt archive flow.
        maybeShowEmptyGroupPrompt(group.id);
        splitSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Confirm split']),
    el('button', { className: 'btn btn-outline', onClick: () => splitSheet.close() }, ['Cancel']),
  ]));

  splitSheet.open();
}

// ─── Classes Manager Sheet ──────────────────────────────────────────────

function ensureClassesSheetDOM() {
  if (document.getElementById('manage-classes-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'manage-classes-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => classSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'manage-classes-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
  ]));
}

export function openClassesManager(operationId) {
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
          el('button', { className: 'btn btn-outline btn-xs', 'data-testid': `class-edit-${cls.id}`, onClick: () => openClassEditForm(cls) }, ['Edit']),
          el('button', { style: { border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: '16px' }, onClick: () => { if (confirm(`Delete class "${cls.name}"?`)) { remove('animalClasses', cls.id, 'animal_classes'); renderClassList(); } } }, ['\u00D7']),
        ]),
      ]));
    }
  }
  renderClassList();
  panel.appendChild(classList);

  panel.appendChild(el('div', { className: 'div' }));

  // OI-0128: Shared Add/Edit form — 11 fields, dual-purpose. `editingClassId`
  // null → Add; set → Edit (species/role locked, Save writes update instead
  // of add). Species + role are create-only: changing either would cascade
  // through downstream calcs and memberships.
  let editingClassId = null;

  const formTitle = el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px' } }, ['Add class']);
  panel.appendChild(formTitle);

  const inputs = {};
  inputs.name = el('input', { type: 'text', placeholder: 'Cow, Heifer, Steer…', 'data-testid': 'class-form-name' });
  inputs.species = el('select', { 'data-testid': 'class-form-species' }, [
    el('option', { value: 'beef_cattle' }, ['Beef cattle']),
    el('option', { value: 'dairy_cattle' }, ['Dairy cattle']),
    el('option', { value: 'sheep' }, ['Sheep']),
    el('option', { value: 'goat' }, ['Goats']),
    el('option', { value: 'other' }, ['Other']),
  ]);
  inputs.role = el('select', { 'data-testid': 'class-form-role' });
  function rebuildRoleOptions(speciesKey, selected) {
    clear(inputs.role);
    const rolesForSpecies = ANIMAL_CLASSES_BY_SPECIES[speciesKey]?.map(c => c.role) ?? [];
    if (rolesForSpecies.length === 0) {
      inputs.role.appendChild(el('option', { value: '' }, ['—']));
      return;
    }
    for (const r of rolesForSpecies) {
      const opt = el('option', { value: r }, [r]);
      if (r === selected) opt.selected = true;
      inputs.role.appendChild(opt);
    }
  }
  rebuildRoleOptions('beef_cattle');
  inputs.species.addEventListener('change', () => rebuildRoleOptions(inputs.species.value));

  inputs.defaultWeightKg = el('input', { type: 'number', placeholder: '1200', step: '1', 'data-testid': 'class-form-weight' });
  inputs.dmiPct = el('input', { type: 'number', placeholder: '2.5', step: '0.1', min: '0.5', max: '6', 'data-testid': 'class-form-dmi-pct' });
  inputs.dmiPctLactating = el('input', { type: 'number', placeholder: '3.0', step: '0.1', min: '0.5', max: '6', 'data-testid': 'class-form-dmi-lactating' });
  inputs.excretionNRate = el('input', { type: 'number', placeholder: '0.145', step: '0.001', 'data-testid': 'class-form-excretion-n' });
  inputs.excretionPRate = el('input', { type: 'number', placeholder: '0.041', step: '0.001', 'data-testid': 'class-form-excretion-p' });
  inputs.excretionKRate = el('input', { type: 'number', placeholder: '0.136', step: '0.001', 'data-testid': 'class-form-excretion-k' });
  inputs.weaningAgeDays = el('input', { type: 'number', placeholder: '205', step: '1', min: '0', 'data-testid': 'class-form-weaning' });
  inputs.archived = el('input', { type: 'checkbox', 'data-testid': 'class-form-archived' });

  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Class name *']), inputs.name]),
    el('div', { className: 'field' }, [el('label', {}, ['Species']), inputs.species]),
  ]));
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Role']), inputs.role]),
    el('div', { className: 'field' }, [el('label', {}, [`Default weight (${unitLabel('weight', unitSys)})`]), inputs.defaultWeightKg]),
  ]));
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['DMI % of body weight']), inputs.dmiPct]),
    el('div', { className: 'field' }, [el('label', {}, ['DMI % when lactating']), inputs.dmiPctLactating]),
  ]));
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Excretion N (kg / 1000 kg BW / day)']), inputs.excretionNRate]),
    el('div', { className: 'field' }, [el('label', {}, ['Excretion P (kg / 1000 kg BW / day)']), inputs.excretionPRate]),
  ]));
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Excretion K (kg / 1000 kg BW / day)']), inputs.excretionKRate]),
    el('div', { className: 'field' }, [el('label', {}, ['Weaning age (days)']), inputs.weaningAgeDays]),
  ]));
  panel.appendChild(el('div', { className: 'field' }, [
    el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [inputs.archived, ' Archived (hide from pickers; historical rows kept)']),
  ]));

  const addStatusEl = el('div', { className: 'auth-error' });
  panel.appendChild(addStatusEl);

  const saveBtn = el('button', { className: 'btn btn-green', 'data-testid': 'class-form-save' }, ['Add class']);
  const cancelEditLink = el('button', {
    className: 'btn btn-outline btn-sm',
    'data-testid': 'class-form-cancel-edit',
    style: { display: 'none' },
  }, ['Cancel edit']);

  function resetForm() {
    editingClassId = null;
    inputs.name.value = '';
    inputs.species.value = 'beef_cattle';
    rebuildRoleOptions('beef_cattle');
    inputs.defaultWeightKg.value = '';
    inputs.dmiPct.value = '';
    inputs.dmiPctLactating.value = '';
    inputs.excretionNRate.value = '';
    inputs.excretionPRate.value = '';
    inputs.excretionKRate.value = '';
    inputs.weaningAgeDays.value = '';
    inputs.archived.checked = false;
    inputs.species.disabled = false;
    inputs.role.disabled = false;
    formTitle.textContent = 'Add class';
    saveBtn.textContent = 'Add class';
    cancelEditLink.style.display = 'none';
  }

  function populateForm(cls) {
    inputs.name.value = cls.name ?? '';
    inputs.species.value = cls.species ?? 'beef_cattle';
    rebuildRoleOptions(cls.species ?? 'beef_cattle', cls.role);
    inputs.defaultWeightKg.value = cls.defaultWeightKg != null
      ? (unitSys === 'imperial'
          ? convert(cls.defaultWeightKg, 'weight', 'toImperial').toFixed(0)
          : String(cls.defaultWeightKg))
      : '';
    inputs.dmiPct.value = cls.dmiPct ?? '';
    inputs.dmiPctLactating.value = cls.dmiPctLactating ?? '';
    inputs.excretionNRate.value = cls.excretionNRate ?? '';
    inputs.excretionPRate.value = cls.excretionPRate ?? '';
    inputs.excretionKRate.value = cls.excretionKRate ?? '';
    inputs.weaningAgeDays.value = cls.weaningAgeDays ?? '';
    inputs.archived.checked = !!cls.archived;
  }

  function openClassEditForm(cls) {
    populateForm(cls);
    editingClassId = cls.id;
    inputs.species.disabled = true;
    inputs.role.disabled = true;
    formTitle.textContent = `Edit ${cls.name}`;
    saveBtn.textContent = 'Save changes';
    cancelEditLink.style.display = '';
    if (typeof panel.scrollTo === 'function') {
      panel.scrollTo({ top: panel.scrollHeight, behavior: 'smooth' });
    }
  }

  saveBtn.addEventListener('click', () => {
    clear(addStatusEl);
    let defaultWeightKg = parseFloat(inputs.defaultWeightKg.value);
    if (!Number.isFinite(defaultWeightKg) || defaultWeightKg < 0) defaultWeightKg = null;
    if (defaultWeightKg != null && unitSys === 'imperial') {
      defaultWeightKg = convert(defaultWeightKg, 'weight', 'toMetric');
    }
    const numOrNull = (v) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const intOrNull = (v) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const data = {
      name: inputs.name.value.trim(),
      species: inputs.species.value,
      role: inputs.role.value || null,
      defaultWeightKg,
      dmiPct: numOrNull(inputs.dmiPct.value),
      dmiPctLactating: numOrNull(inputs.dmiPctLactating.value),
      excretionNRate: numOrNull(inputs.excretionNRate.value),
      excretionPRate: numOrNull(inputs.excretionPRate.value),
      excretionKRate: numOrNull(inputs.excretionKRate.value),
      weaningAgeDays: intOrNull(inputs.weaningAgeDays.value),
      archived: !!inputs.archived.checked,
    };
    try {
      if (editingClassId == null) {
        const record = AnimalClassEntity.create({ operationId, ...data });
        add('animalClasses', record, AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
      } else {
        // Species + role locked on edit — drop them from the patch.
        const { species: _s, role: _r, ...patch } = data;
        update('animalClasses', editingClassId, patch, AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
      }
      resetForm();
      renderClassList();
    } catch (err) {
      addStatusEl.appendChild(el('span', {}, [err.message]));
    }
  });

  cancelEditLink.addEventListener('click', () => { resetForm(); });

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '8px' } }, [
    saveBtn,
    cancelEditLink,
    el('button', { className: 'btn btn-outline', onClick: () => classSheet.close() }, ['Done']),
  ]));

  classSheet.open();
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
    const rec = TreatmentTypeEntity.create({ operationId, name, category: ttCatSelect.value || null });
    add('treatmentTypes', rec, TreatmentTypeEntity.validate, TreatmentTypeEntity.toSupabaseShape, 'treatment_types');
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
    const rec = AiBullEntity.create({ operationId, name, regNumber: sInputs.reg.value.trim() || null, breed: sInputs.breed.value.trim() || null, epds: sInputs.epds.value.trim() || null });
    add('aiBulls', rec, AiBullEntity.validate, AiBullEntity.toSupabaseShape, 'ai_bulls');
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
      let anyChange = false;
      for (const wi of weightInputs) {
        const val = parseFloat(wi.input.value);
        if (isNaN(val) || val <= 0) continue;
        let weightKg = val;
        if (unitSys === 'imperial') weightKg = convert(val, 'weight', 'toMetric');
        const rec = WeightRecordEntity.create({ operationId, animalId: wi.animalId, weightKg, date: dateInput.value });
        add('animalWeightRecords', rec, WeightRecordEntity.validate, WeightRecordEntity.toSupabaseShape, 'animal_weight_records');
        anyChange = true;
      }
      // OI-0094 entry #4: head count unchanged but avg weight shifts → split the group's open window.
      if (anyChange) maybeSplitForGroup(group.id, dateInput.value);
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

export function openAnimalSheet(existingAnimal, operationId, farmId) {
  ensureAnimalSheetDOM();
  if (!animalSheet) animalSheet = new Sheet('ae-sheet-wrap');
  const panel = document.getElementById('ae-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const isEdit = !!existingAnimal;
  const unitSys = getUnitSystem();
  const classes = getAll('animalClasses');
  const groups = getAll('groups').filter(g => !g.archivedAt);
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

  // OI-0093: Group picker — v2 pattern (tap-to-select rows, matches Move wizard + group-add).
  // `inputs.groupId.value` is read at save time; mirror the <select> interface so saveAnimal
  // keeps working unchanged.
  const groupSelection = { groupId: previousGroupId || null };
  const groupPicker = el('div', {
    className: 'loc-picker',
    'data-testid': 'animal-group-picker',
    style: { maxHeight: '160px', overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px' },
  });
  function renderAnimalGroupPicker() {
    clear(groupPicker);
    const noneRow = el('div', {
      className: `loc-picker-item${groupSelection.groupId === null ? ' selected' : ''}`,
      'data-testid': 'animal-group-picker-none',
      onClick: () => { groupSelection.groupId = null; renderAnimalGroupPicker(); },
    }, [el('span', { style: { color: 'var(--text2)', fontStyle: 'italic' } }, ['— none —'])]);
    groupPicker.appendChild(noneRow);
    for (const g of groups) {
      const isSelected = groupSelection.groupId === g.id;
      groupPicker.appendChild(el('div', {
        className: `loc-picker-item${isSelected ? ' selected' : ''}`,
        'data-testid': `animal-group-picker-${g.id}`,
        onClick: () => { groupSelection.groupId = g.id; renderAnimalGroupPicker(); },
      }, [el('span', {}, [g.name])]));
    }
  }
  renderAnimalGroupPicker();
  inputs.groupId = { get value() { return groupSelection.groupId || ''; } };

  // Weight — OI-0096: read-only current weight + ⚖ Weight button.
  // The editable input was silently dropped by saveAnimal (no reader); removing
  // inputs.currentWeight entirely makes the silent-save regression permanently
  // impossible. Weight changes flow through Quick Weight (which calls
  // maybeSplitForGroup after save, closing the group-side OI-0094 gap).
  const weightRecords = getAll('animalWeightRecords');
  const latestW = isEdit ? weightRecords.filter(w => w.animalId === existingAnimal.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] : null;
  const currentWeightText = latestW?.weightKg
    ? `${display(latestW.weightKg, 'weight', unitSys, 0)} ${unitLabel('weight', unitSys)}`
    : '\u2014';
  const weightRow = el('div', { className: 'field' }, [
    el('label', {}, ['Current weight']),
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, [
      el('div', {
        'data-testid': 'edit-animal-current-weight',
        style: { fontSize: '15px', fontWeight: '500', color: latestW ? 'var(--text)' : 'var(--text2)' },
      }, [currentWeightText]),
      isEdit ? el('button', {
        className: 'btn btn-outline btn-sm',
        'data-testid': 'edit-animal-weight-btn',
        onClick: () => {
          animalSheet.close();
          openWeightSheet(existingAnimal, operationId);
        },
      }, ['\u2696 Weight']) : null,
    ].filter(Boolean)),
  ]);
  panel.appendChild(weightRow);
  panel.appendChild(el('div', { className: 'field' }, [
    el('label', {}, ['Group']),
    groupPicker,
  ]));

  // Dam (v1 gap fix — OI-0099 Class A wires saveAnimal to read this).
  const allAnimals = getAll('animals');
  const females = allAnimals.filter(a => a.sex === 'female');
  inputs.damId = el('select', { 'data-testid': 'edit-animal-dam-select' }, [
    el('option', { value: '' }, ['\u2014 unknown \u2014']),
    ...females.map(a => el('option', { value: a.id, selected: existingAnimal?.damId === a.id }, [a.tagNum || a.name || `A-${a.id.slice(0, 5)}`])),
  ]);
  panel.appendChild(el('div', { className: 'field' }, [
    el('label', {}, ['Dam ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['mother'])]),
    inputs.damId,
  ]));

  // Sire picker (OI-0099 Class B B1: three modes — Animal in herd / AI bull / None,
  // with an inline Add AI bull sub-dialog). Replaces the legacy freeform `sireTag`
  // input which had no matching entity field and was silently dropped on save.
  //
  // Mutual exclusivity: only one of sireAnimalId / sireAiBullId is populated at a
  // time; the mode controls which FK is written. "None" writes both to null.
  //
  // Semantic note: ai_bulls will effectively hold historical/external non-AI bulls
  // that farmers add inline. The table name is a v1-era artifact; renaming/
  // splitting is a future OI (deferred per OI-0099 spec).
  const males = allAnimals.filter(a => a.sex === 'male' && a.active !== false);
  const sireSelection = {
    mode: existingAnimal?.sireAnimalId ? 'animal'
      : existingAnimal?.sireAiBullId ? 'aiBull'
        : 'none',
    sireAnimalId: existingAnimal?.sireAnimalId || null,
    sireAiBullId: existingAnimal?.sireAiBullId || null,
  };

  const sireModeBar = el('div', {
    'data-testid': 'sire-mode-bar',
    style: { display: 'flex', gap: '4px', marginBottom: '6px' },
  });
  const sireListContainer = el('div', {
    'data-testid': 'sire-list-container',
    style: { maxHeight: '160px', overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', padding: '4px' },
  });
  const sireSummary = el('div', {
    'data-testid': 'sire-summary',
    style: { fontSize: '11px', color: 'var(--text2)', marginTop: '4px' },
  });

  function labelForAnimal(a) {
    const tag = a.tagNum ? String(a.tagNum) : '';
    const name = a.name ? String(a.name) : '';
    if (tag && name) return `${tag} \u2014 ${name}`;
    return tag || name || `A-${a.id.slice(0, 5)}`;
  }
  function labelForBull(b) {
    const name = b.name || '?';
    const tag = b.tag ? ` \u00B7 ${b.tag}` : '';
    const breed = b.breed ? `  [${b.breed}]` : '';
    return `${name}${tag}${breed}`;
  }
  function updateSireSummary() {
    clear(sireSummary);
    if (sireSelection.mode === 'animal' && sireSelection.sireAnimalId) {
      const a = allAnimals.find(x => x.id === sireSelection.sireAnimalId);
      sireSummary.appendChild(el('span', {}, [`Selected: ${a ? labelForAnimal(a) : '(missing)'}`]));
    } else if (sireSelection.mode === 'aiBull' && sireSelection.sireAiBullId) {
      const bulls = getAll('aiBulls');
      const b = bulls.find(x => x.id === sireSelection.sireAiBullId);
      sireSummary.appendChild(el('span', {}, [`Selected: ${b ? labelForBull(b) : '(missing)'}`]));
    } else if (sireSelection.mode === 'none') {
      sireSummary.appendChild(el('span', { style: { fontStyle: 'italic' } }, ['No sire set']));
    } else {
      sireSummary.appendChild(el('span', { style: { fontStyle: 'italic' } }, ['Select a sire below']));
    }
  }

  function renderSirePicker() {
    clear(sireModeBar);
    const modes = [
      { key: 'animal', label: 'Animal in herd' },
      { key: 'aiBull', label: 'AI bull' },
      { key: 'none', label: 'None' },
    ];
    for (const m of modes) {
      const active = sireSelection.mode === m.key;
      sireModeBar.appendChild(el('button', {
        type: 'button',
        className: active ? 'btn btn-teal btn-xs' : 'btn btn-outline btn-xs',
        'data-testid': `sire-mode-${m.key}`,
        onClick: () => {
          // OI-0099: mutual exclusivity — switching mode clears the other FK.
          sireSelection.mode = m.key;
          if (m.key === 'animal') sireSelection.sireAiBullId = null;
          if (m.key === 'aiBull') sireSelection.sireAnimalId = null;
          if (m.key === 'none') {
            sireSelection.sireAnimalId = null;
            sireSelection.sireAiBullId = null;
          }
          renderSirePicker();
        },
      }, [m.label]));
    }

    clear(sireListContainer);
    if (sireSelection.mode === 'animal') {
      if (!males.length) {
        sireListContainer.appendChild(el('div', {
          style: { fontSize: '12px', color: 'var(--text2)', fontStyle: 'italic', padding: '6px' },
        }, ['No male animals in this operation yet.']));
      } else {
        for (const a of males) {
          const isSel = sireSelection.sireAnimalId === a.id;
          sireListContainer.appendChild(el('div', {
            className: `loc-picker-item${isSel ? ' selected' : ''}`,
            'data-testid': `sire-animal-${a.id}`,
            onClick: () => {
              sireSelection.sireAnimalId = a.id;
              sireSelection.sireAiBullId = null;
              renderSirePicker();
            },
          }, [el('span', {}, [labelForAnimal(a)])]));
        }
      }
    } else if (sireSelection.mode === 'aiBull') {
      // Inline "+ Add AI bull" action at the top of the list.
      sireListContainer.appendChild(el('div', {
        className: 'loc-picker-item',
        'data-testid': 'sire-add-ai-bull',
        style: { color: 'var(--teal)', fontWeight: '500' },
        onClick: () => openAddAiBullSubDialog(operationId, (newBullId) => {
          sireSelection.sireAiBullId = newBullId;
          sireSelection.sireAnimalId = null;
          renderSirePicker();
        }),
      }, [el('span', {}, ['+ Add AI bull'])]));

      const bulls = getAll('aiBulls').filter(b => b.operationId === operationId && !b.archived);
      if (!bulls.length) {
        sireListContainer.appendChild(el('div', {
          style: { fontSize: '12px', color: 'var(--text2)', fontStyle: 'italic', padding: '6px' },
        }, ['No AI bulls on file. Use + Add AI bull above.']));
      } else {
        for (const b of bulls) {
          const isSel = sireSelection.sireAiBullId === b.id;
          sireListContainer.appendChild(el('div', {
            className: `loc-picker-item${isSel ? ' selected' : ''}`,
            'data-testid': `sire-ai-bull-${b.id}`,
            onClick: () => {
              sireSelection.sireAiBullId = b.id;
              sireSelection.sireAnimalId = null;
              renderSirePicker();
            },
          }, [el('span', {}, [labelForBull(b)])]));
        }
      }
    } else {
      sireListContainer.appendChild(el('div', {
        style: { fontSize: '12px', color: 'var(--text2)', fontStyle: 'italic', padding: '6px' },
      }, ['No sire will be saved on this animal.']));
    }

    updateSireSummary();
  }
  renderSirePicker();

  // Shim the picker output to the `inputs.*` accessor pattern saveAnimal reads.
  inputs.sireAnimalId = { get value() { return sireSelection.mode === 'animal' ? (sireSelection.sireAnimalId || '') : ''; } };
  inputs.sireAiBullId = { get value() { return sireSelection.mode === 'aiBull' ? (sireSelection.sireAiBullId || '') : ''; } };

  panel.appendChild(el('div', { className: 'field', 'data-testid': 'sire-picker' }, [
    el('label', {}, ['Sire']),
    sireModeBar,
    sireListContainer,
    sireSummary,
  ]));

  // Notes
  inputs.notes = el('input', { type: 'text', value: existingAnimal?.notes || '' });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Notes']), inputs.notes]));

  // Birth date
  inputs.birthDate = el('input', { type: 'date', value: existingAnimal?.birthDate || '' });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Birth date ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), inputs.birthDate]));
  inputs.name = { value: existingAnimal?.name || '' };

  // ── Weaning toggle (v1 gap fix) ──
  // OI-0099 Class A: wired into saveAnimal. Plus weanedDate field (locked behavior):
  //   off → weaned=false, weanedDate=null, date field disabled
  //   off → on flip → weaned=true, weanedDate defaults to today, date field enabled + editable
  //   farmer edits date while on → weanedDate takes the edited value (back-date support)
  //   on → off flip → weaned=false, weanedDate=null, date field disabled again
  if (isEdit) {
    panel.appendChild(el('div', { className: 'div' }));
    const weanedCheck = el('input', { type: 'checkbox', style: { width: '18px', height: '18px', accentColor: 'var(--teal)', flexShrink: '0' } });
    if (existingAnimal.weaned) weanedCheck.checked = true;
    const todayStr = new Date().toISOString().slice(0, 10);
    const weanedDateInput = el('input', {
      type: 'date',
      value: existingAnimal.weanedDate || '',
      'data-testid': 'edit-animal-weaned-date',
    });
    weanedDateInput.disabled = !weanedCheck.checked;
    weanedCheck.addEventListener('change', () => {
      if (weanedCheck.checked) {
        // Flip on — default to today if no prior date
        if (!weanedDateInput.value) weanedDateInput.value = todayStr;
        weanedDateInput.disabled = false;
      } else {
        // Flip off — clear
        weanedDateInput.value = '';
        weanedDateInput.disabled = true;
      }
    });
    panel.appendChild(el('label', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', cursor: 'pointer' } }, [
      weanedCheck,
      el('div', {}, [
        el('div', { style: { fontSize: '14px', fontWeight: '500' } }, ['Weaned']),
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, ['Uncheck to mark as unweaned and track in the Weaning report']),
      ]),
    ]));
    panel.appendChild(el('div', { className: 'field' }, [
      el('label', {}, ['Weaned date ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['editable to back-date'])]),
      weanedDateInput,
    ]));
    inputs.weaned = weanedCheck;
    inputs.weanedDate = weanedDateInput;

    // ── Calving history (females only, v1 gap fix) ──
    if (existingAnimal.sex === 'female') {
      panel.appendChild(el('div', { className: 'div' }));
      const calvingRecords = getAll('animalCalvingRecords').filter(r => r.damId === existingAnimal.id);
      panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } }, [
        el('div', { className: 'sec', style: { margin: '0' } }, ['Calving history']),
        el('button', { className: 'btn btn-teal btn-xs', onClick: () => { animalSheet.close(); openCalvingSheet(existingAnimal, operationId); } }, ['+ Record calving']),
      ]));
      if (calvingRecords.length) {
        for (const cr of calvingRecords.sort((a, b) => (b.calvedAt || '').localeCompare(a.calvedAt || ''))) {
          const calf = cr.calfId ? allAnimals.find(a => a.id === cr.calfId) : null;
          panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', padding: '4px 0', borderBottom: '0.5px solid var(--border)' } }, [
            `${cr.calvedAt?.slice(0, 10) || '?'} \u00B7 ${cr.stillbirth ? 'Stillbirth' : (calf?.tagNum || calf?.name || 'Calf')} ${calf?.sex || ''}`,
          ]));
        }
      } else {
        panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, ['No calving records']));
      }

      // Confirmed bred toggle
      panel.appendChild(el('div', { className: 'div' }));
      const bredCheck = el('input', { type: 'checkbox', style: { width: '18px', height: '18px', accentColor: 'var(--teal)', flexShrink: '0' } });
      if (existingAnimal.confirmedBred) bredCheck.checked = true;
      panel.appendChild(el('label', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', cursor: 'pointer' } }, [
        bredCheck,
        el('div', {}, [
          el('div', { style: { fontSize: '14px', fontWeight: '500' } }, ['Confirmed bred']),
          el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, ['Pregnancy check / palpation confirmed']),
        ]),
      ]));
      inputs.confirmedBred = bredCheck;

      // Heat history
      panel.appendChild(el('div', { className: 'div' }));
      const heatRecords = getAll('animalHeatRecords').filter(r => r.animalId === existingAnimal.id);
      panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' } }, [
        el('div', { className: 'sec', style: { margin: '0' } }, ['Heat history']),
        el('button', { className: 'btn btn-teal btn-xs', onClick: () => { animalSheet.close(); openHeatSheet(existingAnimal, operationId); } }, ['+ Record heat']),
      ]));
      if (heatRecords.length) {
        for (const hr of heatRecords.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5)) {
          panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', padding: '4px 0', borderBottom: '0.5px solid var(--border)' } }, [
            `${hr.date || '?'}${hr.notes ? ' \u00B7 ' + hr.notes : ''}`,
          ]));
        }
      } else {
        panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, ['No heat records']));
      }
    }

    // ── Weight history ──
    panel.appendChild(el('div', { className: 'div' }));
    panel.appendChild(el('div', { className: 'sec', style: { marginBottom: '6px' } }, ['Weight history']));
    const animalWeights = weightRecords.filter(w => w.animalId === existingAnimal.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (animalWeights.length) {
      const wHistEl = el('div', { style: { fontSize: '12px', color: 'var(--text2)', maxHeight: '120px', overflowY: 'auto' } });
      for (const w of animalWeights) {
        wHistEl.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '0.5px solid var(--border)' } }, [
          el('span', {}, [w.date || '?']),
          el('span', { style: { fontWeight: '500' } }, [`${display(w.weightKg, 'weight', unitSys, 0)} ${unitLabel('weight', unitSys)}${w.notes ? ' \u00B7 ' + w.notes : ''}`]),
        ]));
      }
      panel.appendChild(wHistEl);
    } else {
      panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, ['No weight records']));
    }

    // ── Treatment history ──
    panel.appendChild(el('div', { className: 'div' }));
    panel.appendChild(el('div', { className: 'sec', style: { marginBottom: '6px' } }, ['Treatment history']));
    const treatments = getAll('animalTreatments').filter(t2 => t2.animalId === existingAnimal.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (treatments.length) {
      for (const tr of treatments.slice(0, 10)) {
        const tt = tr.treatmentTypeId ? getAll('treatmentTypes').find(t2 => t2.id === tr.treatmentTypeId) : null;
        panel.appendChild(el('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '0.5px solid var(--border)' } }, [
          el('span', { style: { fontSize: '16px', flexShrink: '0' } }, ['\uD83D\uDC89']),
          el('div', { style: { flex: '1', minWidth: '0' } }, [
            el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [tt?.name || 'Treatment']),
            el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [
              [tr.date, tr.product ? tr.product + (tr.dose ? ' @ ' + tr.dose : '') : null].filter(Boolean).join(' \u00B7 '),
            ]),
          ]),
        ]));
      }
    } else {
      panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)' } }, ['No treatments recorded']));
    }

    // ── Cull section ──
    panel.appendChild(el('div', { style: { marginTop: '10px' } }));
    if (existingAnimal.active === false) {
      panel.appendChild(buildCulledBanner(existingAnimal, () => animalSheet.close()));
    } else {
      panel.appendChild(el('button', {
        className: 'btn btn-sm',
        style: { width: 'auto', background: 'var(--amber)', color: 'white' },
        'data-testid': 'open-cull-sheet',
        onClick: () => openCullSheet(existingAnimal, operationId, () => animalSheet.close()),
      }, [t('animal.cullAnimal')]));
    }
  }

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '10px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => saveAnimal(existingAnimal, sexState, inputs, operationId, farmId, previousGroupId, statusEl) }, ['Save']),
    isEdit ? el('button', { className: 'btn btn-red', style: { width: 'auto', padding: '12px 16px' }, onClick: () => { if (confirm('Delete this animal?')) { remove('animals', existingAnimal.id, 'animals'); animalSheet.close(); } } }, ['Delete']) : null,
    el('button', { className: 'btn btn-outline', onClick: () => animalSheet.close() }, ['Cancel']),
  ].filter(Boolean)));

  animalSheet.open();
}

/**
 * OI-0099: Inline "Add AI bull" sub-dialog. Opens a modal overlay from within
 * the Edit Animal sire picker. Captures name (required), tag (optional),
 * breed (optional). On save: creates an `ai_bulls` row via the standard 5-param
 * add() flow, then invokes `onSelected(newBull.id)` so the caller can set
 * `sireAiBullId` on the current animal without closing the Edit Animal dialog.
 */
function openAddAiBullSubDialog(operationId, onSelected) {
  const overlay = el('div', {
    'data-testid': 'add-ai-bull-overlay',
    style: {
      position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
      background: 'rgba(0,0,0,0.5)', zIndex: '320',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
  });
  const card = el('div', { className: 'card', style: { padding: 'var(--space-5)', maxWidth: '380px', width: '90%' } });

  card.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: 'var(--space-3)' } }, ['Add AI bull']));

  const nameInput = el('input', { type: 'text', placeholder: 'Name (required)', 'data-testid': 'add-ai-bull-name' });
  const tagInput = el('input', { type: 'text', placeholder: 'Tag (optional)', 'data-testid': 'add-ai-bull-tag' });
  const breedInput = el('input', { type: 'text', placeholder: 'Breed (optional)', 'data-testid': 'add-ai-bull-breed' });

  card.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Name']), nameInput]));
  card.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Tag']), tagInput]));
  card.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Breed']), breedInput]));

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'add-ai-bull-status' });
  card.appendChild(statusEl);

  card.appendChild(el('div', { className: 'btn-row' }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'add-ai-bull-save',
      onClick: () => {
        clear(statusEl);
        const name = nameInput.value.trim();
        if (!name) { statusEl.appendChild(el('span', {}, ['Name is required'])); return; }
        try {
          const rec = AiBullEntity.create({
            operationId,
            name,
            tag: tagInput.value.trim() || null,
            breed: breedInput.value.trim() || null,
          });
          add('aiBulls', rec, AiBullEntity.validate, AiBullEntity.toSupabaseShape, 'ai_bulls');
          overlay.remove();
          if (onSelected) onSelected(rec.id);
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, ['Add bull']),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'add-ai-bull-cancel',
      onClick: () => overlay.remove(),
    }, ['Cancel']),
  ]));

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  // Focus the name input so the farmer can start typing immediately.
  setTimeout(() => nameInput.focus(), 0);
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
    // OI-0099 Class A: damId + weaned + weanedDate.
    damId: inputs.damId?.value || null,
    weaned: inputs.weaned ? inputs.weaned.checked : null,
    weanedDate: inputs.weaned && inputs.weaned.checked
      ? (inputs.weanedDate?.value || null)
      : null,
    // OI-0099 Class B sire picker: mutual exclusivity via shim getters on inputs.
    sireAnimalId: inputs.sireAnimalId?.value || null,
    sireAiBullId: inputs.sireAiBullId?.value || null,
    // OI-0099 Class B confirmedBred: new column migration 026.
    confirmedBred: inputs.confirmedBred ? inputs.confirmedBred.checked : false,
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
      // OI-0094 entry #3: split both source (if any) and target (if any) groups' open windows.
      if (previousGroupId) maybeSplitForGroup(previousGroupId, todayStr);
      if (newGroupId) maybeSplitForGroup(newGroupId, todayStr);
      // OI-0090: moving an animal may empty the source group.
      if (previousGroupId) maybeShowEmptyGroupPrompt(previousGroupId);
    }
    animalSheet.close();
  } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
}

// OI-0093: openAnimalMoveSheet removed along with the bulk action bar. Per-animal
// group changes now flow through Edit Animal → group picker. Group-level moves
// use the Move wizard (Events screen).
