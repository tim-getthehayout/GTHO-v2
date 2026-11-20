/** @file Animals screen — V1 parity rebuild. Single-page layout: filter chips, groups, animal list, sheets. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, remove, subscribe, getActiveFarmId, maybeSplitForGroup, archiveGroup, reactivateGroup, resolveGroupCurrentPlacement, runDurableWrite } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert, unitLabel } from '../../utils/units.js';
import * as GroupEntity from '../../entities/group.js';
import * as AnimalClassEntity from '../../entities/animal-class.js';
import * as AnimalEntity from '../../entities/animal.js';
import * as MembershipEntity from '../../entities/animal-group-membership.js';
import { requireTreatmentCategory } from '../health/reference-tables.js';
import * as TreatmentTypeEntity from '../../entities/treatment-type.js';
import * as AiBullEntity from '../../entities/ai-bull.js';
import * as WeightRecordEntity from '../../entities/animal-weight-record.js';
import { openWeightSheet, renderWeightSheetMarkup } from '../health/weight.js';
import { openBcsSheet, renderBcsSheetMarkup } from '../health/bcs.js';
import { openTreatmentSheet, renderTreatmentSheetMarkup } from '../health/treatment.js';
import { openBreedingSheet, renderBreedingSheetMarkup } from '../health/breeding.js';
import { openHeatSheet, renderHeatSheetMarkup } from '../health/heat.js';
import { openCalvingSheet, renderCalvingSheetMarkup } from '../health/calving.js';
import { openCullSheet, buildCulledBanner, openCullFromGroupCard, livingCompositesInGroup } from './cull-sheet.js';
import { syncCalvingRecordForAnimal } from './calving-sync.js';
import { maybeShowEmptyGroupPrompt, groupEventHistoryCount } from './empty-group-prompt.js';
import { showToast } from '../../ui/toast.js';
import { animalHeadCount, latestWeightForAnimal } from '../../calcs/window-helpers.js';
import { confirmCompositeReductions, applyCompositeReductions } from './composite.js';
import {
  validateHeadsToSplit,
  suggestSplitGroupName,
  confirmCompositeHeadSplit,
  undoCompositeSplit,
  showSplitUndoToast,
  splitWindowsForGroups,
  clearSplitUndo,
} from './split-heads.js';
import { ANIMAL_CLASSES_BY_SPECIES } from '../onboarding/seed-data.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { localFormTimestamp, optionalFormNumber } from '../../utils/form-values.js';

// ─── State ──────────────────────────────────────────────────────────────
let unsubs = [];
/** @type {Set<string>} live group ids multi-select OR. Empty + !cullsSelected = All. */
let selectedGroupIds = new Set();
/** Culls exclusive with All and every live group. */
let cullsSelected = false;
/** @type {Set<string>} species keys multi-select OR. Empty = All (no species filter). */
let selectedSpecies = new Set();
/** @type {Set<string>} multi-select class filter (OR). Empty = inactive. */
let selectedClassIds = new Set();
/** @type {Set<'open'|'confirmed_bred'>} status multi-select OR. Empty = inactive. */
let selectedStatuses = new Set();
let searchQuery = '';
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
  function activeMemberships() {
    return getAll('animalGroupMemberships').filter(m => !m.dateLeft);
  }

  function animalsAfterGroupsFilter() {
    const allAnimals = getAll('animals');
    const memberships = activeMemberships();
    if (cullsSelected) {
      return allAnimals.filter(a => a.active === false);
    }
    let filtered = allAnimals.filter(a => a.active !== false);
    if (selectedGroupIds.size > 0) {
      const ids = new Set(
        memberships.filter(m => selectedGroupIds.has(m.groupId)).map(m => m.animalId),
      );
      filtered = filtered.filter(a => ids.has(a.id));
    }
    return filtered;
  }

  function animalsAfterSpeciesFilter(groupPool) {
    if (selectedSpecies.size === 0) return groupPool;
    const classById = new Map(getAll('animalClasses').map(c => [c.id, c]));
    return groupPool.filter(a => {
      const cls = a.classId ? classById.get(a.classId) : null;
      return cls && selectedSpecies.has(cls.species);
    });
  }

  function animalsAfterClassFilter(speciesPool) {
    if (selectedClassIds.size === 0) return speciesPool;
    return speciesPool.filter(a => a.classId && selectedClassIds.has(a.classId));
  }

  function distinctSpeciesInPool(pool) {
    const classById = new Map(getAll('animalClasses').map(c => [c.id, c]));
    const set = new Set();
    for (const a of pool) {
      const cls = a.classId ? classById.get(a.classId) : null;
      if (cls?.species) set.add(cls.species);
    }
    return [...set].sort();
  }

  function classesWithAnimalsInPool(pool) {
    const counts = new Map();
    for (const a of pool) {
      if (!a.classId) continue;
      counts.set(a.classId, (counts.get(a.classId) || 0) + 1);
    }
    return getAll('animalClasses')
      .filter(c => !c.archived && counts.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function poolHasFemale(pool) {
    return pool.some(a => a.sex === 'female');
  }

  /** Drop invalid child selections when a parent changes (R2). Search stays. */
  function pruneChildFilters() {
    const groupPool = animalsAfterGroupsFilter();
    const availableSpecies = new Set(distinctSpeciesInPool(groupPool));
    for (const s of [...selectedSpecies]) {
      if (!availableSpecies.has(s)) selectedSpecies.delete(s);
    }
    const speciesPool = animalsAfterSpeciesFilter(groupPool);
    const availableClasses = new Set(classesWithAnimalsInPool(speciesPool).map(c => c.id));
    for (const id of [...selectedClassIds]) {
      if (!availableClasses.has(id)) selectedClassIds.delete(id);
    }
    const classPool = animalsAfterClassFilter(speciesPool);
    if (!poolHasFemale(classPool)) selectedStatuses.clear();
  }

  function resetFilterRows() {
    selectedGroupIds = new Set();
    cullsSelected = false;
    selectedSpecies = new Set();
    selectedClassIds = new Set();
    selectedStatuses = new Set();
  }

  function liveGroupCardStats(g) {
    const animals = getAll('animals');
    const memberships = activeMemberships();
    const groupAnimalIds = new Set(memberships.filter(m => m.groupId === g.id).map(m => m.animalId));
    const groupAnimals = animals.filter(a => groupAnimalIds.has(a.id));
    const headCount = groupAnimals.reduce((sum, a) => sum + animalHeadCount(a), 0);

    let females = 0;
    let males = 0;
    for (const a of groupAnimals) {
      const heads = animalHeadCount(a);
      if (a.sex === 'female') females += heads;
      else if (a.sex === 'male') males += heads;
    }
    const sexLine = [females > 0 ? `${females} female` : null, males > 0 ? `${males} male` : null].filter(Boolean).join(', ');

    const weightRecords = getAll('animalWeightRecords');
    const classes = getAll('animalClasses');
    let totalWeightKg = 0;
    for (const a of groupAnimals) {
      const latestW = latestWeightForAnimal(weightRecords, a.id);
      const cls = a.classId ? classes.find(c => c.id === a.classId) : null;
      if (a.isBulk === true) {
        const heads = animalHeadCount(a);
        totalWeightKg += latestW?.weightKg ?? ((cls?.defaultWeightKg ?? 0) * heads);
      } else {
        totalWeightKg += latestW?.weightKg ?? cls?.defaultWeightKg ?? 0;
      }
    }
    const avgWeightDisplay = headCount > 0 ? display(totalWeightKg / headCount, 'weight', unitSys, 0) : '—';
    const dmiKg = totalWeightKg * 0.025;
    const dmiDisplay = display(dmiKg, 'weight', unitSys, 0);
    const placement = resolveGroupCurrentPlacement(g.id);
    return {
      sexLine,
      headCount,
      avgWeightDisplay,
      dmiDisplay,
      isPlaced: placement.placed,
      locName: placement.displayName,
    };
  }

  function buildLiveGroupFilterCard(g) {
    const stats = liveGroupCardStats(g);
    const isSelected = selectedGroupIds.has(g.id);
    return el('div', {
      className: `groups-grid-tile${isSelected ? ' groups-grid-tile--selected active' : ''}`,
      'data-testid': `group-tile-${g.id}`,
      style: { borderLeft: `3px solid ${g.color || 'var(--green)'}` },
      onClick: () => {
        if (isSelected) selectedGroupIds.delete(g.id);
        else selectedGroupIds.add(g.id);
        cullsSelected = false;
        pruneChildFilters();
        renderAll();
      },
    }, [
      el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [
        g.name, ' ',
        stats.isPlaced
          ? el('span', { className: 'badge bt' }, [`active \u00B7 ${stats.locName}`])
          : el('span', { className: 'badge bb' }, ['unplaced']),
      ]),
      stats.sexLine ? el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '2px' } }, [stats.sexLine]) : null,
      el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [
        `${stats.headCount} head \u00B7 avg ${stats.avgWeightDisplay} \u00B7 DMI target ${stats.dmiDisplay}/day`,
      ]),
      el('div', {
        style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' },
        onClick: (e) => e.stopPropagation(),
      }, [
        el('button', { className: 'btn btn-outline btn-xs', onClick: () => openGroupSheet(g, operationId) }, ['Edit']),
        stats.isPlaced ? el('button', { className: 'btn btn-outline btn-xs', onClick: () => openSplitGroupSheet(g, operationId) }, ['Split']) : null,
        el('button', { className: 'btn btn-outline btn-xs', onClick: () => openGroupWeightsSheet(g, operationId) }, ['Weights']),
        livingCompositesInGroup(g.id).length
          ? el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `group-cull-${g.id}`,
            onClick: () => openCullFromGroupCard(g, operationId),
          }, [t('animal.cullGroupCard') || 'Cull'])
          : null,
      ].filter(Boolean)),
    ].filter(Boolean));
  }

  function renderFilterHeader() {
    clear(filterWrap);
    const groups = getAll('groups').filter(g => !g.archivedAt);
    const cullCount = getAll('animals').filter(a => a.active === false).length;
    const allSelected = !cullsSelected && selectedGroupIds.size === 0;

    // Row 1 — Groups: large cards, horizontal scroll (R7). All → live groups → Culls.
    const groupsRow = el('div', {
      className: 'animals-groups-filter-row',
      'data-testid': 'animals-groups-filter',
    });

    groupsRow.appendChild(el('div', {
      className: `groups-grid-tile animals-filter-tile-all${allSelected ? ' groups-grid-tile--selected active' : ''}`,
      'data-testid': 'animals-filter-all',
      onClick: () => {
        selectedGroupIds = new Set();
        cullsSelected = false;
        pruneChildFilters();
        renderAll();
      },
    }, [
      el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [t('animal.filter.all') || 'All']),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '4px' } }, [
        t('animal.filterAllHint') || 'All active animals',
      ]),
    ]));

    for (const g of groups) {
      groupsRow.appendChild(buildLiveGroupFilterCard(g));
    }

    if (cullCount > 0) {
      groupsRow.appendChild(el('div', {
        className: `groups-grid-tile animals-filter-tile-culls agc-chip-culls${cullsSelected ? ' groups-grid-tile--selected active' : ''}`,
        'data-testid': 'animals-chip-culls',
        onClick: () => {
          cullsSelected = !cullsSelected;
          if (cullsSelected) selectedGroupIds = new Set();
          pruneChildFilters();
          renderAll();
        },
      }, [
        el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [
          `${t('animal.cullsChip') || 'Culls'} (${cullCount})`,
        ]),
        el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '4px' } }, [
          t('animal.filterCullsHint') || 'Culled animals only',
        ]),
      ]));
    }
    filterWrap.appendChild(groupsRow);

    const groupPool = animalsAfterGroupsFilter();
    const speciesKeys = distinctSpeciesInPool(groupPool);
    const speciesPool = animalsAfterSpeciesFilter(groupPool);
    const classList = classesWithAnimalsInPool(speciesPool);
    const classPool = animalsAfterClassFilter(speciesPool);
    const showStatus = poolHasFemale(classPool);

    // Row 2 — Species chips (R4)
    const speciesChips = el('div', {
      className: 'agc-chips agc-chips-scroll',
      'data-testid': 'animals-species-chips',
    });
    const speciesAllOn = selectedSpecies.size === 0;
    speciesChips.appendChild(el('span', {
      className: `agc-chip${speciesAllOn ? ' active' : ''}`,
      'data-testid': 'animals-chip-species-all',
      onClick: () => {
        selectedSpecies = new Set();
        pruneChildFilters();
        renderAll();
      },
    }, [t('animal.filter.all') || 'All']));
    for (const sp of speciesKeys) {
      const isOn = selectedSpecies.has(sp);
      speciesChips.appendChild(el('span', {
        className: `agc-chip${isOn ? ' active' : ''}`,
        'data-testid': `animals-chip-species-${sp}`,
        onClick: () => {
          if (isOn) selectedSpecies.delete(sp);
          else selectedSpecies.add(sp);
          pruneChildFilters();
          renderAll();
        },
      }, [t(`animal.species.${sp}`) || sp]));
    }
    filterWrap.appendChild(speciesChips);

    // Row 3 — Class chips (R5; only classes with animals in Groups+Species pool)
    if (classList.length) {
      const classChips = el('div', {
        className: 'agc-chips agc-chips-scroll agc-chips-secondary',
        'data-testid': 'animals-class-chips',
      });
      for (const cls of classList) {
        const isOn = selectedClassIds.has(cls.id);
        classChips.appendChild(el('span', {
          className: `agc-chip${isOn ? ' active' : ''}`,
          'data-testid': `animals-chip-class-${cls.id}`,
          onClick: () => {
            if (isOn) selectedClassIds.delete(cls.id);
            else selectedClassIds.add(cls.id);
            pruneChildFilters();
            renderAll();
          },
        }, [cls.name]));
      }
      filterWrap.appendChild(classChips);
    }

    // Row 4 — Open / Confirmed bred (multi OR; R1 female gate; supersedes F1)
    if (showStatus) {
      const statusChips = el('div', {
        className: 'agc-chips agc-chips-scroll agc-chips-secondary',
        'data-testid': 'animals-status-chips',
      });
      const openOn = selectedStatuses.has('open');
      const bredOn = selectedStatuses.has('confirmed_bred');
      statusChips.appendChild(el('span', {
        className: `agc-chip${openOn ? ' active' : ''}`,
        'data-testid': 'animals-chip-status-open',
        onClick: () => {
          if (openOn) selectedStatuses.delete('open');
          else selectedStatuses.add('open');
          renderAll();
        },
      }, [t('animal.filterOpen') || 'Open']));
      statusChips.appendChild(el('span', {
        className: `agc-chip${bredOn ? ' active' : ''}`,
        'data-testid': 'animals-chip-status-confirmed-bred',
        onClick: () => {
          if (bredOn) selectedStatuses.delete('confirmed_bred');
          else selectedStatuses.add('confirmed_bred');
          renderAll();
        },
      }, [t('animal.filterConfirmedBred') || 'Confirmed bred']));
      filterWrap.appendChild(statusChips);
    }

    // Search + Reset + Clear search (R8)
    const searchInput = el('input', {
      type: 'search', placeholder: t('animal.searchPlaceholder') || 'Search by tag, EID, class…',
      value: searchQuery,
      'data-testid': 'animals-search-input',
      style: { width: '100%', padding: '9px 32px 9px 12px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', boxSizing: 'border-box' },
    });
    searchInput.addEventListener('input', () => { searchQuery = searchInput.value; renderAnimalList(); });
    filterWrap.appendChild(el('div', { style: { position: 'relative' } }, [searchInput]));

    filterWrap.appendChild(el('div', {
      className: 'animals-filter-actions',
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '7px', flexWrap: 'wrap' },
    }, [
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': 'animals-filter-reset',
          onClick: () => { resetFilterRows(); renderAll(); },
        }, [t('animal.filterReset') || 'Reset']),
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': 'animals-filter-clear-search',
          onClick: () => { searchQuery = ''; renderAll(); },
        }, [t('animal.filterClearSearch') || 'Clear search']),
      ]),
      el('button', {
        className: 'btn btn-green btn-xs', style: { whiteSpace: 'nowrap' },
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
        el('button', { className: 'btn btn-green btn-xs', onClick: (e) => { e.stopPropagation(); openGroupSheet(null, operationId); } }, ['+ Add group']),
      ].filter(Boolean)),
    ]);
    groupsCard.appendChild(header);

    // Active group cards live in the Groups filter row (animals-groups-filter).
    // Lower 2-column active grid removed — not duplicated here.


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

    const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);
    const classes = getAll('animalClasses');
    const groups = getAll('groups');
    const weightRecords = getAll('animalWeightRecords');

    // Cascade: groups → species → class → status → search.
    let filtered = animalsAfterGroupsFilter();
    filtered = animalsAfterSpeciesFilter(filtered);
    filtered = animalsAfterClassFilter(filtered);

    // Status multi-select OR. Inactive when none selected.
    if (selectedStatuses.size > 0) {
      filtered = filtered.filter(a => {
        const isBred = a.confirmedBred === true;
        if (selectedStatuses.has('confirmed_bred') && isBred) return true;
        if (selectedStatuses.has('open') && !isBred) return true;
        return false;
      });
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
      if (!w.animalId || latestWeightMap.has(w.animalId)) continue;
      const latest = latestWeightForAnimal(weightRecords, w.animalId);
      if (latest) latestWeightMap.set(w.animalId, latest);
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

      // Location badge — inherit the group's current placement (OI-0205)
      let locBadge = null;
      if (grp) {
        const animalPlacement = resolveGroupCurrentPlacement(grp.id);
        if (animalPlacement.placed && animalPlacement.displayName) {
          locBadge = el('span', { className: 'badge bt', style: { fontSize: '10px' } }, [animalPlacement.displayName]);
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
              animal.isBulk ? el('span', { style: { fontSize: '11px', color: 'var(--text2)', fontWeight: '400' } }, [` ${animalHeadCount(animal)} head`]) : null,
              locBadge ? [' ', locBadge] : null,
            ].flat().filter(Boolean)),
            el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [
              `${animal.isBulk ? 'Group composite \u00B7 ' : ''}${cls?.name || 'No class'} \u00B7 ${grp?.name || 'No group'}`,
            ]),
          ]),
          el('div', { style: { textAlign: 'right', flexShrink: '0' } }, [
            el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [weightDisplay]),
          ]),
        ]),
        // Quick-action buttons
        el('div', { style: { display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' } }, [
          el('button', { className: 'btn btn-outline btn-xs', onClick: () => openAnimalSheet(animal, operationId, farmId) }, ['Edit']),
          el('button', { className: 'btn btn-outline btn-xs', onClick: () => openWeightSheet(animal, operationId) }, ['\u2696 Weight']),
          animal.isBulk ? null : el('button', { className: 'btn btn-outline btn-xs', onClick: () => openTreatmentSheet(animal, operationId) }, ['\uD83D\uDC89 Treatment']),
          !animal.isBulk && animal.sex === 'female' ? el('button', { className: 'btn btn-outline btn-xs', onClick: () => openBreedingSheet(animal, operationId) }, ['\u2640 Breeding']) : null,
          animal.isBulk ? null : el('button', { className: 'btn btn-outline btn-xs', onClick: () => openBcsSheet(animal, operationId) }, ['\uD83D\uDCCA BCS']),
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

export function openGroupSheet(existingGroup, operationId) {
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
  const todayStr = getLocalTodayStr();

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
      const latestW = latestWeightForAnimal(weightRecords, a.id);
      const weightStr = latestW?.weightKg ? display(latestW.weightKg, 'weight', unitSys, 0) : '';
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

  // OI-0164: Edit-mode footer is Cancel · Save · Archive · Delete. Archive is
  // primary destructive (preserves event history); Delete is gated on the same
  // event_group_windows count check the archived-row Delete uses.
  const eventCount = isEdit ? groupEventHistoryCount(existingGroup.id) : 0;
  const deleteDisabled = eventCount > 0;

  const cancelBtn = el('button', {
    className: 'btn btn-outline',
    'data-testid': 'group-sheet-cancel',
    onClick: () => groupSheet.close(),
  }, ['Cancel']);

  const saveBtn = el('button', {
    className: 'btn btn-green',
    'data-testid': 'group-sheet-save',
    onClick: () => {
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
        const incomingIds = [...pickedAnimals].filter(id => !currentMems.some(m => m.animalId === id));
        const acceptedReductions = confirmCompositeReductions(groupId, incomingIds);
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
        applyCompositeReductions(acceptedReductions, operationId);
        for (const gid of affectedGroupIds) maybeSplitForGroup(gid, todayStr);
        // OI-0090: surface archive prompt for any group that just emptied out.
        for (const gid of affectedGroupIds) maybeShowEmptyGroupPrompt(gid);
        groupSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    },
  }, ['Save group']);

  const footerChildren = [cancelBtn, saveBtn];

  if (isEdit) {
    const archiveBtn = el('button', {
      className: 'btn btn-amber',
      'data-testid': 'group-sheet-archive',
      onClick: () => {
        archiveGroup(existingGroup.id);
        groupSheet.close();
        showToast(`Group ${existingGroup.name} archived`);
      },
    }, [t('group.archiveButton') || 'Archive']);

    const deleteBtn = el('button', {
      className: 'btn btn-outline',
      'data-testid': 'group-sheet-delete',
      style: {
        color: deleteDisabled ? 'var(--text2)' : 'var(--red)',
        borderColor: deleteDisabled ? 'var(--border)' : 'var(--red)',
        opacity: deleteDisabled ? '0.5' : '1',
        cursor: deleteDisabled ? 'not-allowed' : 'pointer',
      },
      title: deleteDisabled
        ? `This group is on ${eventCount} event(s). Archive instead to preserve history.`
        : '',
      onClick: () => {
        if (deleteDisabled) return;
        if (!confirm(`Delete group "${existingGroup.name}"?`)) return;
        remove('groups', existingGroup.id, 'groups');
        groupSheet.close();
      },
    }, ['Delete']);

    if (deleteDisabled) deleteBtn.setAttribute('disabled', '');

    footerChildren.push(archiveBtn, deleteBtn);
  }

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '12px' } }, footerChildren));

  groupSheet.open();
}

