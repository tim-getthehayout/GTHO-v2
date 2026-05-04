/** @file OI-0145 — Event Audit walk-through page (post-restructure).
 *
 * Route: `#/dev/audit?id=<uuid>` (no id → empty state with picker).
 * Eight rendered surfaces (top to bottom):
 *   1. Sticky audit header strip — event id/type/farm/op + prev/next + picker + UNIT TOGGLE
 *   2. Event header strip — derived start, source_event_id, drift chip, linked-pair banner
 *   3. Timeline ribbon — chronological dot list
 *   4. Per-paddock-window blocks — each window's location / forage / observation / FOR-1 +
 *      overlapping group windows (members + animal class + DMI-2) + scoped feed entries +
 *      scoped feed check items
 *   4b. Event-level feed records — parent feed-checks index + batches table + orphan entries
 *   5. Event-level rollup calc cards — DMI-3 + DMI-8 today; OI-0144 calcs surface here when
 *      registered (registry-driven via getAllCalcs() filtered by scope === 'event')
 *   6. DMI bar chart placeholder
 *   7. Store ↔ Supabase diff placeholder
 */

import { el, clear, text } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, getOperation } from '../../data/store.js';
import { getAllCalcs } from '../../utils/calc-registry.js';
import { getEventStartDate } from '../events/event-start.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../calcs/window-helpers.js';
import { renderDevModeBadge } from './index.js';
import { resolveCalcForCalcCard } from './audit-resolvers.js';
import {
  getAuditUnitMode, setAuditUnitMode, formatAuditValue,
  formatAuditDmPerDay, formatAuditDmTotal, VALID_MODES,
} from './audit-units.js';
import { navigate } from '../../ui/router.js';

function parseEventId() {
  const raw = window.location.hash || '';
  const qIdx = raw.indexOf('?');
  if (qIdx === -1) return null;
  const params = new URLSearchParams(raw.slice(qIdx + 1));
  return params.get('id');
}

function formatDate(iso) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

/** Render a value annotation (handles unit-mode hybrid `{ primary, secondary }`). */
function renderFormattedValue(formatted) {
  if (formatted == null) return text('—');
  if (typeof formatted === 'string') return text(formatted);
  // Hybrid mode → primary + muted parenthetical.
  return el('span', {}, [
    text(formatted.primary),
    el('span', { style: { color: 'var(--text2)', marginLeft: '4px' } }, [text(`(${formatted.secondary})`)]),
  ]);
}

/** Section 1 — sticky header strip + UNIT TOGGLE. */
function renderAuditHeader(container, event) {
  const op = getOperation();
  const farm = event?.farmId ? getById('farms', event.farmId) : null;
  const events = getAll('events').filter(e => e.operationId === op?.id).sort((a, b) => {
    const aStart = getEventStartDate(a.id) || '';
    const bStart = getEventStartDate(b.id) || '';
    return aStart.localeCompare(bStart);
  });
  const idx = events.findIndex(e => e.id === event?.id);
  const prev = idx > 0 ? events[idx - 1] : null;
  const next = idx >= 0 && idx < events.length - 1 ? events[idx + 1] : null;

  const strip = el('div', {
    'data-testid': 'dev-audit-header-strip',
    style: { position: 'sticky', top: '0', zIndex: '5', background: 'var(--bg)', borderBottom: '0.5px solid var(--border2)', padding: 'var(--space-3)' },
  });

  strip.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } }, [
    el('h1', { className: 'screen-heading', style: { margin: 0, fontSize: '18px' } }, [t('dev.auditTitle')]),
    renderDevModeBadge(),
    el('span', { style: { fontSize: '11px', color: 'var(--text2)' } }, [
      event ? `event ${event.id.slice(0, 8)} · ${event.type || '—'} · ${farm?.name || '—'} · ${op?.name || '—'}` : t('dev.auditNoEvent'),
    ]),
  ]));

  // OI-0147 Bug A fix: picker renders in both the event-selected state and the
  // empty state — only the prev/next buttons stay gated on `event` non-null.
  // The empty-state copy at `dev.auditPickEvent` refers to "the dropdown
  // above"; that dropdown must always exist when the operation has any events.
  // When `events.length === 0` we render a small grey "no events for this
  // operation yet" note instead of an empty <select>.
  const navRow = el('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' } });

  if (event) {
    navRow.appendChild(el('button', {
      className: 'btn btn-outline btn-xs',
      'data-testid': 'dev-audit-prev',
      disabled: !prev,
      onClick: () => prev && navigate(`#/dev/audit?id=${prev.id}`),
    }, ['← prev']));
    navRow.appendChild(el('button', {
      className: 'btn btn-outline btn-xs',
      'data-testid': 'dev-audit-next',
      disabled: !next,
      onClick: () => next && navigate(`#/dev/audit?id=${next.id}`),
    }, ['next →']));
  }

  if (events.length > 0) {
    const picker = el('select', {
      'data-testid': 'dev-audit-event-picker',
      style: { fontSize: '11px', padding: '4px 6px', border: '0.5px solid var(--border2)', borderRadius: '4px', background: 'var(--bg)', fontFamily: 'inherit', color: 'var(--text)' },
      onChange: (e) => {
        if (e.target.value) navigate(`#/dev/audit?id=${e.target.value}`);
      },
    });
    if (!event) {
      picker.appendChild(el('option', {
        value: '', disabled: 'disabled', selected: 'selected',
      }, [t('dev.auditPickerPlaceholder')]));
    }
    for (const evt of events) {
      const start = getEventStartDate(evt.id) || '—';
      picker.appendChild(el('option', {
        value: evt.id,
        ...(evt.id === event?.id ? { selected: 'selected' } : {}),
      }, [`${start} · ${evt.id.slice(0, 8)}`]));
    }
    navRow.appendChild(picker);
  } else {
    navRow.appendChild(el('span', {
      'data-testid': 'dev-audit-no-events-note',
      style: { fontSize: '11px', color: 'var(--text2)', fontStyle: 'italic' },
    }, [t('dev.auditNoEventsForOperation')]));
  }

  // Always attach: in empty-state with events the picker lives here; in
  // empty-state with no events the "no events" note lives here; in the loaded
  // state prev/next + picker live here. Skipping the append on empty
  // event/empty events would orphan the note.
  strip.appendChild(navRow);

  // 3-way unit toggle. ARIA radiogroup; persists via localStorage.
  const currentMode = getAuditUnitMode();
  const toggleRow = el('div', {
    'data-testid': 'dev-audit-unit-toggle',
    role: 'radiogroup',
    'aria-label': t('dev.auditUnitToggleLabel'),
    style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' },
  });
  const segWrap = el('div', {
    style: { display: 'inline-flex', border: '0.5px solid var(--border2)', borderRadius: '4px', overflow: 'hidden' },
  });
  for (const mode of VALID_MODES) {
    const labelKey = mode === 'metric' ? 'dev.auditUnitMetric' : mode === 'standard' ? 'dev.auditUnitStandard' : 'dev.auditUnitHybrid';
    segWrap.appendChild(el('button', {
      role: 'radio',
      'aria-checked': mode === currentMode ? 'true' : 'false',
      'data-testid': `dev-audit-unit-${mode}`,
      style: {
        padding: '4px 10px',
        fontSize: '11px',
        border: 'none',
        background: mode === currentMode ? 'var(--amber)' : 'var(--bg)',
        color: mode === currentMode ? 'var(--bg)' : 'var(--text)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontWeight: mode === currentMode ? '600' : '400',
      },
      onClick: () => {
        if (getAuditUnitMode() === mode) return;
        setAuditUnitMode(mode);
        renderEventAudit(container.parentElement || container);
      },
    }, [t(labelKey)]));
  }
  toggleRow.appendChild(segWrap);
  toggleRow.appendChild(el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, [t('dev.auditUnitNote')]));
  strip.appendChild(toggleRow);

  container.appendChild(strip);
}

