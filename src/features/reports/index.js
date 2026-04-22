/** @file Reports screen — CP-48 through CP-51, CP-54. Report tabs + reference console. */
import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById } from '../../data/store.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import { display } from '../../utils/units.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import { renderReferenceConsole } from './reference-console.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../calcs/window-helpers.js';
import { getEventStartDate } from '../events/event-start.js';

/** Active tab state */
let activeTab = 'feed';

const TABS = [
  { key: 'feed',      labelKey: 'reports.tabFeed' },
  { key: 'npk',       labelKey: 'reports.tabNpk' },
  { key: 'animals',   labelKey: 'reports.tabAnimals' },
  { key: 'season',    labelKey: 'reports.tabSeason' },
  { key: 'surveys',   labelKey: 'reports.tabSurveys' },
  { key: 'weaning',   labelKey: 'reports.tabWeaning' },
  { key: 'reference', labelKey: 'reports.tabReference' },
];

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderReportsScreen(container) {
  container.appendChild(el('h1', { className: 'screen-heading' }, [t('nav.reports')]));

  // Tab strip
  const tabStrip = el('div', {
    className: 'tab-strip',
    'data-testid': 'reports-tab-strip',
  });

  const contentEl = el('div', {
    'data-testid': 'reports-tab-content',
    style: { minHeight: '200px' },
  });

  const renderTab = (key) => {
    activeTab = key;
    // Update button active states
    tabStrip.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === key);
    });
    clear(contentEl);
    switch (key) {
      case 'feed':      contentEl.appendChild(renderFeedDmiTab()); break;
      case 'npk':       contentEl.appendChild(renderNpkTab()); break;
      case 'animals':   contentEl.appendChild(renderAnimalsTab()); break;
      case 'season':    contentEl.appendChild(renderSeasonTab()); break;
      case 'surveys':   contentEl.appendChild(renderPlaceholderTab('Pasture Surveys')); break;
      case 'weaning':   contentEl.appendChild(renderPlaceholderTab('Weaning')); break;
      case 'reference': contentEl.appendChild(renderReferenceConsole()); break;
    }
  };

  for (const { key, labelKey } of TABS) {
    tabStrip.appendChild(el('button', {
      className: `tab-btn${activeTab === key ? ' active' : ''}`,
      'data-testid': `reports-tab-${key}`,
      'data-tab': key,
      onClick: () => renderTab(key),
    }, [t(labelKey)]));
  }

  container.appendChild(tabStrip);
  container.appendChild(contentEl);

  // Render initial tab
  renderTab(activeTab);
}

// ---------------------------------------------------------------------------
// Placeholder tabs (CP-54: Pasture Surveys, Weaning — pending implementation)
// ---------------------------------------------------------------------------

