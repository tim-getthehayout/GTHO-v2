/** @file OI-0138 Phase 5 — Event Audit walk-through page.
 *
 * Route: `#/dev/audit?id=<uuid>` (no id → empty state with picker).
 * Seven sections (top to bottom):
 *   1. Sticky audit header strip (event ID + type + farm + prev/next + picker)
 *   2. Event header strip (source_event_id, derived start/end, drift chips)
 *   3. Timeline ribbon (chronological dots — MVP: text list)
 *   4. Child record tables (paddock/group windows, feed entries/checks/items, observations)
 *   5. Calc cards — registry-driven via getAllCalcs() + audit-resolvers dispatcher (the hero)
 *   6. DMI bar chart (reuses dashboard renderer)
 *   7. Store↔Supabase diff panel (raw row pull per entity, red-highlight mismatches — MVP: scaffold only)
 */

import { el, clear, text } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, getOperation } from '../../data/store.js';
import { getAllCalcs } from '../../utils/calc-registry.js';
import { getEventStartDate } from '../events/event-start.js';
import { renderDevModeBadge } from './index.js';
import { resolveCalcForCalcCard } from './audit-resolvers.js';
import { navigate } from '../../ui/router.js';

function parseEventId() {
  // Router strips `?` from the hash for routing, but window.location.hash
  // still has the full string. Parse `?id=<uuid>`.
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

/** Section 1 — sticky header strip. */
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

  if (event) {
    const navRow = el('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' } });
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

    const picker = el('select', {
      'data-testid': 'dev-audit-event-picker',
      style: { fontSize: '11px', padding: '4px 6px', border: '0.5px solid var(--border2)', borderRadius: '4px', background: 'var(--bg)', fontFamily: 'inherit', color: 'var(--text)' },
      onChange: (e) => navigate(`#/dev/audit?id=${e.target.value}`),
    });
    for (const evt of events) {
      const start = getEventStartDate(evt.id) || '—';
      picker.appendChild(el('option', {
        value: evt.id,
        ...(evt.id === event.id ? { selected: 'selected' } : {}),
      }, [`${start} · ${evt.id.slice(0, 8)}`]));
    }
    navRow.appendChild(picker);
    strip.appendChild(navRow);
  }

  container.appendChild(strip);
}

/** Section 2 — event header strip with derived start/end + linked-pair banner + drift chips. */
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

  // Drift chip — derived start vs earliest paddock window dateOpened (OI-0117 invariant).
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

  // Linked-pair banner (auto-detected via source_event_id).
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

/** Section 3 — timeline ribbon (MVP: chronological text list). */
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

/** Section 4 — child record tables (compact). */
function renderChildTables(container, event) {
  if (!event) return;
  const card = el('div', { className: 'card', 'data-testid': 'dev-audit-child-tables', style: { padding: 'var(--space-3)', marginTop: 'var(--space-3)' } });
  card.appendChild(el('h2', { style: { fontSize: '14px', margin: '0 0 6px 0' } }, [t('dev.auditChildRecords')]));

  const sections = [
    ['paddockWindows', 'eventPaddockWindows', (r) => r.eventId === event.id],
    ['groupWindows',   'eventGroupWindows',   (r) => r.eventId === event.id],
    ['feedEntries',    'eventFeedEntries',    (r) => r.eventId === event.id],
    ['feedChecks',     'eventFeedChecks',     (r) => r.eventId === event.id],
    ['feedCheckItems', 'eventFeedCheckItems', (r) => {
      const checkIds = new Set(getAll('eventFeedChecks').filter(c => c.eventId === event.id).map(c => c.id));
      return checkIds.has(r.feedCheckId);
    }],
    ['observations',   'paddockObservations', (r) => r.eventId === event.id || r.sourceId === event.id],
  ];

  for (const [label, entityType, predicate] of sections) {
    const rows = getAll(entityType).filter(predicate);
    const details = el('details', { 'data-testid': `dev-audit-table-${label}`, style: { marginBottom: '6px' } });
    details.appendChild(el('summary', { style: { fontSize: '12px', cursor: 'pointer', padding: '4px 0' } }, [
      `${label} · ${rows.length} row(s)`,
    ]));
    if (rows.length) {
      details.appendChild(el('pre', { style: { fontSize: '10px', overflow: 'auto', maxHeight: '240px', padding: '6px', background: 'var(--bg-2, #f6f6f6)' } }, [
        text(JSON.stringify(rows, null, 2)),
      ]));
    }
    card.appendChild(details);
  }

  container.appendChild(card);
}