/** Section 2 — event header strip. */
function renderEventHeader(container, event) {
  if (!event) return;
  const start = getEventStartDate(event.id);
  const sourceEventId = event.sourceEventId || null;

  const card = el('div', { className: 'card', 'data-testid': 'dev-audit-event-header', style: { padding: 'var(--space-3)', marginTop: 'var(--space-3)' } });
  card.appendChild(el('h2', { style: { fontSize: '14px', margin: '0 0 6px 0' } }, [t('dev.auditEventHeader')]));

  const facts = [
    [t('dev.auditDerivedStart'), start || '—'],
    [t('dev.auditDateOut'), formatDate(event.dateOut)],
    [t('dev.auditSourceEvent'), sourceEventId ? sourceEventId.slice(0, 8) : '—'],
  ];
  for (const [k, v] of facts) {
    card.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '2px 0' } }, [
      el('span', { style: { color: 'var(--text2)' } }, [k]),
      el('span', { style: { fontFamily: 'monospace' } }, [String(v)]),
    ]));
  }

  const earliestPaddock = getAll('eventPaddockWindows')
    .filter(pw => pw.eventId === event.id)
    .sort((a, b) => (a.dateOpened || '').localeCompare(b.dateOpened || ''))[0];
  if (earliestPaddock && start) {
    const matches = earliestPaddock.dateOpened === start;
    card.appendChild(el('div', { style: { marginTop: '8px' } }, [
      el('span', {
        'data-testid': 'dev-audit-drift-chip',
        className: `badge badge-${matches ? 'green' : 'red'}`,
        style: { fontSize: '10px' },
      }, [matches ? t('dev.auditDriftOk') : t('dev.auditDriftMismatch')]),
      text(' '),
      el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, [
        `getEventStartDate=${start}; earliest pw.dateOpened=${earliestPaddock.dateOpened}`,
      ]),
    ]));
  }

  if (sourceEventId) {
    const sourceEvent = getById('events', sourceEventId);
    const banner = el('div', {
      'data-testid': 'dev-audit-linked-pair-banner',
      style: { marginTop: '10px', padding: '8px', background: 'var(--amber-l, #fff3cd)', borderRadius: '4px', fontSize: '12px' },
    }, [
      el('strong', {}, [t('dev.auditLinkedPair')]),
      text(` ${sourceEvent ? `← ${sourceEvent.id.slice(0, 8)}` : `← ${sourceEventId.slice(0, 8)} (not loaded)`}`),
    ]);
    card.appendChild(banner);
  }

  container.appendChild(card);
}

/** Section 3 — timeline ribbon. */
function renderTimeline(container, event) {
  if (!event) return;
  const card = el('div', { className: 'card', 'data-testid': 'dev-audit-timeline', style: { padding: 'var(--space-3)', marginTop: 'var(--space-3)' } });
  card.appendChild(el('h2', { style: { fontSize: '14px', margin: '0 0 6px 0' } }, [t('dev.auditTimeline')]));

  const dots = [];
  for (const pw of getAll('eventPaddockWindows').filter(p => p.eventId === event.id)) {
    if (pw.dateOpened) dots.push({ when: `${pw.dateOpened} ${pw.timeOpened || ''}`.trim(), label: `pw open · ${getById('locations', pw.locationId)?.name || pw.locationId.slice(0, 8)}` });
    if (pw.dateClosed) dots.push({ when: `${pw.dateClosed} ${pw.timeClosed || ''}`.trim(), label: `pw close · ${getById('locations', pw.locationId)?.name || pw.locationId.slice(0, 8)}` });
  }
  for (const gw of getAll('eventGroupWindows').filter(g => g.eventId === event.id)) {
    if (gw.dateJoined) dots.push({ when: `${gw.dateJoined} ${gw.timeJoined || ''}`.trim(), label: `gw join · ${getById('groups', gw.groupId)?.name || gw.groupId.slice(0, 8)}` });
    if (gw.dateLeft) dots.push({ when: `${gw.dateLeft} ${gw.timeLeft || ''}`.trim(), label: `gw leave · ${getById('groups', gw.groupId)?.name || gw.groupId.slice(0, 8)}` });
  }
  for (const fe of getAll('eventFeedEntries').filter(e => e.eventId === event.id)) {
    dots.push({ when: `${fe.date} ${fe.time || ''}`.trim(), label: `feed delivery · ${fe.quantity}` });
  }
  for (const fc of getAll('eventFeedChecks').filter(c => c.eventId === event.id)) {
    dots.push({ when: `${fc.date} ${fc.time || ''}`.trim(), label: 'feed check' });
  }
  dots.sort((a, b) => a.when.localeCompare(b.when));

  for (const dot of dots) {
    card.appendChild(el('div', { style: { fontSize: '11px', padding: '2px 0', fontFamily: 'monospace' } }, [
      el('span', { style: { color: 'var(--text2)' } }, [dot.when]),
      text(' · '),
      el('span', {}, [dot.label]),
    ]));
  }
  if (!dots.length) {
    card.appendChild(el('p', { className: 'form-hint' }, [t('dev.auditTimelineEmpty')]));
  }
  container.appendChild(card);
}

/** Helper: render a key/value row with optional unit formatting. */
function kv(label, value, measureType = null, decimals = 2) {
  const formatted = formatAuditValue(value, measureType, decimals);
  return el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '1px 0' } }, [
    el('span', { style: { color: 'var(--text2)' } }, [label]),
    el('span', { style: { fontFamily: 'monospace' } }, [renderFormattedValue(formatted)]),
  ]);
}

/** Helper: render an input row from a resolver annotation. */
function renderInputRow(inp) {
  const formatted = formatAuditValue(inp.value, inp.measureType);
  return el('div', {
    style: { fontSize: '10px', fontFamily: 'monospace', color: inp.missing ? 'var(--red, #d33)' : 'var(--text)' },
  }, [
    text(`${inp.name} = `),
    inp.value === null || inp.value === undefined
      ? text('∅')
      : (inp.measureType ? renderFormattedValue(formatted) : text(JSON.stringify(inp.value))),
    el('span', { style: { color: 'var(--text2)' } }, [text(` ← ${inp.source}`)]),
  ]);
}

