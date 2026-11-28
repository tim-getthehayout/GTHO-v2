/**
 * @file #436 / OI-0281 — Feed screen stored-feed plan card and the Edit plan
 * sheet, plus the Home "savings to date" tile. Hidden while schema 052 is held.
 */
import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getActiveFarmId, add, update, remove } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { formatMeasure } from '../../utils/units.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { toDisplayValue, toStoredValue } from '../settings/unit-descriptor.js';
import { farmSeasonWindow } from '../../calcs/farm-season.js';
import { computeFeedRunRate } from '../../calcs/feed-run-rate.js';
import { deriveEventStartDate } from '../events/rotation-calendar/location-metrics.js';
import { isStoredFeedPlanReleased } from '../../data/schema-release.js';
import * as Plan from '../../entities/stored-feed-plan.js';
import * as PlanRow from '../../entities/stored-feed-plan-row.js';
import { computeFarmForecast, renderForecastBlock } from './stored-forage-forecast-block.js';
import {
  planForFarm, farmStoredDmiByDate, summarizeStoredFeedPlan, validatePlanLines, lineKind, eachDateInclusive,
} from '../../calcs/stored-feed-plan.js';

const WEIGHT = { measureType: 'weight' };

function farmCtx(farmId) {
  const today = getLocalTodayStr();
  const events = getAll('events').filter(e => e.farmId === farmId);
  const eventIds = new Set(events.map(e => e.id));
  const sameEvent = row => eventIds.has(row.eventId);
  return {
    today, farmId,
    events,
    groupWindows: getAll('eventGroupWindows').filter(sameEvent),
    paddockWindows: getAll('eventPaddockWindows').filter(sameEvent),
    memberships: getAll('animalGroupMemberships'),
    animals: getAll('animals'),
    animalClasses: getAll('animalClasses'),
    animalWeightRecords: getAll('animalWeightRecords'),
    locations: getAll('locations'),
    groups: getAll('groups'),
    feedEntries: getAll('eventFeedEntries').filter(sameEvent),
    feedChecks: getAll('eventFeedChecks').filter(sameEvent),
    feedCheckItems: getAll('eventFeedCheckItems'),
    batches: getAll('batches'),
    feedTypes: getAll('feedTypes'),
  };
}

function wasteKgFor(ctx, periodStart, periodEnd) {
  const today = ctx.today && ctx.today < periodEnd ? ctx.today : periodEnd;
  const days = Math.max(eachDateInclusive(periodStart, today).length, 1);
  const events = ctx.events.map(event => ({
    id: event.id,
    dateIn: deriveEventStartDate(event.id, {
      paddockWindows: ctx.paddockWindows.filter(w => w.eventId === event.id),
      groupWindows: ctx.groupWindows.filter(w => w.eventId === event.id),
      event,
    }) || event.dateIn,
    dateOut: event.dateOut ?? null,
  }));
  try {
    const result = computeFeedRunRate({
      today,
      days,
      periodStart,
      events,
      entries: ctx.feedEntries,
      checks: ctx.feedChecks,
      items: ctx.feedCheckItems,
      batches: Object.fromEntries(ctx.batches.map(b => [b.id, b])),
      feedTypes: Object.fromEntries(ctx.feedTypes.map(ft => [ft.id, ft])),
      groupWindows: ctx.groupWindows,
      memberships: ctx.memberships,
      animals: ctx.animals,
      animalWeightRecords: ctx.animalWeightRecords,
      animalClasses: Object.fromEntries(ctx.animalClasses.map(c => [c.id, c])),
      groups: ctx.groups,
      paddockWindows: ctx.paddockWindows,
      locations: Object.fromEntries(ctx.locations.map(l => [l.id, l])),
    });
    const kg = result?.residual?.dmKg;
    return kg == null || !Number.isFinite(kg) ? null : kg;
  } catch {
    return null;
  }
}