// ─── Split Group Sheet (6B) ─────────────────────────────────────────────

function openSplitGroupSheet(group, operationId) {
  const wrapId = 'split-sheet-wrap';
  if (!document.getElementById(wrapId)) {
    document.body.appendChild(el('div', { className: 'sheet-wrap', id: wrapId, style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => splitSheet?.close() }),
      el('div', { className: 'sheet-panel', id: 'split-sheet-panel', style: { maxHeight: 'min(92dvh, 92vh)', overflowY: 'auto' } }),
    ]));
  }
  let splitSheet = new Sheet(wrapId);
  const panel = document.getElementById('split-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const unitSys = getUnitSystem();
  const todayStr = getLocalTodayStr();
  const memberships = getAll('animalGroupMemberships').filter(m => m.groupId === group.id && !m.dateLeft);
  const allAnimals = getAll('animals');
  const classes = getAll('animalClasses');
  const weightRecords = getAll('animalWeightRecords');
  const groups = getAll('groups').filter(g => !g.archivedAt && g.id !== group.id);
  const colors = ['#639922', '#1D9E75', '#185FA5', '#BA7517', '#E24B4A', '#534AB7'];

  // Find location — OI-0205 shared current-placement resolver
  const splitPlacement = resolveGroupCurrentPlacement(group.id);
  const locName = splitPlacement.placed ? splitPlacement.displayName : '';

  const splitAnimals = new Set();
  /** @type {Map<string, number>} heads to peel when a composite is selected (default = full H) */
  const compositeHeads = new Map();
  let destType = 'new';
  let newGroupColor = colors[1];
  let newGroupName = '';
  let nameTouched = false;

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '2px' } }, ['Split group']));
  const splitHead = memberships.reduce((sum, m) => sum + animalHeadCount(allAnimals.find(a => a.id === m.animalId)), 0);
  panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' } }, [`${group.name} \u00B7 ${splitHead} head${locName ? ` \u00B7 at ${locName}` : ''}`]));

  // Date/time — date required (S4); default today
  const dateInput = el('input', { type: 'date', value: todayStr, required: 'true', 'data-testid': 'split-date' });
  const timeInput = el('input', { type: 'time', 'data-testid': 'split-time' });
  panel.appendChild(el('div', { className: 'two', style: { marginBottom: '12px' } }, [
    el('div', { className: 'field' }, [el('label', {}, ['Split date']), dateInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Time ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeInput]),
  ]));

  // Optional notes (S4 — no cull reason)
  const notesInput = el('textarea', {
    rows: '2',
    placeholder: t('animal.splitNotesPlaceholder'),
    'data-testid': 'split-notes',
    style: { width: '100%', marginBottom: '12px' },
  });
  panel.appendChild(el('div', { className: 'field', style: { marginBottom: '12px' } }, [
    el('label', {}, [t('animal.splitNotes'), ' ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, [t('animal.splitNotesOptional')])]),
    notesInput,
  ]));

  // Animal picker
  panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '6px' } }, ['Animals to split off']));
  panel.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginBottom: '8px' } }, [
    t('animal.splitPickerHint'),
  ]));

  const pickerEl = el('div', { style: { maxHeight: '220px', overflowY: 'auto', marginBottom: '12px' }, 'data-testid': 'split-animal-picker' });
  const previewEl = el('div');

  function headsForSelection(animal) {
    if (!animal) return 0;
    if (animal.isBulk) {
      const H = animalHeadCount(animal);
      if (compositeHeads.has(animal.id)) return compositeHeads.get(animal.id);
      return H;
    }
    return 1;
  }

  function maybeSuggestDestName() {
    if (nameTouched || destType !== 'new') return;
    const suggested = suggestSplitGroupName(group.name);
    if (!newNameInput.value.trim() || newNameInput.value === newGroupName) {
      newNameInput.value = suggested;
      newGroupName = suggested;
      renderPreview();
    }
  }

  function renderSplitPicker() {
    clear(pickerEl);
    for (const m of memberships) {
      const a = allAnimals.find(x => x.id === m.animalId);
      if (!a) continue;
      const isPicked = splitAnimals.has(a.id);
      const cls = a.classId ? classes.find(c => c.id === a.classId) : null;
      const latestW = latestWeightForAnimal(weightRecords, a.id);
      const wStr = latestW?.weightKg ? display(latestW.weightKg, 'weight', unitSys, 0) : '';
      const H = animalHeadCount(a);

      const rowKids = [
        el('div', { style: { width: '16px', height: '16px', borderRadius: '50%', border: `1.5px solid ${isPicked ? 'var(--green)' : 'var(--border2)'}`, background: isPicked ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0' } },
          isPicked ? [el('svg', { width: '10', height: '10', viewBox: '0 0 12 12', fill: 'none' }, [el('polyline', { points: '2,6 5,9 10,3', stroke: 'white', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })])] : []),
        el('div', { style: { flex: '1', fontSize: '13px' } }, [
          el('strong', {}, [a.isBulk ? `${a.name || 'Composite'} (${H} head)` : (a.tagNum || a.name || `A-${a.id.slice(0, 5)}`)]),
          ' ',
          el('span', { style: { color: 'var(--text2)', fontSize: '11px' } }, [[a.sex, cls?.name, wStr].filter(Boolean).join(' \u00B7 ')]),
        ]),
      ];

      pickerEl.appendChild(el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: isPicked ? 'var(--green-l)' : 'var(--bg2)', borderRadius: 'var(--radius)', marginBottom: '4px', cursor: 'pointer', border: `0.5px solid ${isPicked ? 'var(--green-l2)' : 'var(--border)'}` },
        'data-testid': `split-pick-${a.id}`,
        onClick: () => {
          if (isPicked) {
            splitAnimals.delete(a.id);
            compositeHeads.delete(a.id);
          } else {
            splitAnimals.add(a.id);
            if (a.isBulk) compositeHeads.set(a.id, H);
            maybeSuggestDestName();
          }
          renderSplitPicker();
          renderPreview();
        },
      }, rowKids));

      // Heads-to-split control for selected composites (S2)
      if (isPicked && a.isBulk) {
        const headsVal = compositeHeads.has(a.id) ? compositeHeads.get(a.id) : H;
        const headsInput = el('input', {
          type: 'number',
          min: '1',
          max: String(H),
          step: '1',
          value: String(headsVal),
          'data-testid': `split-heads-${a.id}`,
          style: { width: '72px' },
        });
        headsInput.addEventListener('click', (e) => e.stopPropagation());
        headsInput.addEventListener('input', (e) => {
          e.stopPropagation();
          const raw = headsInput.value;
          const n = Number(raw);
          if (Number.isInteger(n) && n >= 1 && n <= H) {
            compositeHeads.set(a.id, n);
            renderPreview();
          }
        });
        pickerEl.appendChild(el('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px 10px 32px', marginBottom: '4px' },
          'data-testid': `split-heads-row-${a.id}`,
          onClick: (e) => e.stopPropagation(),
        }, [
          el('label', { style: { fontSize: '12px', color: 'var(--text2)' } }, [t('animal.splitHeads')]),
          headsInput,
          el('span', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('animal.splitHeadsHint', { max: H })]),
        ]));
      }
    }
  }

  function renderPreview() {
    clear(previewEl);
    if (!splitAnimals.size) return;
    let splitHeadCount = 0;
    let remaining = memberships.reduce((sum, m) => sum + animalHeadCount(allAnimals.find(a => a.id === m.animalId)), 0);
    for (const id of splitAnimals) {
      const a = allAnimals.find(x => x.id === id);
      const n = headsForSelection(a);
      splitHeadCount += n;
      // For partial composite peel, remaining keeps (H−N) on source rather than removing whole H
      if (a?.isBulk) {
        const H = animalHeadCount(a);
        remaining -= n; // peel N off the total
        void H;
      } else {
        remaining -= 1;
      }
    }
    previewEl.appendChild(el('div', { className: 'card-inset', style: { marginTop: '12px' }, 'data-testid': 'split-preview' }, [
      el('div', { style: { fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--text2)' } }, ['After split']),
      el('div', { style: { padding: '8px 10px', background: 'var(--bg2)', borderRadius: 'var(--radius)', borderLeft: `3px solid ${group.color || '#639922'}` } }, [
        el('div', { style: { fontSize: '12px', fontWeight: '600' } }, [`${group.name} (remaining)`]),
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${remaining} head`]),
      ]),
      el('div', { style: { textAlign: 'center', fontSize: '18px', padding: '4px 0', color: 'var(--text2)' } }, ['\u2193']),
      el('div', { style: { padding: '8px 10px', background: 'var(--bg2)', borderRadius: 'var(--radius)', borderLeft: `3px solid ${newGroupColor}` } }, [
        el('div', { style: { fontSize: '12px', fontWeight: '600' } }, [destType === 'new' ? (newGroupName || 'New group') : 'Existing group']),
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${splitHeadCount} head`]),
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
      const radio = el('input', { type: 'radio', name: 'split-dest', value: val, style: { accentColor: 'var(--green)' }, 'data-testid': `split-dest-${val}` });
      if (val === destType) radio.checked = true;
      radio.addEventListener('change', () => {
        destType = val;
        newFields.style.display = val === 'new' ? 'block' : 'none';
        existingFields.style.display = val === 'existing' ? 'block' : 'none';
        if (val === 'new') maybeSuggestDestName();
        renderPreview();
      });
      destRadios.appendChild(el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer' } }, [radio, el('span', { style: { fontSize: '13px' } }, [label])]));
    }
  }
  renderDestRadios();
  panel.appendChild(destRadios);

  // New group fields
  const newNameInput = el('input', { type: 'text', placeholder: 'e.g. Dry cows, Yearlings…', 'data-testid': 'split-new-group-name' });
  newNameInput.addEventListener('input', () => {
    nameTouched = true;
    newGroupName = newNameInput.value;
    renderPreview();
  });
  const newColorPicker = el('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' }, 'data-testid': 'split-new-group-color' });
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

  const placementSelect = el('select', { 'data-testid': 'split-placement' }, [
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
  const existGroupSelect = el('select', { 'data-testid': 'split-existing-group' }, [
    el('option', { value: '' }, ['\u2014 select group \u2014']),
    ...groups.map(g => el('option', { value: g.id }, [g.name])),
  ]);
  existingFields.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Move into group']), existGroupSelect]));
  panel.appendChild(existingFields);

  panel.appendChild(previewEl);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'split-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '16px' } }, [
    el('button', { className: 'btn btn-green', 'data-testid': 'split-confirm', onClick: () => {
      clear(statusEl);
      if (!splitAnimals.size) { statusEl.appendChild(el('span', {}, ['Select at least one animal'])); return; }
      const date = dateInput.value;
      if (!date) { statusEl.appendChild(el('span', {}, [t('animal.splitDateRequired')])); return; }
      const notes = notesInput.value || '';
      try {
        let targetGroupId;
        let createdGroupId = null;
        if (destType === 'new') {
          const name = newNameInput.value.trim();
          if (!name) { statusEl.appendChild(el('span', {}, ['Enter a group name'])); return; }
          const newGroup = GroupEntity.create({ operationId, name, color: newGroupColor });
          add('groups', newGroup, GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
          targetGroupId = newGroup.id;
          createdGroupId = newGroup.id;
          // Placement UI (same / unplaced) matches today's Split Group control surface (S1).
          // Same-location window attach remains via Move / place flows when unplaced;
          // pre-existing as-built did not open dest windows here.
          void placementSelect.value;
        } else {
          targetGroupId = existGroupSelect.value;
          if (!targetGroupId) { statusEl.appendChild(el('span', {}, ['Select a group'])); return; }
        }

        const headSplits = [];
        const wholeMoveIds = [];
        for (const animalId of splitAnimals) {
          const a = allAnimals.find(x => x.id === animalId);
          if (!a) continue;
          if (a.isBulk) {
            const H = animalHeadCount(a);
            const rawHeads = compositeHeads.has(animalId) ? compositeHeads.get(animalId) : H;
            const validated = validateHeadsToSplit(rawHeads, H);
            if (!validated.ok) { statusEl.appendChild(el('span', {}, [validated.error])); return; }
            if (validated.heads < H) {
              headSplits.push({ animal: a, heads: validated.heads });
            } else {
              wholeMoveIds.push(animalId);
            }
          } else {
            wholeMoveIds.push(animalId);
          }
        }

        clearSplitUndo();
        const undoOps = [];
        // Defer window splits to one pass at the end so we never double-split.
        for (const { animal, heads } of headSplits) {
          // S3: do not confirmCompositeReductions when creating a brand-new split-off lot.
          const result = confirmCompositeHeadSplit({
            sourceAnimal: animal,
            sourceGroupId: group.id,
            targetGroupId,
            headsToSplit: heads,
            splitDate: date,
            notes,
            operationId,
            createdGroupId,
            runWindowSplits: false,
          });
          undoOps.push(result.undo);
        }

        if (wholeMoveIds.length) {
          // Individuals (and N = H composites) may reduce a dest composite; head-splits never do (S3).
          const acceptedReductions = destType === 'new'
            ? []
            : confirmCompositeReductions(targetGroupId, wholeMoveIds);
          const allMems = getAll('animalGroupMemberships');
          for (const animalId of wholeMoveIds) {
            const a = allAnimals.find(x => x.id === animalId);
            if (a?.isBulk) {
              const result = confirmCompositeHeadSplit({
                sourceAnimal: a,
                sourceGroupId: group.id,
                targetGroupId,
                headsToSplit: animalHeadCount(a),
                splitDate: date,
                notes,
                operationId,
                createdGroupId,
                runWindowSplits: false,
              });
              undoOps.push(result.undo);
            } else {
              const oldMem = allMems.find(m => m.animalId === animalId && m.groupId === group.id && !m.dateLeft);
              if (oldMem) update('animalGroupMemberships', oldMem.id, { dateLeft: date, reason: 'split' }, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
              const newMem = MembershipEntity.create({ operationId, animalId, groupId: targetGroupId, dateJoined: date, reason: 'split' });
              add('animalGroupMemberships', newMem, MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
            }
          }
          applyCompositeReductions(acceptedReductions, operationId);
        }

        // OI-0137: changeDate must be today (never backdated membership date).
        const splitResults = splitWindowsForGroups([group.id, targetGroupId]);
        if (undoOps.length === 1) {
          undoOps[0].windowSplits = splitResults.map(s => ({
            closedId: s.closedId,
            newId: s.newId,
            closedSnapshot: s.closedSnapshot,
          }));
        } else if (undoOps.length > 1) {
          // Bundle multi-op undo under the last snapshot + prior ops list.
          const bundle = {
            kind: 'bundled-composite-split',
            ops: undoOps.map(u => ({ ...u, windowSplits: [] })),
            windowSplits: splitResults.map(s => ({
              closedId: s.closedId,
              newId: s.newId,
              closedSnapshot: s.closedSnapshot,
            })),
            createdGroupId,
          };
          // Store via last undo by replaying through undoCompositeSplit support:
          // prefer single-op; for bundle, reverse ops then windows in undo helper.
          // Attach by clearing and setting via a synthetic call path:
          clearSplitUndo();
          // Monkey-patch: store bundle as last by undoing through a thin wrapper.
          // Simpler: only offer undo when exactly one composite op (common case).
          // Multi-select mixes keep writes; undo toast only for single composite op.
          void bundle;
        }

        // OI-0090: source may be empty after whole-move / N = H; prompt archive.
        maybeShowEmptyGroupPrompt(group.id);

        const didCompositeOp = headSplits.length > 0 || wholeMoveIds.some(id => {
          const a = allAnimals.find(x => x.id === id);
          return a?.isBulk;
        });
        splitSheet.close();
        if (didCompositeOp && undoOps.length === 1) {
          const snap = undoOps[0];
          showSplitUndoToast(t('animal.splitDoneToast'), () => {
            undoCompositeSplit(snap);
            showToast(t('animal.splitUndoDone'), 'split-toast');
          });
        } else if (didCompositeOp && undoOps.length > 1) {
          // Reverse in reverse order, then windows once.
          const snaps = undoOps.slice();
          const windows = splitResults;
          showSplitUndoToast(t('animal.splitDoneToast'), () => {
            for (let i = snaps.length - 1; i >= 0; i--) {
              const s = { ...snaps[i], windowSplits: [] };
              undoCompositeSplit(s);
            }
            // Reverse windows manually via a partial-shaped snapshot
            undoCompositeSplit({
              kind: 'partial-composite-split',
              sourceAnimalId: null,
              windowSplits: windows.map(s => ({
                closedId: s.closedId,
                newId: s.newId,
                closedSnapshot: s.closedSnapshot,
              })),
            });
            showToast(t('animal.splitUndoDone'), 'split-toast');
          });
        }
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Confirm split']),
    el('button', { className: 'btn btn-outline', 'data-testid': 'split-cancel', onClick: () => splitSheet.close() }, ['Cancel']),
  ]));

  splitSheet.open();
}

// ─── Classes Manager Sheet ──────────────────────────────────────────────

function ensureClassesSheetDOM() {
  if (document.getElementById('manage-classes-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'manage-classes-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => classSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'manage-classes-panel', style: { maxHeight: 'min(90dvh, 90vh)', overflowY: 'auto' } }),
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
      el('div', { className: 'sheet-panel', id: 'manage-treatments-panel', style: { maxHeight: 'min(90dvh, 90vh)', overflowY: 'auto' } }),
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
          tt.categoryId ? el('span', { className: 'badge bb', style: { fontSize: '10px', marginLeft: '6px' } }, [getById('treatmentCategories', tt.categoryId)?.name || '—']) : null,
        ].filter(Boolean)),
        el('button', { style: { border: 'none', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: '16px', padding: '0 2px' }, onClick: () => { remove('treatmentTypes', tt.id, 'treatment_types'); renderTypesList(); } }, ['\u00D7']),
      ]));
    }
  }
  renderTypesList();
  panel.appendChild(typesList);

  panel.appendChild(el('div', { className: 'div' }));
  panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '8px' } }, ['Add treatment type']));

  const ttNameInput = el('input', { 'data-testid': 'treatment-manager-name', type: 'text', placeholder: 'e.g. Vaccinate \u2014 BVD', style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });
  const ttCatSelect = el('select', { 'data-testid': 'treatment-manager-category', style: { height: '100%', padding: '9px 8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', width: '100%' } }, [
    el('option', { value: '' }, [t('health.typeCategory')]),
    ...getAll('treatmentCategories').filter(category => !category.archived && category.operationId === operationId).map(category => el('option', { value: category.id }, [category.name])),
  ]);
  panel.appendChild(el('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } }, [
    el('div', { className: 'field', style: { flex: '2', margin: '0' } }, [ttNameInput]),
    el('div', { className: 'field', style: { flex: '1', margin: '0' } }, [ttCatSelect]),
  ]));

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'treatment-manager-status' });
  panel.appendChild(statusEl);
  panel.appendChild(el('button', { className: 'btn btn-green btn-sm', style: { padding: '10px 16px' }, onClick: () => {
    clear(statusEl);
    try {
      const categoryId = requireTreatmentCategory(ttCatSelect.value, operationId);
      const rec = TreatmentTypeEntity.create({ operationId, name: ttNameInput.value.trim(), categoryId });
      add('treatmentTypes', rec, TreatmentTypeEntity.validate, TreatmentTypeEntity.toSupabaseShape, 'treatment_types');
      ttNameInput.value = '';
      renderTypesList();
    } catch (error) { statusEl.textContent = error.message; }
  } }, ['Add']));

  treatSheet.open();
}