/** Helper: render a calc-card body (inputs + output) given a resolver instance. */
function renderCalcInstance(inst) {
  const block = el('div', { style: { marginTop: '6px', paddingTop: '6px', borderTop: '0.5px dashed var(--border)' } });
  if (inst.label) block.appendChild(el('div', { style: { fontSize: '11px', fontWeight: '500', marginBottom: '4px' } }, [inst.label]));
  for (const inp of inst.inputs) {
    block.appendChild(renderInputRow(inp));
  }
  // Output line — apply measure type + suffix when set.
  let outputText;
  if (inst.output === null || inst.output === undefined) {
    outputText = text('—');
  } else if (inst.outputMeasure === 'weight' && inst.outputSuffix === ' DM/day') {
    outputText = renderFormattedValue(formatAuditDmPerDay(inst.output));
  } else if (inst.outputMeasure === 'weight' && inst.outputSuffix === ' DM') {
    outputText = renderFormattedValue(formatAuditDmTotal(inst.output));
  } else if (inst.outputMeasure) {
    outputText = renderFormattedValue(formatAuditValue(inst.output, inst.outputMeasure));
  } else if (typeof inst.output === 'number') {
    outputText = text(inst.output.toFixed(2));
  } else {
    outputText = text(JSON.stringify(inst.output));
  }
  block.appendChild(el('div', {
    style: { fontSize: '12px', fontWeight: '600', marginTop: '4px', color: inst.gateStatus === 'ok' ? 'var(--text)' : 'var(--amber)' },
  }, [
    text(`${t('dev.auditCalcOutput')}: `),
    outputText,
  ]));
  if (inst.gateStatus !== 'ok') {
    block.appendChild(el('div', { style: { fontSize: '10px', color: 'var(--amber)' } }, [`gate: ${inst.gateStatus}`]));
  }
  return block;
}

function calcCardWrapper(name, description, testId) {
  const c = el('div', {
    'data-testid': testId,
    style: { padding: '10px', border: '0.5px solid var(--border2)', borderRadius: '4px', background: 'var(--bg)', marginTop: '8px' },
  });
  c.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '4px' } }, [name]));
  if (description) {
    c.appendChild(el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginBottom: '6px' } }, [description]));
  }
  return c;
}

/** Group window sub-block (rendered inside its overlapping paddock window's block). */
function renderGroupWindowSubBlock(parent, gw, eventId, dmi2InstancesByGwId, isoToday) {
  const group = getById('groups', gw.groupId);
  const cls = gw.animalClassId ? getById('animalClasses', gw.animalClassId) : null;
  const memberships = getAll('animalGroupMemberships').filter(m =>
    m.groupId === gw.groupId &&
    (m.dateJoined || '0000-01-01') <= isoToday &&
    (!m.dateLeft || m.dateLeft >= isoToday),
  );
  const allMemberships = getAll('animalGroupMemberships');
  const allAnimals = getAll('animals');
  const allClasses = getAll('animalClasses');
  const allWeights = getAll('animalWeightRecords');

  const liveHead = getLiveWindowHeadCount(gw, { memberships: allMemberships, now: isoToday });
  const liveAvg = getLiveWindowAvgWeight(gw, {
    memberships: allMemberships, animals: allAnimals,
    animalClasses: allClasses, animalWeightRecords: allWeights, now: isoToday,
  });

  const sub = el('div', {
    'data-testid': `dev-audit-group-window-${gw.id}`,
    style: { padding: '8px', marginTop: '8px', border: '0.5px solid var(--border)', borderRadius: '4px', background: 'var(--bg-2, #fafafa)' },
  });

  // Header
  // OI-0157-A: drift comparison still operates on raw kg numbers (not display
  // strings) so the drift threshold (0.5 kg) stays unit-invariant.
  const drift = gw.headCount !== liveHead || (typeof liveAvg === 'number' && Math.abs(liveAvg - (gw.avgWeightKg || 0)) > 0.5);
  sub.appendChild(el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '4px' } }, [
    el('strong', { style: { fontSize: '12px' } }, [`${t('dev.auditGroupWindow')}: ${group?.name || gw.groupId.slice(0, 8)}`]),
    el('span', { style: { fontSize: '10px', color: 'var(--text2)', fontFamily: 'monospace' } }, [`gw ${gw.id.slice(0, 8)}`]),
    el('span', { className: `badge badge-${gw.dateLeft ? 'outline' : 'green'}`, style: { fontSize: '10px' } }, [gw.dateLeft ? t('dev.auditWindowClosed') : t('dev.auditWindowOpen')]),
    drift ? el('span', { className: 'badge badge-amber', style: { fontSize: '10px' } }, [t('dev.auditStoredLiveDrift')]) : null,
  ].filter(Boolean)));
  sub.appendChild(el('div', { style: { fontSize: '11px', fontFamily: 'monospace', color: 'var(--text2)' } }, [
    `${gw.dateJoined || '—'} ${gw.timeJoined || ''} → ${gw.dateLeft || '—'} ${gw.timeLeft || ''}`.trim(),
  ]));
  // OI-0157-A: route group-window weight through `formatAuditValue` so it
  // honors the audit page's metric/standard/hybrid toggle. Pre-OI-0157 these
  // lines were raw template literals with hardcoded ` kg` suffix that
  // bypassed the toggle entirely. Head counts stay unitless (decimals=0
  // gives a plain integer like "28" not "28.00").
  sub.appendChild(el('div', { style: { fontSize: '11px', fontFamily: 'monospace' } }, [
    el('span', {}, ['stored: ']),
    el('span', {}, [formatAuditValue(gw.headCount, null, 0)]),
    el('span', {}, [' head / ']),
    renderFormattedValue(formatAuditValue(gw.avgWeightKg, 'weight', 2)),
  ]));
  sub.appendChild(el('div', { style: { fontSize: '11px', fontFamily: 'monospace' } }, [
    el('span', {}, ['live: ']),
    el('span', {}, [formatAuditValue(liveHead, null, 0)]),
    el('span', {}, [' head / ']),
    renderFormattedValue(formatAuditValue(typeof liveAvg === 'number' ? liveAvg : null, 'weight', 2)),
  ]));

  // Animal class
  if (cls) {
    const classCard = el('div', {
      'data-testid': `dev-audit-animal-class-${cls.id}`,
      style: { marginTop: '6px', padding: '6px', background: 'var(--bg)', borderRadius: '3px' },
    });
    classCard.appendChild(el('div', { style: { fontSize: '11px', fontWeight: '500', marginBottom: '2px' } }, [`${t('dev.auditAnimalClass')}: ${cls.name}`]));
    classCard.appendChild(kv('id', cls.id.slice(0, 8)));
    classCard.appendChild(kv('dmiPct', cls.dmiPct));
    classCard.appendChild(kv('dmiPctLactating', cls.dmiPctLactating));
    classCard.appendChild(kv('defaultWeightKg', cls.defaultWeightKg, 'weight'));
    sub.appendChild(classCard);
  } else {
    sub.appendChild(el('div', { style: { fontSize: '10px', color: 'var(--red, #d33)', marginTop: '4px' } }, [t('dev.auditAnimalClassMissing')]));
  }

  // Memberships table
  const memTable = el('div', { 'data-testid': `dev-audit-memberships-${gw.id}`, style: { marginTop: '6px' } });
  memTable.appendChild(el('div', { style: { fontSize: '11px', fontWeight: '500', marginBottom: '2px' } }, [`${t('dev.auditMemberships')} (${memberships.length})`]));
  if (memberships.length) {
    const headerRow = el('div', { style: { display: 'grid', gridTemplateColumns: '90px 80px 90px 90px 80px 1fr', gap: '4px', fontSize: '10px', color: 'var(--text2)', fontWeight: '600', padding: '2px 0' } }, [
      el('span', {}, [t('dev.auditAnimal')]),
      el('span', {}, ['classId']),
      el('span', {}, [t('dev.auditDateJoined')]),
      el('span', {}, [t('dev.auditDateLeft')]),
      el('span', {}, [t('dev.auditLatestWeight')]),
      el('span', {}, [t('dev.auditWeightSource')]),
    ]);
    memTable.appendChild(headerRow);
    const refDate = gw.dateLeft || isoToday;
    for (const m of memberships) {
      const animal = allAnimals.find(a => a.id === m.animalId);
      const wRecs = allWeights.filter(w => w.animalId === m.animalId && (w.date || w.recordedAt || '').slice(0, 10) <= refDate)
        .sort((a, b) => ((b.date || b.recordedAt) || '').localeCompare((a.date || a.recordedAt) || ''));
      const wRec = wRecs[0] || null;
      const animalCls = animal?.animalClassId ? allClasses.find(c => c.id === animal.animalClassId) : null;
      const fallbackWeight = animalCls?.defaultWeightKg ?? null;
      const weightVal = wRec?.weightKg ?? fallbackWeight ?? null;
      const weightSrc = wRec ? `animalWeightRecords.${wRec.id.slice(0, 8)}` : (fallbackWeight ? `animalClasses.${animalCls.id.slice(0, 8)}.defaultWeightKg` : '—');
      const formatted = formatAuditValue(weightVal, 'weight');
      memTable.appendChild(el('div', {
        'data-testid': `dev-audit-membership-${m.id}`,
        style: { display: 'grid', gridTemplateColumns: '90px 80px 90px 90px 80px 1fr', gap: '4px', fontSize: '10px', fontFamily: 'monospace', padding: '1px 0' },
      }, [
        el('span', {}, [animal?.tagNum || m.animalId.slice(0, 8)]),
        el('span', {}, [m.animalClassId ? m.animalClassId.slice(0, 8) : '—']),
        el('span', {}, [m.dateJoined || '—']),
        el('span', {}, [m.dateLeft || '—']),
        el('span', { style: { color: weightVal == null ? 'var(--red, #d33)' : 'var(--text)' } }, [renderFormattedValue(formatted)]),
        el('span', { style: { color: 'var(--text2)' } }, [weightSrc]),
      ]));
    }
  } else {
    memTable.appendChild(el('p', { className: 'form-hint', style: { fontSize: '11px' } }, [t('dev.auditMembershipsEmpty')]));
  }
  sub.appendChild(memTable);

  // DMI-2 calc card for this gw (if resolver returned an instance for it)
  const dmi2Inst = dmi2InstancesByGwId.get(gw.id);
  if (dmi2Inst) {
    const calc = getAllCalcs().find(c => c.name === 'DMI-2');
    const card = calcCardWrapper('DMI-2', calc?.description || '', `dev-audit-calc-card-DMI-2-${gw.id}`);
    card.appendChild(renderCalcInstance(dmi2Inst));
    sub.appendChild(card);
  }

  parent.appendChild(sub);
}

