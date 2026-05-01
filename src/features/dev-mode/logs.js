/** @file OI-0138 Phase 6 — Error log viewer over `app_logs`.
 *
 * Route: `#/dev/logs`. Queries Supabase directly (the `appLogs` entity is
 * registered in the store but write-once / Supabase-only — never pulled
 * back to local state). MVP fetches the most recent 1000 rows and filters
 * client-side; if log volume grows beyond that, server-side paging is the
 * follow-up.
 */

import { el, clear, text } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { supabase } from '../../data/supabase-client.js';
import { logger } from '../../utils/logger.js';
import { getOperation } from '../../data/store.js';
import { renderDevModeBadge } from './index.js';

const FETCH_LIMIT = 1000;
const SEVERITIES = ['error', 'warn', 'info', 'debug'];

function severityBadgeColor(level) {
  if (level === 'error') return 'red';
  if (level === 'warn') return 'amber';
  if (level === 'info') return 'green';
  return 'outline';
}

function escapeCsv(v) {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv(rows) {
  const headers = ['created_at', 'level', 'source', 'message', 'operation_id', 'user_id', 'session_id', 'context', 'stack', 'app_version'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => escapeCsv(r[h])).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `app_logs_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Render the Error log viewer.
 * @param {HTMLElement} container
 */
export async function renderLogsViewer(container) {
  clear(container);
  const wrapper = el('div', {
    className: 'dev-logs-viewer',
    'data-testid': 'dev-logs-viewer',
    style: { padding: 'var(--space-3)' },
  });
  container.appendChild(wrapper);

  // Header
  wrapper.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-3)' } }, [
    el('h1', { className: 'screen-heading', style: { margin: 0, fontSize: '18px' } }, [t('dev.logsTitle')]),
    renderDevModeBadge(),
  ]));

  // State
  let allRows = [];
  let filtered = [];
  let filters = {
    severities: new Set(SEVERITIES),
    sources: new Set(),
    operationId: getOperation()?.id || null,
    fromDate: '',
    toDate: '',
    search: '',
  };

  const listEl = el('div', { 'data-testid': 'dev-logs-list', style: { marginTop: 'var(--space-3)' } });
  const countEl = el('div', { 'data-testid': 'dev-logs-count', style: { fontSize: '11px', color: 'var(--text2)', marginTop: '4px' } });

  function applyFilters() {
    filtered = allRows.filter(r => {
      if (filters.severities.size && !filters.severities.has(r.level)) return false;
      if (filters.sources.size && !filters.sources.has(r.source)) return false;
      if (filters.operationId && r.operation_id !== filters.operationId) return false;
      if (filters.fromDate && r.created_at < filters.fromDate) return false;
      if (filters.toDate && r.created_at > `${filters.toDate}T23:59:59Z`) return false;
      if (filters.search) {
        const hay = `${r.message || ''} ${JSON.stringify(r.context || {})}`.toLowerCase();
        if (!hay.includes(filters.search.toLowerCase())) return false;
      }
      return true;
    });
    renderList();
  }

  function renderList() {
    clear(listEl);
    countEl.textContent = t('dev.logsCount', { count: filtered.length, total: allRows.length });
    if (!filtered.length) {
      listEl.appendChild(el('p', { className: 'form-hint' }, [t('dev.logsEmpty')]));
      return;
    }
    for (const r of filtered) {
      const row = el('details', {
        'data-testid': `dev-logs-row-${r.id}`,
        style: { padding: '6px 8px', borderBottom: '0.5px solid var(--border)', fontSize: '12px' },
      });
      row.appendChild(el('summary', { style: { cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center' } }, [
        el('span', { style: { fontFamily: 'monospace', color: 'var(--text2)' } }, [r.created_at?.slice(0, 19) || '—']),
        el('span', { className: `badge badge-${severityBadgeColor(r.level)}`, style: { fontSize: '10px' } }, [r.level || 'log']),
        el('span', { style: { fontSize: '11px', color: 'var(--text2)' } }, [r.source || '—']),
        el('span', { style: { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, [r.message || '']),
      ]));
      row.appendChild(el('pre', {
        style: { fontSize: '10px', overflow: 'auto', maxHeight: '320px', padding: '8px', background: 'var(--bg-2, #f6f6f6)', marginTop: '4px' },
      }, [text(JSON.stringify({
        operation_id: r.operation_id, user_id: r.user_id, session_id: r.session_id,
        context: r.context, stack: r.stack, app_version: r.app_version,
      }, null, 2))]));
      listEl.appendChild(row);
    }
  }

  // Filter row
  const filterRow = el('div', {
    'data-testid': 'dev-logs-filters',
    style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: '4px' },
  });

  // Severity multi-select via checkboxes
  const sevGroup = el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
    el('span', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('dev.logsSeverity')]),
  ]);
  for (const lvl of SEVERITIES) {
    sevGroup.appendChild(el('label', { style: { fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '2px' } }, [
      el('input', {
        type: 'checkbox',
        'data-testid': `dev-logs-severity-${lvl}`,
        checked: 'checked',
        onChange: (e) => {
          if (e.target.checked) filters.severities.add(lvl);
          else filters.severities.delete(lvl);
          applyFilters();
        },
      }),
      el('span', {}, [lvl]),
    ]));
  }
  filterRow.appendChild(sevGroup);

  const sourceSelect = el('select', {
    'data-testid': 'dev-logs-source',
    style: { fontSize: '11px', padding: '4px 6px', border: '0.5px solid var(--border2)', borderRadius: '4px', background: 'var(--bg)', fontFamily: 'inherit', color: 'var(--text)' },
    onChange: (e) => {
      filters.sources = e.target.value ? new Set([e.target.value]) : new Set();
      applyFilters();
    },
  });
  sourceSelect.appendChild(el('option', { value: '' }, [t('dev.logsSourceAll')]));
  filterRow.appendChild(el('label', { style: { fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' } }, [
    el('span', { style: { color: 'var(--text2)' } }, [t('dev.logsSource')]),
    sourceSelect,
  ]));

  const fromInput = el('input', {
    type: 'date',
    'data-testid': 'dev-logs-from',
    style: { fontSize: '11px', padding: '4px 6px', border: '0.5px solid var(--border2)', borderRadius: '4px', background: 'var(--bg)', fontFamily: 'inherit', color: 'var(--text)' },
    onChange: (e) => { filters.fromDate = e.target.value ? `${e.target.value}T00:00:00Z` : ''; applyFilters(); },
  });
  const toInput = el('input', {
    type: 'date',
    'data-testid': 'dev-logs-to',
    style: { fontSize: '11px', padding: '4px 6px', border: '0.5px solid var(--border2)', borderRadius: '4px', background: 'var(--bg)', fontFamily: 'inherit', color: 'var(--text)' },
    onChange: (e) => { filters.toDate = e.target.value; applyFilters(); },
  });
  filterRow.appendChild(el('label', { style: { fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' } }, [el('span', {}, [t('dev.logsFrom')]), fromInput]));
  filterRow.appendChild(el('label', { style: { fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' } }, [el('span', {}, [t('dev.logsTo')]), toInput]));

  const searchInput = el('input', {
    type: 'text',
    'data-testid': 'dev-logs-search',
    placeholder: t('dev.logsSearchPlaceholder'),
    style: { fontSize: '11px', padding: '4px 6px', border: '0.5px solid var(--border2)', borderRadius: '4px', background: 'var(--bg)', fontFamily: 'inherit', color: 'var(--text)', flex: '1', minWidth: '120px' },
    onInput: (e) => { filters.search = e.target.value; applyFilters(); },
  });
  filterRow.appendChild(searchInput);

  filterRow.appendChild(el('button', {
    className: 'btn btn-outline btn-xs',
    'data-testid': 'dev-logs-csv-export',
    onClick: () => exportCsv(filtered),
  }, [t('dev.logsExportCsv')]));

  wrapper.appendChild(filterRow);
  wrapper.appendChild(countEl);
  wrapper.appendChild(listEl);

  // Fetch
  if (!supabase) {
    listEl.appendChild(el('p', { className: 'form-hint' }, [t('dev.logsNoSupabase')]));
    return;
  }
  try {
    const { data, error } = await supabase
      .from('app_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT);
    if (error) throw error;
    allRows = data || [];
  } catch (err) {
    logger.error('dev-mode', 'Failed to fetch app_logs', { error: err.message });
    listEl.appendChild(el('p', { className: 'auth-error' }, [t('dev.logsFetchFailed')]));
    return;
  }

  // Populate distinct source dropdown.
  const distinctSources = Array.from(new Set(allRows.map(r => r.source).filter(Boolean))).sort();
  for (const src of distinctSources) {
    sourceSelect.appendChild(el('option', { value: src }, [src]));
  }

  applyFilters();
}