export function computeFarmPlanSummary(farmId, today = getLocalTodayStr()) {
  if (!isStoredFeedPlanReleased() || !farmId) return null;
  const plan = planForFarm(getAll('storedFeedPlans'), farmId, today);
  if (!plan) return { plan: null, rows: [], summary: summarizeStoredFeedPlan({ plan: null }) };
  const rows = getAll('storedFeedPlanRows').filter(r => r.planId === plan.id);
  const ctx = farmCtx(farmId);
  const eatenByDate = farmStoredDmiByDate({
    ...ctx, from: plan.periodStart, to: plan.periodEnd, today,
  });
  const demandOpts = {
    groupWindows: ctx.groupWindows, memberships: ctx.memberships, animals: ctx.animals,
    animalClasses: ctx.animalClasses, animalWeightRecords: ctx.animalWeightRecords,
    events: ctx.events, groups: ctx.groups,
  };
  const summary = summarizeStoredFeedPlan({
    plan, rows, eatenByDate, today,
    needForDate: { today, demandOpts },
    wasteKg: wasteKgFor(ctx, plan.periodStart, plan.periodEnd),
  });
  // #377 slice 1: season forecast (FED-8) from the same plan, rows and need(d) inputs.
  const forecast = computeFarmForecast({ plan, rows, today, demandOpts });
  return { plan, rows, summary, forecast };
}

function toneColor(tone) {
  if (tone === 'green') return 'var(--green)';
  if (tone === 'amber') return 'var(--amber)';
  return 'var(--text2)';
}

function kgText(kg, unitSys, compact = false) {
  return formatMeasure(kg, 'weight', { unitSystem: unitSys, compact });
}

function bucketLine(label, bucket, unitSys, { wasteKg, testid } = {}) {
  const waste = wasteKg != null
    ? el('span', { className: 'form-hint', 'data-testid': `${testid}-waste` }, [
      ` · ${t('feed.planWaste')}: ${kgText(wasteKg, unitSys)}`,
    ])
    : null;
  return el('div', { className: 'feed-plan-stat', 'data-testid': testid }, [
    el('div', { className: 'feed-plan-stat-label' }, [label]),
    el('div', { className: 'feed-plan-stat-values' }, [
      el('span', { 'data-testid': `${testid}-planned` }, [`${t('feed.planPlanned')}: ${kgText(bucket.plannedKg, unitSys)}`]),
      el('span', {}, [' · ']),
      el('span', { 'data-testid': `${testid}-eaten` }, [`${t('feed.planEaten')}: ${kgText(bucket.eatenKg, unitSys)}`]),
      waste,
    ]),
    el('div', {
      className: `feed-plan-savings feed-plan-savings--${bucket.tone}`,
      'data-testid': `${testid}-savings`,
      style: { color: toneColor(bucket.tone) },
    }, [
      bucket.countedDays
        ? `${t('feed.planSavings')}: ${kgText(bucket.savingsKg, unitSys)}`
        : t('feed.planNoCountedDays'),
    ]),
  ]);
}