/** Section 4 — per-paddock-window blocks. */
function renderPaddockWindowBlocks(container, event, dmi2Result, for1Result) {
  if (!event) return;
  const card = el('div', { className: 'card', 'data-testid': 'dev-audit-paddock-blocks', style: { padding: 'var(--space-3)', marginTop: 'var(--space-3)' } });
  card.appendChild(el('h2', { style: { fontSize: '14px', margin: '0 0 6px 0' } }, [t('dev.auditPaddockWindows')]));

  const paddockWindows = getAll('eventPaddockWindows')
    .filter(pw => pw.eventId === event.id)
    .sort((a, b) => (a.dateOpened || '').localeCompare(b.dateOpened || ''));
  if (!paddockWindows.length) {
    card.appendChild(el('p', { className: 'form-hint' }, [t('dev.auditPaddockWindowsEmpty')]));
    container.appendChild(card);
    return;
  }

  const allGroupWindows = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id);
  const allObservations = getAll('paddockObservations');
  const allForageTypes = getAll('forageTypes');
  const allFeedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === event.id);
  const allChecks = getAll('eventFeedChecks').filter(fc => fc.eventId === event.id);
  const checkIds = new Set(allChecks.map(c => c.id));
  const allCheckItems = getAll('eventFeedCheckItems').filter(ci => checkIds.has(ci.feedCheckId));
  const allBatches = getAll('batches');
  const isoToday = new Date().toISOString().slice(0, 10);

  // Index DMI-2 instances by groupWindowId so the group-window sub-block can pluck it.
  const dmi2InstancesByGwId = new Map();
  if (dmi2Result?.applicable && dmi2Result.instances) {
    for (const inst of dmi2Result.instances) {
      if (inst.groupWindowId) dmi2InstancesByGwId.set(inst.groupWindowId, inst);
    }
  }
  const for1InstancesByPwId = new Map();
  if (for1Result?.applicable && for1Result.instances) {
    for (const inst of for1Result.instances) {
      if (inst.paddockWindowId) for1InstancesByPwId.set(inst.paddockWindowId, inst);
    }
  }
  const for1Calc = getAllCalcs().find(c => c.name === 'FOR-1');

  for (const pw of paddockWindows) {
    const loc = getById('locations', pw.locationId);
    const ft = loc?.forageTypeId ? allForageTypes.find(f => f.id === loc.forageTypeId) : null;

    // OI-0107 picker
    const candidates = allObservations.filter(o =>
      o.locationId === pw.locationId && o.type === 'open' && o.source === 'event',
    );
    const obs = candidates.find(o => o.sourceId === pw.id)
      || candidates.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
      || null;

    const block = el('div', {
      'data-testid': `dev-audit-paddock-window-${pw.id}`,
      style: { marginTop: '12px', padding: '10px', border: '0.5px solid var(--border2)', borderRadius: '4px' },
    });

    // 1. Window header
    block.appendChild(el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' } }, [
      el('strong', { style: { fontSize: '13px' } }, [loc?.name || `Loc ${pw.locationId.slice(0, 8)}`]),
      el('span', { style: { fontSize: '10px', color: 'var(--text2)', fontFamily: 'monospace' } }, [`pw ${pw.id.slice(0, 8)}`]),
      el('span', { className: `badge badge-${pw.dateClosed ? 'outline' : 'green'}`, style: { fontSize: '10px' } }, [pw.dateClosed ? t('dev.auditWindowClosed') : t('dev.auditWindowOpen')]),
      pw.sourceEventId ? el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, [`sourceEvent ${pw.sourceEventId.slice(0, 8)}`]) : null,
    ].filter(Boolean)));
    block.appendChild(el('div', { style: { fontSize: '11px', fontFamily: 'monospace', color: 'var(--text2)' } }, [
      `${pw.dateOpened || '—'} ${pw.timeOpened || ''} → ${pw.dateClosed || '—'} ${pw.timeClosed || ''}`.trim(),
    ]));
    block.appendChild(kv('areaPct', pw.areaPct ?? 100));

    // 2. Location
    if (loc) {
      const locCard = el('div', {
        'data-testid': `dev-audit-location-${loc.id}`,
        style: { marginTop: '6px', padding: '6px', background: 'var(--bg-2, #fafafa)', borderRadius: '3px' },
      });
      locCard.appendChild(el('div', { style: { fontSize: '11px', fontWeight: '500', marginBottom: '2px' } }, [t('dev.auditLocation')]));
      locCard.appendChild(kv('name', loc.name));
      locCard.appendChild(kv('areaHectares', loc.areaHectares, 'area'));
      locCard.appendChild(kv('forageTypeId', loc.forageTypeId ? `${ft?.name || '?'} (${loc.forageTypeId.slice(0, 8)})` : '—'));
      block.appendChild(locCard);
    }

    // 3. Forage type
    const ftCard = el('div', {
      'data-testid': `dev-audit-forage-type-${pw.id}`,
      style: { marginTop: '6px', padding: '6px', background: 'var(--bg-2, #fafafa)', borderRadius: '3px' },
    });
    ftCard.appendChild(el('div', { style: { fontSize: '11px', fontWeight: '500', marginBottom: '2px' } }, [t('dev.auditForageType')]));
    if (ft) {
      ftCard.appendChild(kv('name', ft.name));
      ftCard.appendChild(kv('dmKgPerCmPerHa', ft.dmKgPerCmPerHa, 'dmYieldDensity'));
      ftCard.appendChild(kv('minResidualHeightCm', ft.minResidualHeightCm, 'length'));
      ftCard.appendChild(kv('utilizationPct', ft.utilizationPct));
    } else {
      ftCard.appendChild(el('div', { style: { fontSize: '10px', color: 'var(--red, #d33)' } }, [t('dev.auditForageTypeMissing')]));
    }
    block.appendChild(ftCard);

    // 4. Pre-graze observation
    const obsCard = el('div', {
      'data-testid': `dev-audit-observation-${pw.id}`,
      style: { marginTop: '6px', padding: '6px', background: 'var(--bg-2, #fafafa)', borderRadius: '3px' },
    });
    obsCard.appendChild(el('div', { style: { fontSize: '11px', fontWeight: '500', marginBottom: '2px' } }, [t('dev.auditPreGrazeObservation')]));
    if (obs) {
      obsCard.appendChild(kv('forageHeightCm', obs.forageHeightCm, 'length'));
      obsCard.appendChild(kv('forageCoverPct', obs.forageCoverPct));
      obsCard.appendChild(kv('date', obs.date));
      obsCard.appendChild(kv('observedAt', obs.observedAt || obs.createdAt));
      if (obs.notes) obsCard.appendChild(kv('notes', obs.notes));
    } else {
      obsCard.appendChild(el('div', { style: { fontSize: '10px', color: 'var(--red, #d33)' } }, [t('dev.auditObservationMissing')]));
    }
    block.appendChild(obsCard);

    // 5. FOR-1 calc card
    const for1Inst = for1InstancesByPwId.get(pw.id);
    if (for1Inst) {
      const card2 = calcCardWrapper('FOR-1', for1Calc?.description || '', `dev-audit-calc-card-FOR-1-${pw.id}`);
      card2.appendChild(renderCalcInstance(for1Inst));
      block.appendChild(card2);
    }

    // 6. Group windows overlapping this paddock window
    const overlapping = allGroupWindows.filter(gw => {
      const gwStart = gw.dateJoined || '0000-01-01';
      const gwEnd = gw.dateLeft || '9999-12-31';
      const pwStart = pw.dateOpened || '0000-01-01';
      const pwEnd = pw.dateClosed || '9999-12-31';
      return gwStart <= pwEnd && gwEnd >= pwStart;
    });
    if (overlapping.length) {
      const gwHeader = el('div', { style: { fontSize: '11px', fontWeight: '500', marginTop: '8px' } }, [`${t('dev.auditOverlappingGroupWindows')} (${overlapping.length})`]);
      block.appendChild(gwHeader);
      for (const gw of overlapping) {
        renderGroupWindowSubBlock(block, gw, event.id, dmi2InstancesByGwId, isoToday);
      }
    }

    // 7. Feed entries delivered to this paddock window
    const pwStart = pw.dateOpened || '0000-01-01';
    const pwEnd = pw.dateClosed || '9999-12-31';
    const scopedEntries = allFeedEntries
      .filter(fe => fe.locationId === pw.locationId && fe.date >= pwStart && fe.date <= pwEnd)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const feedTable = el('div', { 'data-testid': `dev-audit-feed-entries-${pw.id}`, style: { marginTop: '8px' } });
    feedTable.appendChild(el('div', { style: { fontSize: '11px', fontWeight: '500', marginBottom: '2px' } }, [`${t('dev.auditFeedEntries')} (${scopedEntries.length})`]));
    if (scopedEntries.length) {
      feedTable.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '90px 60px 1fr 70px 80px 60px 110px 1fr', gap: '4px', fontSize: '10px', color: 'var(--text2)', fontWeight: '600' } }, [
        el('span', {}, [t('dev.auditDate')]), el('span', {}, [t('dev.auditTime')]),
        el('span', {}, [t('dev.auditBatch')]), el('span', {}, [t('dev.auditQuantity')]),
        el('span', {}, [t('dev.auditWeightPerUnit')]), el('span', {}, [t('dev.auditDmPct')]),
        el('span', {}, [t('dev.auditKgDm')]), el('span', {}, [t('dev.auditNotes')]),
      ]));
      for (const fe of scopedEntries) {
        const batch = allBatches.find(b => b.id === fe.batchId);
        const kgDm = batch?.weightPerUnitKg && batch?.dmPct
          ? (Number(fe.quantity) || 0) * batch.weightPerUnitKg * (batch.dmPct / 100)
          : null;
        feedTable.appendChild(el('div', {
          style: { display: 'grid', gridTemplateColumns: '90px 60px 1fr 70px 80px 60px 110px 1fr', gap: '4px', fontSize: '10px', fontFamily: 'monospace' },
        }, [
          el('span', {}, [fe.date || '—']),
          el('span', {}, [fe.time || '—']),
          el('span', {}, [batch?.name || fe.batchId.slice(0, 8)]),
          el('span', {}, [String(fe.quantity ?? '—')]),
          el('span', {}, [renderFormattedValue(formatAuditValue(batch?.weightPerUnitKg ?? null, 'weight'))]),
          el('span', {}, [batch?.dmPct != null ? `${batch.dmPct}%` : '—']),
          el('span', {}, [renderFormattedValue(formatAuditValue(kgDm, 'weight'))]),
          el('span', { style: { color: 'var(--text2)' } }, [fe.notes || '']),
        ]));
      }
    } else {
      feedTable.appendChild(el('p', { className: 'form-hint', style: { fontSize: '11px' } }, [t('dev.auditFeedEntriesEmpty')]));
    }
    block.appendChild(feedTable);

    // 8. Feed check items at this paddock window (by locationId — items carry it; parent checks don't)
    const scopedItems = allCheckItems
      .filter(ci => ci.locationId === pw.locationId)
      .map(ci => ({ ci, parent: allChecks.find(c => c.id === ci.feedCheckId) }))
      .filter(x => !!x.parent)
      .sort((a, b) => (a.parent.date || '').localeCompare(b.parent.date || ''));
    const itemsTable = el('div', { 'data-testid': `dev-audit-check-items-${pw.id}`, style: { marginTop: '8px' } });
    itemsTable.appendChild(el('div', { style: { fontSize: '11px', fontWeight: '500', marginBottom: '2px' } }, [`${t('dev.auditCheckItems')} (${scopedItems.length})`]));
    if (scopedItems.length) {
      itemsTable.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '90px 60px 1fr 90px 110px 80px', gap: '4px', fontSize: '10px', color: 'var(--text2)', fontWeight: '600' } }, [
        el('span', {}, [t('dev.auditDate')]), el('span', {}, [t('dev.auditTime')]),
        el('span', {}, [t('dev.auditBatch')]), el('span', {}, [t('dev.auditRemaining')]),
        el('span', {}, [t('dev.auditKgDm')]), el('span', {}, [t('dev.auditCloseReading')]),
      ]));
      for (const { ci, parent } of scopedItems) {
        const batch = allBatches.find(b => b.id === ci.batchId);
        const kgDm = batch?.weightPerUnitKg && batch?.dmPct
          ? (Number(ci.remainingQuantity) || 0) * batch.weightPerUnitKg * (batch.dmPct / 100)
          : null;
        itemsTable.appendChild(el('div', {
          style: { display: 'grid', gridTemplateColumns: '90px 60px 1fr 90px 110px 80px', gap: '4px', fontSize: '10px', fontFamily: 'monospace' },
        }, [
          el('span', {}, [parent.date || '—']),
          el('span', {}, [parent.time || '—']),
          el('span', {}, [batch?.name || ci.batchId.slice(0, 8)]),
          el('span', {}, [String(ci.remainingQuantity ?? '—')]),
          el('span', {}, [renderFormattedValue(formatAuditValue(kgDm, 'weight'))]),
          el('span', {}, [parent.isCloseReading ? '✓' : '']),
        ]));
      }
    } else {
      itemsTable.appendChild(el('p', { className: 'form-hint', style: { fontSize: '11px' } }, [t('dev.auditCheckItemsEmpty')]));
    }
    block.appendChild(itemsTable);

    card.appendChild(block);
  }

  container.appendChild(card);
}