// ─── AI Sires Manager Sheet ────────────────────────────────────────────

function openAISiresManager(operationId) {
  const wrapId = 'manage-ai-bulls-wrap';
  if (!document.getElementById(wrapId)) {
    document.body.appendChild(el('div', { className: 'sheet-wrap', id: wrapId, style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => siresSheet?.close() }),
      el('div', { className: 'sheet-panel', id: 'manage-ai-bulls-panel', style: { maxHeight: 'min(90dvh, 90vh)', overflowY: 'auto' } }),
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
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' } }, [t('manualEntry.sireReferenceHint')]));

  const bullsList = el('div', { style: { marginBottom: '12px' } });
  function renderBullsList() {
    clear(bullsList);
    const bulls = getAll('aiBulls');
    for (const b of bulls) {
      bullsList.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '0.5px solid var(--border)' } }, [
        el('div', {}, [
          el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [
            b.name, b.regNum ? el('span', { style: { fontSize: '11px', color: 'var(--text2)', marginLeft: '6px' } }, [b.regNum]) : null,
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

  const sireStatus = el('div', { className: 'auth-error', 'data-testid': 'ai-manager-status' });
  panel.appendChild(sireStatus);
  const sInputs = {};
  sInputs.name = el('input', { 'data-testid': 'ai-manager-name', type: 'text', placeholder: 'e.g. Connealy Confidence' });
  sInputs.reg = el('input', { 'data-testid': 'ai-manager-reg', type: 'text', placeholder: 'e.g. 17760326' });
  sInputs.breed = el('input', { 'data-testid': 'ai-manager-breed', type: 'text', placeholder: 'e.g. Angus' });
  sInputs.epds = el('input', { 'data-testid': 'ai-manager-epds', type: 'text', placeholder: 'e.g. CE+8 BW-1.2 WW+68' });

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
    clear(sireStatus);
    try {
      const rec = AiBullEntity.create({ operationId, name, regNum: sInputs.reg.value.trim() || null, breed: sInputs.breed.value.trim() || null, epds: sInputs.epds.value.trim() || null });
      add('aiBulls', rec, AiBullEntity.validate, AiBullEntity.toSupabaseShape, 'ai_bulls');
    } catch (error) { sireStatus.textContent = error.message; return; }
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
  const groupAnimals = animals.filter(a => memberships.some(m => m.animalId === a.id) && a.active !== false);

  const todayStr = getLocalTodayStr();
  const dateInput = el('input', { type: 'date', value: todayStr });

  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '600' } }, ['Update group weights']),
  ]));
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '4px' } }, [`${group.name} \u00B7 ${groupAnimals.length} animals`]));
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Weigh date']), dateInput]));
  panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' } }, [t('manualEntry.groupWeightsHint')]));

  const weightInputs = [];
  for (const a of groupAnimals) {
    const latestW = latestWeightForAnimal(weightRecords, a.id);
    const heads = a.isBulk ? animalHeadCount(a) : 1;
    const perHeadKg = latestW?.weightKg > 0 && heads > 0 ? latestW.weightKg / heads : null;
    const currentDisplay = perHeadKg ? display(perHeadKg, 'weight', unitSys, 0) : '—';
    const cls = a.classId ? getAll('animalClasses').find(c => c.id === a.classId) : null;
    const newWtInput = el('input', { type: 'number', 'data-testid': `group-weight-${a.id}`, placeholder: t('manualEntry.groupWeightPlaceholder'), step: 'any', style: { width: '90px', padding: '7px 8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', textAlign: 'right' } });
    weightInputs.push({ animalId: a.id, heads, input: newWtInput });

    panel.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '0.5px solid var(--border)' } }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [a.tagNum || a.name || `A-${a.id.slice(0, 5)}`]),
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${a.sex} \u00B7 ${cls?.name || ''}${a.isBulk ? ` · ${t('manualEntry.groupWeightComposite', { heads })}` : ''}`]),
      ]),
      el('div', { style: { textAlign: 'right', fontSize: '12px', color: 'var(--text2)', marginRight: '4px' } }, [`Current: ${currentDisplay} ${unitLabel('weight', unitSys)}`]),
      newWtInput,
    ]));
  }

  const status = el('div', { className: 'auth-error' }); panel.appendChild(status);
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '8px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      status.textContent = '';
      try {
        const recordedAt = localFormTimestamp(dateInput.value, '12:00');
        const records = weightInputs.filter(wi => wi.input.value.trim() !== '').map(wi => {
          let perHeadKg = optionalFormNumber(wi.input.value);
          if (!(perHeadKg > 0)) throw new Error(t('validation.weightRequired'));
          if (!(wi.heads > 0)) throw new Error(t('animal.bulkHeadCountRequired'));
          if (unitSys === 'imperial') perHeadKg = convert(perHeadKg, 'weight', 'toMetric');
          const record = WeightRecordEntity.create({ operationId, animalId: wi.animalId, weightKg: perHeadKg * wi.heads, recordedAt, source: 'group_update' });
          const result = WeightRecordEntity.validate(record);
          if (!result.valid) throw new Error(result.errors.join('; '));
          return record;
        });
        if (records.length) runDurableWrite(JSON.stringify([operationId, 'group-weights', crypto.randomUUID(), 1]), () => {
          for (const record of records) add('animalWeightRecords', record, WeightRecordEntity.validate, WeightRecordEntity.toSupabaseShape, 'animal_weight_records');
          // Split only after the complete list passes, at today's effective window boundary.
          maybeSplitForGroup(group.id, getLocalTodayStr());
          return records[0].id;
        });
        wtSheet.close();
      } catch (error) { status.textContent = error.message; }
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
    el('div', { className: 'sheet-panel', id: 'ae-sheet-panel', style: { maxHeight: 'min(92dvh, 92vh)', overflowY: 'auto' } }),
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
  const kind = { value: existingAnimal?.isBulk ? 'composite' : 'individual' };

  const kindBar = el('div', {
    'data-testid': 'animal-kind-bar',
    style: { display: 'flex', gap: '6px', margin: '8px 0 12px' },
  });
  const kindButtons = {};
  let syncKind = () => {};
  if (!isEdit) {
    for (const opt of [
      { key: 'individual', label: t('animal.kindIndividual') },
      { key: 'composite', label: t('animal.kindComposite') },
    ]) {
      const btn = el('button', {
        type: 'button',
        className: kind.value === opt.key ? 'btn btn-teal btn-xs' : 'btn btn-outline btn-xs',
        'data-testid': `animal-kind-${opt.key}`,
        onClick: () => {
          kind.value = opt.key;
          syncKind();
        },
      }, [opt.label]);
      kindButtons[opt.key] = btn;
      kindBar.appendChild(btn);
    }
    panel.appendChild(kindBar);
  } else if (existingAnimal.isBulk) {
    panel.appendChild(el('div', {
      'data-testid': 'animal-kind-composite-label',
      style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' },
    }, [t('animal.kindComposite')]));
  }

  // Tag + EID — individuals only. Composites are identified by name.
  inputs.tagNum = el('input', { type: 'text', placeholder: 'T-001', value: existingAnimal?.tagNum || '' });
  inputs.eid = el('input', { type: 'text', placeholder: '840-…', value: existingAnimal?.eid || '' });
  const tagRow = el('div', { className: 'two', 'data-testid': 'animal-tag-row' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Ear tag #']), inputs.tagNum]),
    el('div', { className: 'field' }, [el('label', {}, ['EID #']), inputs.eid]),
  ]);
  panel.appendChild(tagRow);

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

  inputs.compositeName = el('input', {
    type: 'text',
    placeholder: 'Ewe lot, flock…',
    value: existingAnimal?.name || '',
    'data-testid': 'animal-composite-name',
  });
  inputs.bulkHeadCount = el('input', {
    type: 'number',
    min: '1',
    step: '1',
    value: existingAnimal?.isBulk ? String(existingAnimal.bulkHeadCount ?? '') : '',
    'data-testid': 'animal-composite-head-count',
  });
  inputs.totalWeight = el('input', {
    type: 'number',
    min: '0',
    step: '0.1',
    placeholder: unitLabel('weight', unitSys),
    'data-testid': 'animal-composite-per-head-weight',
  });
  const lotTotalEl = el('div', {
    'data-testid': 'animal-composite-lot-total',
    style: { fontSize: '15px', fontWeight: '500' },
  }, ['\u2014']);
  const compositeBlock = el('div', { 'data-testid': 'animal-composite-fields' }, [
    el('div', { className: 'field' }, [el('label', {}, [t('animal.compositeName')]), inputs.compositeName]),
    el('div', { className: 'two' }, [
      el('div', { className: 'field' }, [el('label', {}, [t('animal.bulkHeadCount')]), inputs.bulkHeadCount]),
      el('div', { className: 'field' }, [el('label', {}, [t('animal.weightPerHead')]), inputs.totalWeight]),
    ]),
    el('div', { className: 'field' }, [
      el('label', {}, [t('animal.totalWeight')]),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, [
        lotTotalEl,
        isEdit ? el('button', {
          type: 'button',
          className: 'btn btn-outline btn-sm',
          'data-testid': 'edit-animal-weight-btn',
          onClick: () => {
            animalSheet.close();
            openWeightSheet(existingAnimal, operationId);
          },
        }, ['\u2696 Weight']) : null,
      ].filter(Boolean)),
    ]),
  ]);
  panel.appendChild(compositeBlock);

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
  const latestW = isEdit ? latestWeightForAnimal(weightRecords, existingAnimal.id) : null;
  if (existingAnimal?.isBulk && latestW?.weightKg > 0 && animalHeadCount(existingAnimal) > 0) {
    const perKg = latestW.weightKg / animalHeadCount(existingAnimal);
    const shown = unitSys === 'imperial' ? convert(perKg, 'weight', 'toImperial') : perKg;
    inputs.totalWeight.value = String(Math.round(shown * 1000) / 1000);
  }
  function refreshCompositeLotTotal() {
    clear(lotTotalEl);
    const heads = Number(inputs.bulkHeadCount.value);
    const perHead = parseFloat(inputs.totalWeight.value);
    if (!(heads > 0) || !(perHead > 0)) {
      lotTotalEl.appendChild(el('span', {}, ['\u2014']));
      return;
    }
    const perKg = unitSys === 'imperial' ? convert(perHead, 'weight', 'toMetric') : perHead;
    lotTotalEl.appendChild(el('span', {}, [display(perKg * heads, 'weight', unitSys, 0)]));
  }
  inputs.bulkHeadCount.addEventListener('input', refreshCompositeLotTotal);
  inputs.totalWeight.addEventListener('input', refreshCompositeLotTotal);
  refreshCompositeLotTotal();
  const currentWeightText = latestW?.weightKg
    ? display(latestW.weightKg, 'weight', unitSys, 0)
    : '\u2014';
  const weightRow = el('div', { className: 'field', style: { display: existingAnimal?.isBulk ? 'none' : '' } }, [
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
  const females = allAnimals.filter(a => a.sex === 'female' && a.isBulk !== true);
  inputs.damId = el('select', { 'data-testid': 'edit-animal-dam-select' }, [
    el('option', { value: '' }, ['\u2014 unknown \u2014']),
    ...females.map(a => el('option', { value: a.id, selected: existingAnimal?.damId === a.id }, [a.tagNum || a.name || `A-${a.id.slice(0, 5)}`])),
  ]);
  // OI-0132 / SP-14: Birth date shares a row with Dam; hint toggles
  // "optional" (grey) <-> "required" (red) based on Dam selection so the
  // OI-0132 hard-gate rule is visible at form-fill time.
  inputs.birthDate = el('input', {
    type: 'date', value: existingAnimal?.birthDate || '',
    'data-testid': 'edit-animal-birth-date',
  });
  const birthDateHint = el('span', {
    style: { fontSize: '10px', color: 'var(--text2)' },
    'data-testid': 'edit-animal-birth-date-hint',
  }, ['optional']);
  const birthDateLabel = el('label', {}, ['Birth date ', birthDateHint]);
  const updateBirthDateHint = () => {
    if (inputs.damId.value) {
      birthDateHint.textContent = 'required';
      birthDateHint.style.color = 'var(--red, #d33)';
    } else {
      birthDateHint.textContent = 'optional';
      birthDateHint.style.color = 'var(--text2)';
    }
  };
  inputs.damId.addEventListener('change', updateBirthDateHint);
  updateBirthDateHint();
  const damRow = el('div', {
    'data-testid': 'animal-dam-row',
    style: { display: 'flex', gap: '12px', alignItems: 'flex-start' },
  }, [
    el('div', { className: 'field', style: { flex: '1 1 60%' } }, [
      el('label', {}, ['Dam ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['mother'])]),
      inputs.damId,
    ]),
    el('div', { className: 'field', style: { flex: '1 1 40%' } }, [
      birthDateLabel,
      inputs.birthDate,
    ]),
  ]);
  panel.appendChild(damRow);

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
  const males = allAnimals.filter(a => a.sex === 'male' && a.active !== false && a.isBulk !== true);
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

  const sireRow = el('div', { className: 'field', 'data-testid': 'sire-picker' }, [
    el('label', {}, ['Sire']),
    sireModeBar,
    sireListContainer,
    sireSummary,
  ]);
  panel.appendChild(sireRow);

  // Notes
  inputs.notes = el('input', { type: 'text', value: existingAnimal?.notes || '' });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Notes']), inputs.notes]));

  // OI-0132 / SP-14: Birth date now lives in the Dam+Birth-date shared row
  // above. `inputs.birthDate` was created there; `inputs.name` is still stubbed
  // here because the Name field was dropped in a prior UI pass.
  inputs.name = { value: existingAnimal?.name || '' };

  // ── Weaning toggle (v1 gap fix) ──
  // OI-0099 Class A: wired into saveAnimal. Plus weanedDate field (locked behavior):
  //   off → weaned=false, weanedDate=null, date field disabled
  //   off → on flip → weaned=true, weanedDate defaults to today, date field enabled + editable
  //   farmer edits date while on → weanedDate takes the edited value (back-date support)
  //   on → off flip → weaned=false, weanedDate=null, date field disabled again
  if (isEdit && !existingAnimal.isBulk) {
    panel.appendChild(el('div', { className: 'div' }));
    const weanedCheck = el('input', { type: 'checkbox', style: { width: '18px', height: '18px', accentColor: 'var(--teal)', flexShrink: '0' } });
    if (existingAnimal.weaned) weanedCheck.checked = true;
    const todayStr = getLocalTodayStr();
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
        for (const hr of heatRecords.sort((a, b) => (b.observedAt || '').localeCompare(a.observedAt || '')).slice(0, 5)) {
          panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', padding: '4px 0', borderBottom: '0.5px solid var(--border)' } }, [
            `${hr.observedAt?.slice(0, 10) || '?'}${hr.notes ? ' \u00B7 ' + hr.notes : ''}`,
          ]));
        }
      } else {
        panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, ['No heat records']));
      }
    }

    // ── Weight history ──
    panel.appendChild(el('div', { className: 'div' }));
    panel.appendChild(el('div', { className: 'sec', style: { marginBottom: '6px' } }, ['Weight history']));
    const animalWeights = weightRecords.filter(w => w.animalId === existingAnimal.id).sort((a, b) => (b.recordedAt || b.date || '').localeCompare(a.recordedAt || a.date || ''));
    if (animalWeights.length) {
      const wHistEl = el('div', { style: { fontSize: '12px', color: 'var(--text2)', maxHeight: '120px', overflowY: 'auto' } });
      for (const w of animalWeights) {
        const when = (w.recordedAt || w.date || '').slice(0, 10) || '?';
        wHistEl.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '0.5px solid var(--border)' } }, [
          el('span', {}, [when]),
          el('span', { style: { fontWeight: '500' } }, [`${display(w.weightKg, 'weight', unitSys, 0)}${w.notes ? ' \u00B7 ' + w.notes : ''}`]),
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

  }

  // ── Cull section (individuals and composites) ──
  if (isEdit) {
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

  inputs.kind = kind;
  syncKind = () => {
    const composite = kind.value === 'composite';
    tagRow.style.display = composite ? 'none' : '';
    compositeBlock.style.display = composite ? '' : 'none';
    damRow.style.display = composite ? 'none' : 'flex';
    sireRow.style.display = composite ? 'none' : '';
    for (const [key, btn] of Object.entries(kindButtons)) {
      btn.className = kind.value === key ? 'btn btn-teal btn-xs' : 'btn btn-outline btn-xs';
    }
  };
  syncKind();

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

async function saveAnimal(existingAnimal, sexState, inputs, operationId, farmId, previousGroupId, statusEl) {
  clear(statusEl);
  const isComposite = existingAnimal ? existingAnimal.isBulk === true : inputs.kind?.value === 'composite';
  let bulkHeadCount = null;
  if (isComposite) {
    const parsed = Number(inputs.bulkHeadCount?.value);
    if (!Number.isInteger(parsed) || parsed < (existingAnimal ? 0 : 1)) {
      statusEl.appendChild(el('span', {}, [t('animal.bulkHeadCountRequired')]));
      return;
    }
    bulkHeadCount = parsed;
  }
  const data = {
    operationId,
    tagNum: isComposite ? null : (inputs.tagNum.value.trim() || null),
    name: isComposite
      ? (inputs.compositeName?.value?.trim() || null)
      : (inputs.name?.value?.trim?.() || inputs.tagNum.value.trim() || null),
    eid: isComposite ? null : (inputs.eid.value.trim() || null),
    sex: sexState.value,
    classId: inputs.classId.value || null,
    isBulk: isComposite,
    bulkHeadCount,
    birthDate: isComposite ? null : (inputs.birthDate.value || null),
    notes: inputs.notes.value.trim() || null,
    // OI-0099 Class A: damId + weaned + weanedDate.
    damId: isComposite ? null : (inputs.damId?.value || null),
    weaned: inputs.weaned ? inputs.weaned.checked : null,
    weanedDate: inputs.weaned && inputs.weaned.checked
      ? (inputs.weanedDate?.value || null)
      : null,
    // OI-0099 Class B sire picker: mutual exclusivity via shim getters on inputs.
    sireAnimalId: isComposite ? null : (inputs.sireAnimalId?.value || null),
    sireAiBullId: isComposite ? null : (inputs.sireAiBullId?.value || null),
    // OI-0099 Class B confirmedBred: new column migration 026.
    confirmedBred: inputs.confirmedBred ? inputs.confirmedBred.checked : false,
  };

  // OI-0132 Class A hard gate: damId set without birthDate is an inline error.
  // Catches both "set dam on calf with no birthDate" and "clear birthDate on
  // calf with damId" — either leaves a calving record we can't stamp a
  // calved_at on.
  if (data.damId && !data.birthDate) {
    statusEl.appendChild(el('span', {}, [t('animal.birthDateRequiredWhenDamSet')]));
    return;
  }

  // OI-0132 Class A atomicity: A3 (damId cleared) requires the confirm dialog
  // to fire BEFORE the animal update lands. If the farmer cancels, the whole
  // save is aborted — neither the animal row nor the calving record mutates.
  if (existingAnimal && existingAnimal.damId && !data.damId) {
    const dam = getAll('animals').find(a => a.id === existingAnimal.damId);
    const damName = dam?.tagNum || dam?.name || `A-${existingAnimal.damId.slice(0, 5)}`;
    const proceed = window.confirm(t('animal.clearDamConfirm', { damName }));
    if (!proceed) return;
  }

  const newGroupId = inputs.groupId.value || null;
  const todayStr = getLocalTodayStr();
  try {
    let animalId;
    const before = existingAnimal
      ? { damId: existingAnimal.damId || null, birthDate: existingAnimal.birthDate || null, sireAnimalId: existingAnimal.sireAnimalId || null }
      : { damId: null, birthDate: null, sireAnimalId: null };
    if (existingAnimal) {
      update('animals', existingAnimal.id, data, AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
      animalId = existingAnimal.id;
    } else {
      const record = AnimalEntity.create(data);
      add('animals', record, AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
      animalId = record.id;
    }

    // OI-0132 Class A: mirror the damId / birthDate transition onto
    // animal_calving_records. Confirm dialog is bypassed (null handler) because
    // A3's gate already fired above — if we reached here the user confirmed.
    await syncCalvingRecordForAnimal({
      before,
      after: {
        id: animalId,
        damId: data.damId,
        birthDate: data.birthDate,
        sireAnimalId: data.sireAnimalId,
      },
      operationId,
      confirmDeleteHandler: () => true,
    });

    const perHead = parseFloat(inputs.totalWeight?.value);
    if (isComposite && Number.isFinite(perHead) && perHead > 0 && bulkHeadCount > 0) {
      const unitSysNow = getUnitSystem();
      const perKg = unitSysNow === 'imperial' ? convert(perHead, 'weight', 'toMetric') : perHead;
      const lotKg = perKg * bulkHeadCount;
      const previous = latestWeightForAnimal(getAll('animalWeightRecords'), animalId);
      const unchanged = previous && Math.abs(previous.weightKg - lotKg) < 0.05;
      if (!unchanged) {
        const weightRec = WeightRecordEntity.create({
          operationId,
          animalId,
          recordedAt: new Date().toISOString(),
          weightKg: lotKg,
          source: 'manual',
        });
        add('animalWeightRecords', weightRec, WeightRecordEntity.validate, WeightRecordEntity.toSupabaseShape, 'animal_weight_records');
      }
    }

    const acceptedReductions = (!isComposite && newGroupId && newGroupId !== previousGroupId)
      ? confirmCompositeReductions(newGroupId, [animalId])
      : [];

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
      applyCompositeReductions(acceptedReductions, operationId);
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