function renderPlaceholderTab(tabName) {
  return el('div', {
    'data-testid': `reports-placeholder-${tabName.toLowerCase().replace(/\s+/g, '-')}`,
    style: { padding: 'var(--space-8)', textAlign: 'center' },
  }, [
    el('p', { style: { color: 'var(--text2)' } }, [
      `${tabName} reports coming soon.`,
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statCard(label, value, testId) {
  return el('div', {
    className: 'card',
    'data-testid': testId,
    style: { padding: '12px 16px', marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  }, [
    el('span', { style: { color: 'var(--text2)', fontSize: '13px' } }, [label]),
    el('span', { style: { fontWeight: '700', fontSize: '15px' } }, [value]),
  ]);
}

function sectionHeading(text) {
  return el('div', { className: 'species-header', style: { marginTop: 'var(--space-4)' } }, [text]);
}

function emptyState(msgKey) {
  return el('p', { className: 'form-hint', style: { fontStyle: 'italic' } }, [t(msgKey)]);
}

// ---------------------------------------------------------------------------
// CP-48: Feed & DMI tab
// ---------------------------------------------------------------------------

function renderFeedDmiTab() {
  const wrap = el('div', { 'data-testid': 'reports-feed-dmi' });

  const feedEntries = getAll('eventFeedEntries');
  const batches = getAll('batches');
  const events = getAll('events');
  const groupWindows = getAll('eventGroupWindows');
  const animalClasses = getAll('animalClasses');
  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalWeightRecords = getAll('animalWeightRecords');
  const todayStr = new Date().toISOString().slice(0, 10);
  const unitSys = getUnitSystem();

  const dmi2 = getCalcByName('DMI-2');
  const cst1 = getCalcByName('CST-1');

  if (!feedEntries.length) {
    wrap.appendChild(emptyState('reports.noFeedData'));
    return wrap;
  }

  // Totals
  let totalDmKg = 0;
  let totalCost = 0;
  const batchMap = new Map(batches.map(b => [b.id, b]));

  const costEntries = [];
  for (const fe of feedEntries) {
    const batch = batchMap.get(fe.batchId);
    if (!batch) continue;
    const dmPct = batch.dmPct ?? 0;
    totalDmKg += fe.quantity * (batch.weightPerUnitKg ?? 1) * (dmPct / 100);
    costEntries.push({ qtyUnits: fe.quantity, costPerUnit: batch.costPerUnit ?? 0 });
  }

  if (cst1) {
    totalCost = cst1.fn({ entries: costEntries });
  }

  wrap.appendChild(sectionHeading(t('reports.totals')));
  wrap.appendChild(statCard(
    t('reports.totalFeedDelivered'),
    `${feedEntries.length} ${t('reports.deliveries')}`,
    'reports-feed-total-deliveries',
  ));
  wrap.appendChild(statCard(
    t('reports.totalDmConsumed'),
    `${display(totalDmKg, 'weight', unitSys, 1)} DM`,
    'reports-feed-total-dm',
  ));
  wrap.appendChild(statCard(
    t('reports.totalFeedCost'),
    `$${totalCost.toFixed(2)}`,
    'reports-feed-total-cost',
  ));

  // Group-by-group DMI breakdown
  wrap.appendChild(sectionHeading(t('reports.dmiByGroup')));

  const groupsWithEntries = new Map(); // groupId → { name, totalDmiKgPerDay }

  for (const event of events) {
    const gws = groupWindows.filter(gw => gw.eventId === event.id);
    for (const gw of gws) {
      const group = getById('groups', gw.groupId);
      if (!group) continue;
      const cls = animalClasses.find(ac => ac.id === gw.animalClassId) ?? null;
      const dmiPct = cls?.dmiPct ?? 2.5;
      const dmiPctLactating = cls?.dmiPctLactating ?? dmiPct;
      const now = gw.dateLeft || event.dateOut || todayStr;
      const liveHead = getLiveWindowHeadCount(gw, { memberships, now });
      const liveAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now });

      let groupDmi = 0;
      if (dmi2) {
        groupDmi = dmi2.fn({
          headCount: liveHead,
          avgWeightKg: liveAvg,
          dmiPct,
          dmiPctLactating,
          isLactating: false,
        });
      }

      const existing = groupsWithEntries.get(gw.groupId);
      if (existing) {
        existing.totalDmiKgPerDay += groupDmi;
      } else {
        groupsWithEntries.set(gw.groupId, { name: group.name, totalDmiKgPerDay: groupDmi });
      }
    }
  }

  if (groupsWithEntries.size === 0) {
    wrap.appendChild(emptyState('reports.noGroupData'));
  } else {
    for (const [groupId, info] of groupsWithEntries) {
      wrap.appendChild(statCard(
        info.name,
        `${display(info.totalDmiKgPerDay, 'weight', unitSys, 1)}/day DMI target`,
        `reports-feed-group-${groupId}`,
      ));
    }
  }

  return wrap;
}

// ---------------------------------------------------------------------------
// CP-49: NPK Fertility tab
// ---------------------------------------------------------------------------

function renderNpkTab() {
  const wrap = el('div', { 'data-testid': 'reports-npk' });

  const soilTests = getAll('soilTests');
  const npkPrices = getAll('npkPriceHistory');
  const events = getAll('events');
  const groupWindows = getAll('eventGroupWindows');
  const animalClasses = getAll('animalClasses');
  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalWeightRecords = getAll('animalWeightRecords');
  const todayStr = new Date().toISOString().slice(0, 10);

  const npk1 = getCalcByName('NPK-1');
  const npk2 = getCalcByName('NPK-2');

  // Get current NPK prices (latest entry)
  const sortedPrices = [...npkPrices].sort((a, b) => (b.effectiveDate ?? '').localeCompare(a.effectiveDate ?? ''));
  const currentPrices = sortedPrices[0] ?? { nPricePerKg: 0, pPricePerKg: 0, kPricePerKg: 0 };

  // Compute NPK deposited per paddock from closed events
  const npkByLocation = new Map(); // locationId → { nKg, pKg, kKg, name }
  const closedEvents = events.filter(e => e.dateOut);

  for (const event of closedEvents) {
    const gws = groupWindows.filter(gw => gw.eventId === event.id);
    const paddockWindows = getAll('eventPaddockWindows').filter(pw => pw.eventId === event.id);

    const dateIn = getEventStartDate(event.id);
    const dateOut = event.dateOut;
    const days = dateIn && dateOut ? daysBetweenInclusive(dateIn, dateOut) : 1;

    for (const gw of gws) {
      const cls = animalClasses.find(ac => ac.id === gw.animalClassId) ?? null;

      if (!npk1) continue;

      const now = gw.dateLeft || event.dateOut || todayStr;
      const liveHead = getLiveWindowHeadCount(gw, { memberships, now });
      const liveAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now });
      const npkResult = npk1.fn({
        headCount: liveHead,
        avgWeightKg: liveAvg,
        days,
        excretionNRate: cls?.excretionN ?? 0.145,
        excretionPRate: cls?.excretionP ?? 0.041,
        excretionKRate: cls?.excretionK ?? 0.136,
      });

      // Attribute to each paddock window of this event
      const share = paddockWindows.length > 0 ? 1 / paddockWindows.length : 1;
      for (const pw of paddockWindows) {
        const existing = npkByLocation.get(pw.locationId) ?? { nKg: 0, pKg: 0, kKg: 0 };
        const loc = getById('locations', pw.locationId);
        npkByLocation.set(pw.locationId, {
          name: loc?.name ?? pw.locationId,
          nKg: existing.nKg + npkResult.nKg * share,
          pKg: existing.pKg + npkResult.pKg * share,
          kKg: existing.kKg + npkResult.kKg * share,
        });
      }
    }
  }

  wrap.appendChild(sectionHeading(t('reports.npkByPaddock')));

  if (npkByLocation.size === 0) {
    wrap.appendChild(emptyState('reports.noNpkData'));
  } else {
    for (const [locId, info] of npkByLocation) {
      const totalValue = npk2 ? npk2.fn({
        nKg: info.nKg,
        pKg: info.pKg,
        kKg: info.kKg,
        nPricePerKg: currentPrices.nPricePerKg ?? 0,
        pPricePerKg: currentPrices.pPricePerKg ?? 0,
        kPricePerKg: currentPrices.kPricePerKg ?? 0,
      }) : 0;

      wrap.appendChild(el('div', {
        className: 'card',
        'data-testid': `reports-npk-paddock-${locId}`,
        style: { padding: '12px 16px', marginBottom: 'var(--space-3)' },
      }, [
        el('div', { style: { fontWeight: '600', marginBottom: '4px' } }, [info.name]),
        el('div', { className: 'ft-row-detail' }, [
          `N: ${info.nKg.toFixed(1)} kg · P: ${info.pKg.toFixed(1)} kg · K: ${info.kKg.toFixed(1)} kg`,
        ]),
        el('div', { className: 'ft-row-detail' }, [
          `${t('reports.fertilizerValue')}: $${totalValue.toFixed(2)}`,
        ]),
      ]));
    }
  }

  // Soil test comparison
  wrap.appendChild(sectionHeading(t('reports.soilTests')));

  if (!soilTests.length) {
    wrap.appendChild(emptyState('reports.noSoilTestData'));
  } else {
    // Latest soil test per location
    const latestByLocation = new Map();
    for (const st of soilTests) {
      const existing = latestByLocation.get(st.locationId);
      if (!existing || (st.testDate ?? '') > (existing.testDate ?? '')) {
        latestByLocation.set(st.locationId, st);
      }
    }

    for (const [locId, st] of latestByLocation) {
      const loc = getById('locations', locId);
      wrap.appendChild(el('div', {
        className: 'card',
        'data-testid': `reports-soil-test-${locId}`,
        style: { padding: '12px 16px', marginBottom: 'var(--space-3)' },
      }, [
        el('div', { style: { fontWeight: '600', marginBottom: '4px' } }, [loc?.name ?? locId]),
        el('div', { className: 'ft-row-detail' }, [
          `${t('reports.tested')}: ${st.testDate ?? '—'} · pH: ${st.ph ?? '—'}`,
        ]),
        el('div', { className: 'ft-row-detail' }, [
          `OM: ${st.organicMatterPct ?? '—'}% · CEC: ${st.cec ?? '—'}`,
        ]),
      ]));
    }
  }

  return wrap;
}

// ---------------------------------------------------------------------------
// CP-50: Animal Performance tab
// ---------------------------------------------------------------------------

function renderAnimalsTab() {
  const wrap = el('div', { 'data-testid': 'reports-animals' });
  const unitSys = getUnitSystem();

  const animals = getAll('animals');
  const weightRecords = getAll('animalWeightRecords');
  const bcsScores = getAll('animalBcsScores');
  const treatments = getAll('animalTreatments');
  const breedingRecords = getAll('animalBreedingRecords');
  const animalClasses = getAll('animalClasses');

  // Latest weight per animal
  wrap.appendChild(sectionHeading(t('reports.weightTrends')));

  if (!weightRecords.length) {
    wrap.appendChild(emptyState('reports.noWeightData'));
  } else {
    const latestWeights = new Map();
    for (const wr of weightRecords) {
      const existing = latestWeights.get(wr.animalId);
      if (!existing || (wr.date ?? '') > (existing.date ?? '')) {
        latestWeights.set(wr.animalId, wr);
      }
    }

    let totalWeight = 0;
    let count = 0;
    for (const [, wr] of latestWeights) {
      totalWeight += wr.weightKg ?? 0;
      count++;
    }
    const avgWeight = count > 0 ? totalWeight / count : 0;

    wrap.appendChild(statCard(
      t('reports.animalsWeighed'),
      `${count} / ${animals.length}`,
      'reports-animals-weighed-count',
    ));
    wrap.appendChild(statCard(
      t('reports.avgWeight'),
      display(avgWeight, 'weight', unitSys, 1),
      'reports-animals-avg-weight',
    ));
  }

  // BCS summary by class
  wrap.appendChild(sectionHeading(t('reports.bcsSummary')));

  if (!bcsScores.length) {
    wrap.appendChild(emptyState('reports.noBcsData'));
  } else {
    // Latest BCS per animal, then average by class
    const latestBcs = new Map();
    for (const bs of bcsScores) {
      const existing = latestBcs.get(bs.animalId);
      if (!existing || (bs.date ?? '') > (existing.date ?? '')) {
        latestBcs.set(bs.animalId, bs);
      }
    }

    const bcsByClass = new Map(); // classId → [score, ...]
    for (const [animalId, bs] of latestBcs) {
      const animal = getById('animals', animalId);
      if (!animal) continue;
      const classId = animal.animalClassId ?? 'unclassified';
      const bucket = bcsByClass.get(classId) ?? [];
      bucket.push(bs.score);
      bcsByClass.set(classId, bucket);
    }

    for (const [classId, scores] of bcsByClass) {
      const cls = animalClasses.find(ac => ac.id === classId);
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
      wrap.appendChild(statCard(
        cls?.name ?? t('reports.unclassified'),
        `${t('reports.avgBcs')}: ${avg.toFixed(1)} (n=${scores.length})`,
        `reports-bcs-class-${classId}`,
      ));
    }
  }

  // Treatment count by category
  wrap.appendChild(sectionHeading(t('reports.treatmentLog')));

  if (!treatments.length) {
    wrap.appendChild(emptyState('reports.noTreatmentData'));
  } else {
    const treatmentCategories = getAll('treatmentCategories');
    const treatmentTypes = getAll('treatmentTypes');
    const catMap = new Map(treatmentCategories.map(c => [c.id, c]));
    const typeMap = new Map(treatmentTypes.map(tt => [tt.id, tt]));
    const countByCat = new Map();

    for (const tx of treatments) {
      const ttype = typeMap.get(tx.treatmentTypeId);
      const catId = ttype?.categoryId ?? 'uncategorized';
      countByCat.set(catId, (countByCat.get(catId) ?? 0) + 1);
    }

    for (const [catId, count] of countByCat) {
      const cat = catMap.get(catId);
      wrap.appendChild(statCard(
        cat?.name ?? t('reports.uncategorized'),
        `${count} ${t('reports.treatments')}`,
        `reports-treatments-cat-${catId}`,
      ));
    }
  }

  // Breeding status summary
  wrap.appendChild(sectionHeading(t('reports.breedingStatus')));

  if (!breedingRecords.length) {
    wrap.appendChild(emptyState('reports.noBreedingData'));
  } else {
    const confirmed = breedingRecords.filter(b => b.confirmedDate).length;
    const pending = breedingRecords.length - confirmed;
    wrap.appendChild(statCard(t('reports.breedingConfirmed'), String(confirmed), 'reports-breeding-confirmed'));
    wrap.appendChild(statCard(t('reports.breedingPending'), String(pending), 'reports-breeding-pending'));

    const dueInNext30 = breedingRecords.filter(b => {
      if (!b.expectedCalving) return false;
      const daysUntil = (new Date(b.expectedCalving).getTime() - Date.now()) / 86400000;
      return daysUntil >= 0 && daysUntil <= 30;
    }).length;
    wrap.appendChild(statCard(t('reports.calvingDue30d'), String(dueInNext30), 'reports-calving-due'));
  }

  return wrap;
}

// ---------------------------------------------------------------------------
// CP-51: Season Summary tab
// ---------------------------------------------------------------------------

function renderSeasonTab() {
  const wrap = el('div', { 'data-testid': 'reports-season' });
  const unitSys = getUnitSystem();

  const events = getAll('events');
  const paddockWindows = getAll('eventPaddockWindows');
  const groupWindows = getAll('eventGroupWindows');
  const feedEntries = getAll('eventFeedEntries');
  const observations = getAll('paddockObservations');
  const batches = getAll('batches');
  const memberships = getAll('animalGroupMemberships');

  const cst1 = getCalcByName('CST-1');

  // AUDS by paddock
  wrap.appendChild(sectionHeading(t('reports.audsByPaddock')));

  const audsByLocation = new Map();

  for (const event of events) {
    const gws = groupWindows.filter(gw => gw.eventId === event.id);
    const pws = paddockWindows.filter(pw => pw.eventId === event.id);
    const dateIn = getEventStartDate(event.id);
    const dateOut = event.dateOut ?? new Date().toISOString().slice(0, 10);
    const totalDays = dateIn ? daysBetweenInclusive(dateIn, dateOut) : 1;

    // Total head-days for this event (OI-0091: live recompute for open windows)
    let totalHeadDays = 0;
    for (const gw of gws) {
      const now = gw.dateLeft || event.dateOut || dateOut;
      const liveHead = getLiveWindowHeadCount(gw, { memberships, now });
      totalHeadDays += liveHead * totalDays;
    }

    // Attribute AUDs proportionally across paddock windows
    const totalPws = pws.length || 1;
    for (const pw of pws) {
      const loc = getById('locations', pw.locationId);
      const existing = audsByLocation.get(pw.locationId) ?? { name: loc?.name ?? pw.locationId, auds: 0 };
      existing.auds += (totalHeadDays / totalPws);
      audsByLocation.set(pw.locationId, existing);
    }
  }

  if (audsByLocation.size === 0) {
    wrap.appendChild(emptyState('reports.noEventData'));
  } else {
    for (const [locId, info] of audsByLocation) {
      wrap.appendChild(statCard(
        info.name,
        `${info.auds.toFixed(1)} ${t('reports.auds')}`,
        `reports-season-auds-${locId}`,
      ));
    }
  }

  // Feed cost totals
  wrap.appendChild(sectionHeading(t('reports.feedCostTotals')));

  const batchMap = new Map(batches.map(b => [b.id, b]));
  let totalCost = 0;
  const costEntries = feedEntries.map(fe => {
    const batch = batchMap.get(fe.batchId);
    return { qtyUnits: fe.quantity, costPerUnit: batch?.costPerUnit ?? 0 };
  });

  if (cst1 && costEntries.length) {
    totalCost = cst1.fn({ entries: costEntries });
  }

  wrap.appendChild(statCard(
    t('reports.totalFeedCost'),
    `$${totalCost.toFixed(2)}`,
    'reports-season-feed-cost',
  ));

  // Forage survey trends (from paddock observations)
  wrap.appendChild(sectionHeading(t('reports.forageTrends')));

  if (!observations.length) {
    wrap.appendChild(emptyState('reports.noSurveyData'));
  } else {
    // Average forage height and quality per location, from latest observation
    const latestByLoc = new Map();
    for (const obs of observations) {
      if (!obs.locationId) continue;
      const existing = latestByLoc.get(obs.locationId);
      if (!existing || (obs.observedAt ?? '') > (existing.observedAt ?? '')) {
        latestByLoc.set(obs.locationId, obs);
      }
    }

    for (const [locId, obs] of latestByLoc) {
      const loc = getById('locations', locId);
      const heightDisplay = obs.forageHeightCm != null
        ? display(obs.forageHeightCm, 'length', unitSys, 1)
        : '—';
      wrap.appendChild(el('div', {
        className: 'card',
        'data-testid': `reports-season-forage-${locId}`,
        style: { padding: '12px 16px', marginBottom: 'var(--space-3)' },
      }, [
        el('div', { style: { fontWeight: '600', marginBottom: '4px' } }, [loc?.name ?? locId]),
        el('div', { className: 'ft-row-detail' }, [
          `${t('reports.latestSurvey')}: ${obs.observedAt?.slice(0, 10) ?? '—'}`,
        ]),
        el('div', { className: 'ft-row-detail' }, [
          `${t('reports.forageHeight')}: ${heightDisplay} · ${t('reports.cover')}: ${obs.forageCoverPct != null ? obs.forageCoverPct + '%' : '—'}`,
        ]),
        obs.forageQuality != null
          ? el('div', { className: 'ft-row-detail' }, [
              `${t('reports.quality')}: ${obs.forageQuality}`,
            ])
          : null,
      ].filter(Boolean)));
    }
  }

  return wrap;
}