/** Section 4b — event-level feed records (parent checks index, batches table, orphans). */
function renderEventLevelFeedRecords(container, event) {
  if (!event) return;
  const card = el('div', { className: 'card', 'data-testid': 'dev-audit-event-level-feed', style: { padding: 'var(--space-3)', marginTop: 'var(--space-3)' } });
  card.appendChild(el('h2', { style: { fontSize: '14px', margin: '0 0 6px 0' } }, [t('dev.auditEventLevelFeed')]));

  const checks = getAll('eventFeedChecks').filter(fc => fc.eventId === event.id);
  const checkIds = new Set(checks.map(c => c.id));
  const items = getAll('eventFeedCheckItems').filter(ci => checkIds.has(ci.feedCheckId));

  // Parent checks index
  const checksDetails = el('details', { 'data-testid': 'dev-audit-parent-checks-index', open: 'open', style: { marginBottom: '8px' } });
  checksDetails.appendChild(el('summary', { style: { fontSize: '12px', cursor: 'pointer', fontWeight: '500' } }, [`${t('dev.auditParentChecksIndex')} (${checks.length})`]));
  if (checks.length) {
    checksDetails.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '90px 60px 60px 60px 110px 1fr', gap: '4px', fontSize: '10px', color: 'var(--text2)', fontWeight: '600' } }, [
      el('span', {}, [t('dev.auditDate')]), el('span', {}, [t('dev.auditTime')]),
      el('span', {}, [t('dev.auditCloseReading')]), el('span', {}, [t('dev.auditItemCount')]),
      el('span', {}, [t('dev.auditSumRemaining')]), el('span', {}, [t('dev.auditPerPairTotals')]),
    ]));
    for (const fc of checks.sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
      const fcItems = items.filter(ci => ci.feedCheckId === fc.id);
      const sumRemaining = fcItems.reduce((s, ci) => s + (Number(ci.remainingQuantity) || 0), 0);
      const perPair = fcItems
        .map(ci => `${(getById('batches', ci.batchId)?.name || ci.batchId.slice(0, 8))}@${(getById('locations', ci.locationId)?.name || ci.locationId.slice(0, 8))}=${ci.remainingQuantity}`)
        .join(', ');
      checksDetails.appendChild(el('div', {
        style: { display: 'grid', gridTemplateColumns: '90px 60px 60px 60px 110px 1fr', gap: '4px', fontSize: '10px', fontFamily: 'monospace', padding: '1px 0' },
      }, [
        el('span', {}, [fc.date || '—']),
        el('span', {}, [fc.time || '—']),
        el('span', {}, [fc.isCloseReading ? '✓' : '']),
        el('span', {}, [String(fcItems.length)]),
        el('span', {}, [sumRemaining.toFixed(2)]),
        el('span', { style: { color: 'var(--text2)' } }, [perPair]),
      ]));
    }
  } else {
    checksDetails.appendChild(el('p', { className: 'form-hint', style: { fontSize: '11px' } }, [t('dev.auditParentChecksEmpty')]));
  }
  card.appendChild(checksDetails);

  // Batches referenced
  const batchIds = new Set([
    ...getAll('eventFeedEntries').filter(fe => fe.eventId === event.id).map(fe => fe.batchId),
    ...items.map(ci => ci.batchId),
  ]);
  const batches = [...batchIds].map(id => getById('batches', id)).filter(Boolean);
  const batchesDetails = el('details', { 'data-testid': 'dev-audit-batches-table', open: 'open', style: { marginBottom: '8px' } });
  batchesDetails.appendChild(el('summary', { style: { fontSize: '12px', cursor: 'pointer', fontWeight: '500' } }, [`${t('dev.auditBatchesReferenced')} (${batches.length})`]));
  if (batches.length) {
    batchesDetails.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 80px 60px 80px 110px', gap: '4px', fontSize: '10px', color: 'var(--text2)', fontWeight: '600' } }, [
      el('span', {}, [t('dev.auditBatchName')]), el('span', {}, [t('dev.auditWeightPerUnit')]),
      el('span', {}, [t('dev.auditDmPct')]), el('span', {}, [t('dev.auditPricePerKg')]),
      el('span', {}, [t('dev.auditPriceUpdatedAt')]),
    ]));
    for (const b of batches.sort((a, b) => (a.name || '').localeCompare(b.name || ''))) {
      batchesDetails.appendChild(el('div', {
        'data-testid': `dev-audit-batch-${b.id}`,
        style: { display: 'grid', gridTemplateColumns: '1fr 80px 60px 80px 110px', gap: '4px', fontSize: '10px', fontFamily: 'monospace' },
      }, [
        el('span', {}, [b.name || b.id.slice(0, 8)]),
        el('span', {}, [renderFormattedValue(formatAuditValue(b.weightPerUnitKg ?? null, 'weight'))]),
        el('span', {}, [b.dmPct != null ? `${b.dmPct}%` : '—']),
        el('span', {}, [b.pricePerKg != null ? `$${Number(b.pricePerKg).toFixed(2)}` : '—']),
        el('span', { style: { color: 'var(--text2)' } }, [b.pricePerKgUpdatedAt || '—']),
      ]));
    }
  } else {
    batchesDetails.appendChild(el('p', { className: 'form-hint', style: { fontSize: '11px' } }, [t('dev.auditBatchesEmpty')]));
  }
  card.appendChild(batchesDetails);

  // Orphans
  const eventEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === event.id);
  const pwLocSet = new Set(
    getAll('eventPaddockWindows').filter(pw => pw.eventId === event.id).map(pw => pw.locationId),
  );
  const orphans = eventEntries.filter(fe => !pwLocSet.has(fe.locationId));
  const orphansDetails = el('details', { 'data-testid': 'dev-audit-orphan-feed-entries', open: orphans.length > 0 ? 'open' : null, style: { marginBottom: '4px' } });
  orphansDetails.appendChild(el('summary', {
    style: { fontSize: '12px', cursor: 'pointer', fontWeight: '500', color: orphans.length > 0 ? 'var(--red, #d33)' : 'var(--text)' },
  }, [`${t('dev.auditOrphanFeedEntries')} (${orphans.length})`]));
  if (orphans.length) {
    for (const fe of orphans) {
      orphansDetails.appendChild(el('div', {
        'data-testid': `dev-audit-orphan-${fe.id}`,
        style: { fontSize: '10px', fontFamily: 'monospace', padding: '1px 0', color: 'var(--red, #d33)' },
      }, [`${fe.date || '—'} · ${(getById('batches', fe.batchId)?.name || fe.batchId.slice(0, 8))} · loc=${fe.locationId.slice(0, 8)} (no matching paddock window)`]));
    }
  } else {
    orphansDetails.appendChild(el('p', { className: 'form-hint', style: { fontSize: '11px' } }, [t('dev.auditOrphanFeedEntriesNone')]));
  }
  card.appendChild(orphansDetails);

  container.appendChild(card);
}

