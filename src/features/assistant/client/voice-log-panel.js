/** The voice-to-entry log, opened as a panel from the push-to-talk control.
 * Rows are voice_entry_attempts (time, preview, status, type) plus offline voice
 * notes on this device that have not started an attempt yet. Filters: Today
 * (captured_at on the local day in the operation's timezone), Write, Question,
 * Feedback, How-to, Unfinished and All. */
import { el, clear } from '../../../ui/dom.js';
import { Sheet } from '../../../ui/sheet.js';
import { formatDate } from '../../../utils/date-utils.js';
import { renderNoteReview } from './offline-note-review.js';
import { discardAttempt, unfinishedCount } from './attempts.js';

export const VOICE_LOG_PURPOSE_LABELS = Object.freeze({ write: 'Write', question: 'Question', feedback: 'Feedback', 'how-to': 'How-to' });
export const VOICE_LOG_FILTERS = Object.freeze([['today', 'Today'], ['write', 'Write'], ['question', 'Question'], ['feedback', 'Feedback'], ['how-to', 'How-to'], ['unfinished', 'Unfinished'], ['all', 'All']]);
const STATUS_LABELS = Object.freeze({ unfinished: 'Unfinished', finished: 'Finished', discarded: 'Discarded' });

function ensureSheet() {
  let wrap = document.getElementById('voice-log-sheet-wrap');
  if (!wrap) {
    wrap = el('div', { className: 'sheet-wrap', id: 'voice-log-sheet-wrap', style: { zIndex: '216' } }, [
      el('div', { className: 'sheet-backdrop' }),
      el('div', { className: 'sheet-panel', id: 'voice-log-sheet-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
    ]);
    document.body.appendChild(wrap);
  }
  return { sheet: new Sheet('voice-log-sheet-wrap'), panel: document.getElementById('voice-log-sheet-panel'), wrap };
}

/** The operation's timezone; the device's own when the operation has none. */
export function operationTimezone(deps) {
  const operationId = deps.scope?.().operationId;
  const row = typeof deps.getAll === 'function' ? deps.getAll('operations').find(op => op.id === operationId) : null;
  return row?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Log rows for this operation: attempts and not-yet-used device notes. */
export function voiceLogRows({ deps, notes, log }) {
  const operationId = deps.scope?.().operationId;
  const rows = table => (typeof deps.getAll === 'function' ? deps.getAll(table) : []).filter(row => row.operationId === operationId);
  const attempts = rows('voiceEntryAttempts');
  const noteRows = rows('offlineVoiceNotes');
  const turns = rows('assistantTranscriptTurns');
  const preview = attempt => log?.preview?.(attempt.id)
    ?? turns.filter(turn => turn.conversationId === attempt.conversationId && turn.speaker === 'user').sort((a, b) => a.turnIndex - b.turnIndex)[0]?.text
    ?? '';
  const used = new Set(noteRows.filter(row => row.attemptId).map(row => row.deviceLocalReference));
  return {
    attempts: attempts.map(attempt => ({ kind: 'attempt', attempt, capturedAt: attempt.capturedAt, status: attempt.status, purpose: attempt.purpose, preview: preview(attempt) })),
    notes: notes.filter(note => !used.has(note.id)).map(note => ({ kind: 'note', note, capturedAt: note.capturedAt, status: 'unfinished', purpose: null, preview: 'Voice note saved on this device' })),
    unfinished: unfinishedCount({ attempts, notes, noteRows }),
  };
}

export function matchesFilter(row, filter, timezone, now = new Date()) {
  if (filter === 'all') return true;
  if (filter === 'unfinished') return row.status === 'unfinished';
  if (filter === 'today') return formatDate(row.capturedAt, timezone) === formatDate(now, timezone);
  return row.purpose === filter;
}

/** {deps, notes, log, use(note, text), onChange()} -> {render(filter), close()} */
export function openVoiceLog({ deps, notes, log, use, onChange = () => {}, now = () => new Date() }) {
  const { sheet, panel, wrap } = ensureSheet();
  const status = el('div', { className: 'auth-error', 'data-testid': 'voice-log-status', role: 'status' });
  const list = el('div', { 'data-testid': 'voice-log-list' });
  const say = text => { status.textContent = text; };
  let filter = 'unfinished', renders = 0;
  const tabs = VOICE_LOG_FILTERS.map(([value, label]) => el('button', { className: 'btn btn-outline btn-xs', 'data-testid': `voice-log-filter-${value}`, 'aria-pressed': 'false', onClick: () => { void render(value); } }, [label]));
  clear(panel);
  panel.append(el('div', { className: 'sheet-handle' }), el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' } }, ['Voice log']),
    el('div', { className: 'btn-row', style: { flexWrap: 'wrap' } }, tabs), list, status);
  function line(row) {
    const type = row.kind === 'note' ? 'Voice note' : VOICE_LOG_PURPOSE_LABELS[row.purpose] ?? row.purpose;
    return el('div', { 'data-testid': 'voice-log-meta' }, [`${new Date(row.capturedAt).toLocaleString()} · ${type} · ${STATUS_LABELS[row.status] ?? row.status}`]);
  }
  async function render(next = filter) {
    filter = next;
    const token = ++renders;
    let saved = [];
    try { saved = await notes.list(); } catch { say('Voice notes on this device could not be read.'); }
    if (token !== renders) return; // a later render owns the list
    clear(list);
    for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.testid === `voice-log-filter-${filter}`));
    const timezone = operationTimezone(deps);
    const { attempts, notes: unused } = voiceLogRows({ deps, notes: saved, log });
    const rows = [...unused, ...attempts].filter(row => matchesFilter(row, filter, timezone, now()))
      .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
    for (const row of rows) {
      const item = el('div', { className: 'field', 'data-testid': 'voice-log-item', 'data-kind': row.kind, 'data-status': row.status, 'data-purpose': row.purpose ?? '' }, [line(row), el('div', { 'data-testid': 'voice-log-preview' }, [row.preview || '—'])]);
      if (row.kind === 'note') item.appendChild(renderNoteReview(row.note, { deps, say, use: async (picked, text) => { await use(picked, text); await render(); onChange(); } }));
      else if (row.status === 'unfinished') {
        item.appendChild(el('button', { className: 'btn btn-outline btn-xs', 'data-testid': 'voice-log-discard', onClick: async () => {
          try { await discardAttempt({ persist: deps.persist, scope: deps.scope(), attempt: row.attempt }); await render(); onChange(); } catch (error) { say(error.message); }
        } }, ['Discard']));
      }
      list.appendChild(item);
    }
    if (filter === 'all') {
      for (const event of (log?.events() ?? []).slice().reverse()) {
        if (event.type !== 'entry-target-question') continue;
        list.appendChild(el('div', { 'data-testid': 'voice-log-item', 'data-kind': 'host-event', 'data-status': 'host-event' }, [
          `${new Date(event.at).toLocaleString()} · ${VOICE_LOG_PURPOSE_LABELS[event.purpose] ?? 'Voice'} · GTHO asked: ${event.text}`,
        ]));
      }
    }
    if (!list.childNodes.length) list.appendChild(el('div', {}, [filter === 'unfinished' ? 'Nothing unfinished.' : 'Nothing here.']));
  }
  wrap.querySelector('.sheet-backdrop').onclick = () => sheet.close();
  sheet.open();
  void render();
  return { render, close: () => sheet.close(), get filter() { return filter; } };
}