/** Feed screen card. Null while schema 052 is held or no farm is active. */
export function renderStoredFeedPlanCard() {
  if (!isStoredFeedPlanReleased()) return null;
  const farmId = getActiveFarmId();
  const unitSys = getUnitSystem();
  const card = el('div', { className: 'card feed-plan-card', 'data-testid': 'feed-stored-plan-card' });
  if (!farmId) {
    card.appendChild(el('p', { className: 'form-hint' }, [t('feed.planPickFarm')]));
    return card;
  }
  const data = computeFarmPlanSummary(farmId);
  const ops = getAll('operations');
  const operationId = ops[0]?.id;
  card.appendChild(el('div', { className: 'screen-action-bar' }, [
    el('h2', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('feed.planTitle')]),
    el('button', {
      className: 'btn btn-outline btn-sm',
      'data-testid': 'feed-plan-edit',
      onClick: () => openStoredFeedPlanSheet(data.plan, operationId, farmId),
    }, [data.plan ? t('feed.planEdit') : t('feed.planAdd')]),
  ]));
  if (!data.plan) {
    card.appendChild(el('p', { className: 'form-hint', 'data-testid': 'feed-plan-empty' }, [t('feed.planEmpty')]));
    card.appendChild(el('p', { className: 'form-hint', 'data-testid': 'feed-forecast-no-plan' }, [t('feed.forecastNoPlan')]));
    return card;
  }
  const s = data.summary;
  card.appendChild(el('div', { className: 'form-hint', 'data-testid': 'feed-plan-period' }, [
    `${s.period.start} – ${s.period.end}`,
  ]));
  const forecastBlock = renderForecastBlock(data.forecast, unitSys, operationId);
  if (forecastBlock) card.appendChild(forecastBlock);
  card.appendChild(bucketLine(t('feed.planSeasonToDate'), s.seasonToDate, unitSys, { wasteKg: s.wasteKg, testid: 'feed-plan-season' }));
  card.appendChild(bucketLine(t('feed.planThisMonth'), s.thisMonth, unitSys, { testid: 'feed-plan-month' }));
  const table = el('table', { className: 'feed-plan-months', 'data-testid': 'feed-plan-month-table' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', {}, [t('feed.planMonthCol')]),
      el('th', {}, [t('feed.planPlanned')]),
      el('th', {}, [t('feed.planEaten')]),
      el('th', {}, [t('feed.planSavings')]),
    ])]),
    el('tbody', {}, s.months.map(m => el('tr', {
      'data-testid': 'feed-plan-month-row',
      'data-month': m.month,
    }, [
      el('td', {}, [m.month]),
      el('td', {}, [kgText(m.plannedKg, unitSys)]),
      el('td', {}, [kgText(m.eatenKg, unitSys)]),
      el('td', { style: { color: toneColor(m.tone) } }, [kgText(m.savingsKg, unitSys)]),
    ]))),
  ]);
  card.appendChild(table);
  return card;
}

export function refreshStoredFeedPlanCard(container) {
  const old = container.querySelector('[data-testid="feed-stored-plan-card"]');
  const next = renderStoredFeedPlanCard();
  if (!old && !next) return;
  if (!old && next) {
    const banner = container.querySelector('[data-testid="feed-day-goal-banner"]');
    if (banner) banner.before(next);
    else container.querySelector('[data-testid="feed-screen"]')?.prepend(next);
    return;
  }
  if (old && !next) { old.remove(); return; }
  old.replaceWith(next);
}

/** Home tile model, or null while 052 is held. */
export function homeStoredFeedPlanTile(unitSys) {
  if (!isStoredFeedPlanReleased()) return null;
  const farmId = getActiveFarmId();
  const data = farmId ? computeFarmPlanSummary(farmId) : null;
  const bucket = data?.summary?.seasonToDate;
  const has = bucket && bucket.countedDays > 0;
  return {
    value: has ? kgText(bucket.savingsKg, unitSys, true) : '\u2014',
    label: t('dashboard.planSavings'),
    color: has ? toneColor(bucket.tone) : 'var(--text2)',
    title: has
      ? `${t('feed.planPlanned')}: ${kgText(bucket.plannedKg, unitSys)} · ${t('feed.planEaten')}: ${kgText(bucket.eatenKg, unitSys)}`
      : t('feed.planNoCountedDays'),
    testId: 'dashboard-plan-savings',
  };
}

let planSheet = null;

export function closeStoredFeedPlanSheet() {
  if (planSheet) planSheet.close();
}

function defaultPeriod(farmId) {
  const today = getLocalTodayStr();
  const fs = getAll('farmSettings').find(s => s.farmId === farmId) || null;
  return farmSeasonWindow(today, fs);
}

function draftFrom(plan, rows) {
  if (!plan) {
    const p = defaultPeriod(getActiveFarmId());
    return { periodStart: p.start, periodEnd: p.end, notes: '', lines: [] };
  }
  return {
    periodStart: plan.periodStart,
    periodEnd: plan.periodEnd,
    notes: plan.notes || '',
    lines: rows.map(r => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      kind: lineKind(r) === 'amount' ? 'amount' : 'pct',
      plannedPct: r.plannedPct,
      plannedKgDmPerDay: r.plannedKgDmPerDay,
    })),
  };
}