/** Render the DMI-8 card (custom shape — not a generic resolver instance). */
function renderDmi8Card(card, inst) {
  const w = inst.windowSummary || {};
  card.appendChild(el('div', { style: { fontSize: '11px', fontFamily: 'monospace', color: 'var(--text2)', marginBottom: '6px' } }, [
    `${w.eventStart || '—'} → ${w.dateOut || t('dev.auditOpenEnded')} · ${w.nDays} ${t('dev.auditDays')}`,
  ]));

  // State chips
  const chipRow = el('div', { 'data-testid': 'dev-audit-dmi8-chips', style: { display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' } });
  const counts = inst.counts || {};
  const chipMap = {
    actual: 'green', estimated: 'amber', needs_check: 'red',
    no_animals: 'outline', no_pasture_data: 'red',
  };
  for (const [status, color] of Object.entries(chipMap)) {
    const n = counts[status] || 0;
    if (n === 0) continue;
    chipRow.appendChild(el('span', {
      className: `badge badge-${color}`,
      'data-testid': `dev-audit-dmi8-chip-${status}`,
      style: { fontSize: '10px' },
    }, [`${n} ${t(`dev.auditDmi8Status.${status}`)}`]));
  }
  card.appendChild(chipRow);

  // Sources roll-up
  const s = inst.sources || {};
  const srcLines = [
    `groupWindows: ${s.groupWindows?.open ?? 0} ${t('dev.auditOpen')}` + (s.groupWindows?.total > s.groupWindows?.open ? ` (${s.groupWindows.open} ${t('dev.auditOpen')} ${t('dev.auditOf')} ${s.groupWindows.total})` : ''),
    `feedEntries: ${s.feedEntries ?? 0} ${t('dev.auditDeliveries')}`,
    `feedChecks: ${s.feedChecks ?? 0} ${t('dev.auditChecks')} (${s.feedCheckItems ?? 0} ${t('dev.auditItems')})`,
    `paddockWindows: ${s.paddockWindows?.total ?? 0} (${s.paddockWindows?.closed ?? 0} ${t('dev.auditClosed')}, ${s.paddockWindows?.open ?? 0} ${t('dev.auditOpen')})`,
  ];
  const srcWrap = el('div', { 'data-testid': 'dev-audit-dmi8-sources', style: { fontFamily: 'monospace', fontSize: '10px', marginBottom: '6px' } });
  for (const line of srcLines) {
    srcWrap.appendChild(el('div', {}, [line]));
  }
  srcWrap.appendChild(el('div', {
    style: { color: s.forageTypesMissing ? 'var(--red, #d33)' : 'var(--text)' },
  }, [`forageTypes: ${s.forageTypesMissing ? t('dev.auditMissingOnOpenWindow') : t('dev.auditResolved')} (${s.forageTypeLocations ?? 0} ${t('dev.auditLocation')})`]));
  srcWrap.appendChild(el('div', {
    style: { color: s.batchesMissing ? 'var(--red, #d33)' : 'var(--text)' },
  }, [`batches: ${s.batchesMissing ? t('dev.auditMissing') : t('dev.auditResolved')} (${s.batchesReferenced ?? 0})`]));
  card.appendChild(srcWrap);

  if (inst.assumedFullCoverDays > 0) {
    card.appendChild(el('div', { style: { fontSize: '10px', color: 'var(--text2)' } }, [
      `hint: assumed_full_cover (≥${inst.assumedFullCoverDays} ${t('dev.auditDays')})`,
    ]));
  }

  // Daily breakdown disclosure (auto-expanded when needs_check or no_pasture_data > 0)
  const autoOpen = (counts.needs_check > 0) || (counts.no_pasture_data > 0);
  const details = el('details', {
    'data-testid': 'dev-audit-dmi8-daily',
    ...(autoOpen ? { open: 'open' } : {}),
    style: { marginTop: '6px' },
  });
  details.appendChild(el('summary', { style: { fontSize: '11px', cursor: 'pointer', fontWeight: '500' } }, [
    `${t('dev.auditDailyBreakdown')} (${(inst.dailyBreakdown || []).length} ${t('dev.auditDays')})`,
  ]));
  const tableHeader = el('div', { style: { display: 'grid', gridTemplateColumns: '90px 110px 90px 80px 80px 70px 1fr 1fr', gap: '4px', fontSize: '10px', color: 'var(--text2)', fontWeight: '600', marginTop: '4px' } }, [
    el('span', {}, [t('dev.auditDate')]),
    el('span', {}, [t('dev.auditStatus')]),
    el('span', { style: { textAlign: 'right' } }, [t('dev.auditTotalKg')]),
    el('span', { style: { textAlign: 'right' } }, [t('dev.auditPasture')]),
    el('span', { style: { textAlign: 'right' } }, [t('dev.auditStored')]),
    el('span', { style: { textAlign: 'right' } }, [t('dev.auditDeficit')]),
    el('span', {}, [t('dev.auditPwOpen')]),
    el('span', {}, [t('dev.auditHintReason')]),
  ]);
  details.appendChild(tableHeader);
  for (const d of (inst.dailyBreakdown || [])) {
    const color = chipMap[d.status] || 'outline';
    const numericRender = (val) => {
      if (val == null) return text('—');
      return renderFormattedValue(formatAuditValue(val, 'weight'));
    };
    details.appendChild(el('div', {
      'data-testid': `dev-audit-dmi8-day-${d.date}`,
      style: { display: 'grid', gridTemplateColumns: '90px 110px 90px 80px 80px 70px 1fr 1fr', gap: '4px', fontSize: '10px', fontFamily: 'monospace', padding: '1px 0' },
    }, [
      el('span', {}, [d.date]),
      el('span', { className: `badge badge-${color}`, style: { fontSize: '9px' } }, [t(`dev.auditDmi8Status.${d.status}`)]),
      el('span', { style: { textAlign: 'right' } }, [numericRender(d.totalDmiKg)]),
      el('span', { style: { textAlign: 'right' } }, [numericRender(d.pastureDmiKg)]),
      el('span', { style: { textAlign: 'right' } }, [numericRender(d.storedDmiKg)]),
      el('span', { style: { textAlign: 'right' } }, [numericRender(d.deficitKg)]),
      el('span', { style: { color: 'var(--text2)' } }, [(d.pwOpenIds || []).join(', ')]),
      el('span', { style: { color: 'var(--text2)' } }, [[d.hint, d.reason].filter(Boolean).join(' · ')]),
    ]));
  }
  card.appendChild(details);
}

/** Section 5 — event-level rollup calc cards. */
function renderEventCalcCards(container, event, eventResolverResults) {
  if (!event) return;
  const card = el('div', { className: 'card', 'data-testid': 'dev-audit-calc-cards', style: { padding: 'var(--space-3)', marginTop: 'var(--space-3)' } });
  card.appendChild(el('h2', { style: { fontSize: '14px', margin: '0 0 6px 0' } }, [t('dev.auditCalcCards')]));

  const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '10px' } });
  let surfaced = 0;
  for (const result of eventResolverResults) {
    const calcMeta = getAllCalcs().find(c => c.name === result.name);
    surfaced++;
    const calcCard = calcCardWrapper(result.name, calcMeta?.description || '', `dev-audit-calc-card-${result.name}`);
    if (!result.applicable) {
      calcCard.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--text2)', fontStyle: 'italic' } }, [
        result.reason || t('dev.auditCalcNotApplicable'),
      ]));
    } else {
      for (const inst of result.instances) {
        if (inst.kind === 'dmi8-card') {
          renderDmi8Card(calcCard, inst);
        } else {
          calcCard.appendChild(renderCalcInstance(inst));
        }
      }
    }
    grid.appendChild(calcCard);
  }
  card.appendChild(grid);
  if (surfaced === 0) {
    card.appendChild(el('p', { className: 'form-hint' }, [t('dev.auditCalcNoResolvers')]));
  }
  container.appendChild(card);
}