/** Section 5 — calc cards. Registry-driven per OI-0144. */
function renderCalcCards(container, event) {
  if (!event) return;
  const card = el('div', { className: 'card', 'data-testid': 'dev-audit-calc-cards', style: { padding: 'var(--space-3)', marginTop: 'var(--space-3)' } });
  card.appendChild(el('h2', { style: { fontSize: '14px', margin: '0 0 6px 0' } }, [t('dev.auditCalcCards')]));

  const calcs = getAllCalcs();
  const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' } });

  const ctx = { eventId: event.id };
  let surfaced = 0;
  for (const calc of calcs) {
    const result = resolveCalcForCalcCard(calc.name, ctx);
    if (!result) continue; // No resolver yet for this calc — skipped per OI-0144 architecture.
    surfaced++;

    const calcCard = el('div', {
      'data-testid': `dev-audit-calc-card-${calc.name}`,
      style: { padding: '10px', border: '0.5px solid var(--border2)', borderRadius: '4px', background: 'var(--bg)' },
    });
    calcCard.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '4px' } }, [calc.name]));
    calcCard.appendChild(el('div', { style: { fontSize: '10px', color: 'var(--text2)', marginBottom: '6px' } }, [calc.description || '']));

    if (!result.applicable) {
      calcCard.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--text2)', fontStyle: 'italic' } }, [
        result.reason || t('dev.auditCalcNotApplicable'),
      ]));
    } else {
      for (const inst of result.instances) {
        const block = el('div', { style: { marginTop: '6px', paddingTop: '6px', borderTop: '0.5px dashed var(--border)' } });
        if (inst.label) block.appendChild(el('div', { style: { fontSize: '11px', fontWeight: '500', marginBottom: '4px' } }, [inst.label]));
        for (const inp of inst.inputs) {
          block.appendChild(el('div', { style: { fontSize: '10px', fontFamily: 'monospace', color: inp.missing ? 'var(--red, #d33)' : 'var(--text)' } }, [
            `${inp.name} = ${inp.value === null ? '∅' : JSON.stringify(inp.value)}`,
            el('span', { style: { color: 'var(--text2)' } }, [` ← ${inp.source}`]),
          ]));
        }
        block.appendChild(el('div', { style: { fontSize: '12px', fontWeight: '600', marginTop: '4px', color: inst.gateStatus === 'ok' ? 'var(--text)' : 'var(--amber)' } }, [
          `${t('dev.auditCalcOutput')}: ${inst.output === null || inst.output === undefined ? '—' : JSON.stringify(inst.output)}`,
        ]));
        if (inst.gateStatus !== 'ok') {
          block.appendChild(el('div', { style: { fontSize: '10px', color: 'var(--amber)' } }, [`gate: ${inst.gateStatus}`]));
        }
        calcCard.appendChild(block);
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

/** Section 6 — DMI bar chart (placeholder for MVP; reuse renderDmiChart in a follow-up). */
function renderDmiBars(container, event) {
  if (!event) return;
  const card = el('div', { className: 'card', 'data-testid': 'dev-audit-dmi-bars', style: { padding: 'var(--space-3)', marginTop: 'var(--space-3)' } });
  card.appendChild(el('h2', { style: { fontSize: '14px', margin: '0 0 6px 0' } }, [t('dev.auditDmiBars')]));
  card.appendChild(el('p', { className: 'form-hint' }, [t('dev.auditDmiBarsTodo')]));
  container.appendChild(card);
}

/** Section 7 — store↔Supabase diff panel (scaffold; live diff lands in follow-up). */
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

  // Sections 2–7.
  renderEventHeader(wrapper, event);
  renderTimeline(wrapper, event);
  renderChildTables(wrapper, event);
  renderCalcCards(wrapper, event);
  renderDmiBars(wrapper, event);
  renderStoreSupabaseDiff(wrapper, event);
}