export function openStoredFeedPlanSheet(existing, operationId, farmId) {
  if (!isStoredFeedPlanReleased()) return;
  if (!document.getElementById('stored-feed-plan-sheet-panel')) {
    document.body.appendChild(el('div', {
      className: 'sheet-wrap', id: 'stored-feed-plan-sheet-wrap', style: { zIndex: '230' },
    }, [
      el('div', { className: 'sheet-backdrop', onClick: () => planSheet && planSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'stored-feed-plan-sheet-panel' }),
    ]));
  }
  if (!planSheet) planSheet = new Sheet('stored-feed-plan-sheet-wrap');
  const panel = document.getElementById('stored-feed-plan-sheet-panel');
  if (!panel) return;
  clear(panel);
  const unitSys = getUnitSystem();
  const existingRows = existing ? getAll('storedFeedPlanRows').filter(r => r.planId === existing.id) : [];
  const draft = draftFrom(existing, existingRows);

  const startIn = el('input', { type: 'date', value: draft.periodStart, 'data-testid': 'feed-plan-period-start' });
  const endIn = el('input', { type: 'date', value: draft.periodEnd, 'data-testid': 'feed-plan-period-end' });
  const notesIn = el('textarea', { 'data-testid': 'feed-plan-notes', rows: '2' }, [draft.notes]);
  const linesEl = el('div', { 'data-testid': 'feed-plan-lines' });
  const statusEl = el('div', { className: 'form-hint', 'data-testid': 'feed-plan-status' });

  function amountDisplay(kg) {
    const v = toDisplayValue(kg, WEIGHT, unitSys);
    return v == null ? '' : String(v);
  }

  function redrawLines() {
    clear(linesEl);
    draft.lines.forEach((line, i) => {
      const kindSel = el('select', {
        'data-testid': `feed-plan-line-kind-${i}`,
        onChange: (e) => { line.kind = e.target.value; redrawLines(); },
      }, [
        el('option', { value: 'pct', selected: line.kind === 'pct' }, [t('feed.planKindPct')]),
        el('option', { value: 'amount', selected: line.kind === 'amount' }, [t('feed.planKindAmount')]),
      ]);
      const from = el('input', { type: 'date', value: line.startDate || '', 'data-testid': `feed-plan-line-from-${i}` });
      const to = el('input', { type: 'date', value: line.endDate || '', 'data-testid': `feed-plan-line-to-${i}` });
      from.addEventListener('change', e => { line.startDate = e.target.value; });
      to.addEventListener('change', e => { line.endDate = e.target.value; });
      const pct = el('input', {
        type: 'number', min: '0', max: '100', step: '1',
        value: line.plannedPct ?? '',
        'data-testid': `feed-plan-line-pct-${i}`,
        hidden: line.kind === 'amount' || undefined,
      });
      pct.addEventListener('change', e => { line.plannedPct = e.target.value === '' ? null : Number(e.target.value); });
      const amt = el('input', {
        type: 'number', min: '0', step: 'any',
        value: amountDisplay(line.plannedKgDmPerDay),
        'data-testid': `feed-plan-line-amount-${i}`,
        hidden: line.kind === 'pct' || undefined,
      });
      amt.addEventListener('change', e => {
        line.plannedKgDmPerDay = e.target.value === '' ? null : toStoredValue(Number(e.target.value), WEIGHT, unitSys);
      });
      const del = el('button', {
        type: 'button', className: 'btn btn-outline btn-xs',
        'data-testid': `feed-plan-line-delete-${i}`,
        onClick: () => { draft.lines.splice(i, 1); redrawLines(); },
      }, [t('action.delete')]);
      linesEl.appendChild(el('div', { className: 'feed-plan-line', 'data-testid': 'feed-plan-line' }, [
        from, to, kindSel, pct, amt, del,
      ]));
    });
  }
  redrawLines();

  function rowsFromDraft(planId) {
    return draft.lines.map(line => PlanRow.create({
      id: line.id,
      operationId,
      planId,
      startDate: line.startDate,
      endDate: line.endDate,
      plannedPct: line.kind === 'pct' ? (line.plannedPct == null ? null : Number(line.plannedPct)) : null,
      plannedKgDmPerDay: line.kind === 'amount' ? line.plannedKgDmPerDay : null,
    }));
  }

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [existing ? t('feed.planEdit') : t('feed.planAdd')]));
  panel.appendChild(el('label', {}, [t('feed.planPeriodStart'), startIn]));
  panel.appendChild(el('label', {}, [t('feed.planPeriodEnd'), endIn]));
  panel.appendChild(el('label', {}, [t('feed.planNotes'), notesIn]));
  panel.appendChild(el('div', { className: 'form-hint' }, [t('feed.planLinesHint')]));
  panel.appendChild(linesEl);
  panel.appendChild(el('button', {
    type: 'button', className: 'btn btn-outline btn-sm', 'data-testid': 'feed-plan-add-line',
    onClick: () => {
      draft.lines.push({
        startDate: startIn.value, endDate: startIn.value, kind: 'pct', plannedPct: 100, plannedKgDmPerDay: null,
      });
      redrawLines();
    },
  }, [t('feed.planAddLine')]));
  panel.appendChild(statusEl);
  panel.appendChild(el('div', { className: 'btn-row sheet-actions-sticky' }, [
    el('button', {
      className: 'btn btn-green', 'data-testid': 'feed-plan-save',
      onClick: () => {
        clear(statusEl);
        draft.periodStart = startIn.value;
        draft.periodEnd = endIn.value;
        draft.notes = notesIn.value;
        const header = Plan.create({
          ...(existing || {}),
          operationId, farmId,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          notes: draft.notes,
          updatedAt: new Date().toISOString(),
        });
        const rows = rowsFromDraft(header.id);
        const unique = [...new Set([
          ...Plan.validate(header).errors,
          ...rows.flatMap(r => PlanRow.validate(r).errors),
          ...validatePlanLines(header, rows),
        ])];
        if (unique.length) {
          statusEl.appendChild(el('span', { 'data-testid': 'feed-plan-error' }, [
            unique.map(c => t(`feed.planError.${c}`)).join(' · '),
          ]));
          return;
        }
        try {
          if (existing) {
            update('storedFeedPlans', existing.id, {
              periodStart: header.periodStart, periodEnd: header.periodEnd, notes: header.notes, updatedAt: header.updatedAt,
            }, Plan.validate, Plan.toSupabaseShape, 'stored_feed_plans');
            const keep = new Set(rows.map(r => r.id));
            for (const old of existingRows) {
              if (!keep.has(old.id)) remove('storedFeedPlanRows', old.id, 'stored_feed_plan_rows');
            }
            for (const row of rows) {
              const was = existingRows.find(r => r.id === row.id);
              if (was) {
                update('storedFeedPlanRows', row.id, {
                  startDate: row.startDate, endDate: row.endDate,
                  plannedPct: row.plannedPct, plannedKgDmPerDay: row.plannedKgDmPerDay, updatedAt: row.updatedAt,
                }, PlanRow.validate, PlanRow.toSupabaseShape, 'stored_feed_plan_rows');
              } else {
                add('storedFeedPlanRows', row, PlanRow.validate, PlanRow.toSupabaseShape, 'stored_feed_plan_rows');
              }
            }
          } else {
            add('storedFeedPlans', header, Plan.validate, Plan.toSupabaseShape, 'stored_feed_plans');
            for (const row of rows) add('storedFeedPlanRows', row, PlanRow.validate, PlanRow.toSupabaseShape, 'stored_feed_plan_rows');
          }
          planSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', { 'data-testid': 'feed-plan-error' }, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline', 'data-testid': 'feed-plan-cancel',
      onClick: () => planSheet.close(),
    }, [t('action.cancel')]),
  ]));
  planSheet.open();
}