/** Section 6 — DMI bar chart placeholder. */
function renderDmiBars(container, event) {
  if (!event) return;
  const card = el('div', { className: 'card', 'data-testid': 'dev-audit-dmi-bars', style: { padding: 'var(--space-3)', marginTop: 'var(--space-3)' } });
  card.appendChild(el('h2', { style: { fontSize: '14px', margin: '0 0 6px 0' } }, [t('dev.auditDmiBars')]));
  card.appendChild(el('p', { className: 'form-hint' }, [t('dev.auditDmiBarsTodo')]));
  container.appendChild(card);
}

/** Section 7 — store↔Supabase diff placeholder. */
function renderStoreSupabaseDiff(container, event) {
  if (!event) return;
  const card = el('div', { className: 'card', 'data-testid': 'dev-audit-store-supabase-diff', style: { padding: 'var(--space-3)', marginTop: 'var(--space-3)' } });
  card.appendChild(el('h2', { style: { fontSize: '14px', margin: '0 0 6px 0' } }, [t('dev.auditStoreDiff')]));
  card.appendChild(el('p', { className: 'form-hint' }, [t('dev.auditStoreDiffTodo')]));
  container.appendChild(card);
}

/** Render the full Event Audit page. */
export function renderEventAudit(container) {
  clear(container);
  const wrapper = el('div', {
    className: 'dev-audit-wrapper',
    'data-testid': 'dev-audit-wrapper',
    style: { padding: '0 var(--space-3) var(--space-4)' },
  });
  container.appendChild(wrapper);

  const eventId = parseEventId();
  const event = eventId ? getById('events', eventId) : null;

  // Section 1 — sticky header (always rendered, even on empty state).
  renderAuditHeader(wrapper, event);

  if (!event) {
    wrapper.appendChild(el('div', {
      className: 'card',
      'data-testid': 'dev-audit-empty-state',
      style: { padding: 'var(--space-4)', marginTop: 'var(--space-3)', textAlign: 'center' },
    }, [
      el('p', {}, [t('dev.auditPickEvent')]),
    ]));
    return;
  }

  // Resolver dispatch — collect all results, then partition by scope.
  const ctx = { eventId: event.id };
  const allCalcs = getAllCalcs();
  const eventResolverResults = [];
  let dmi2Result = null;
  let for1Result = null;
  for (const calc of allCalcs) {
    const result = resolveCalcForCalcCard(calc.name, ctx);
    if (!result) continue;
    if (result.scope === 'event') eventResolverResults.push(result);
    if (calc.name === 'DMI-2') dmi2Result = result;
    if (calc.name === 'FOR-1') for1Result = result;
  }

  // Sections 2–7.
  renderEventHeader(wrapper, event);
  renderTimeline(wrapper, event);
  renderPaddockWindowBlocks(wrapper, event, dmi2Result, for1Result);
  renderEventLevelFeedRecords(wrapper, event);
  renderEventCalcCards(wrapper, event, eventResolverResults);
  renderDmiBars(wrapper, event);
  renderStoreSupabaseDiff(wrapper, event);
}
