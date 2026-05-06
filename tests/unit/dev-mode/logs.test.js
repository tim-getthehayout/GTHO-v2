/** @file OI-0150-B — dev/logs viewer hardening tests.
 *
 * Three behavioral contracts:
 *   1. Search input is debounced at 250ms (filter not re-run on every keystroke).
 *   2. Closed `<details>` rows DO NOT have a `<pre>` child until first toggle
 *      — the `<pre>` is built lazily via the `toggle` listener and memoized
 *      via `data-built="1"`.
 *   3. The "Load more" button uses cursor pagination — second click fires
 *      a Supabase fetch with `lt('created_at', oldestSeen)` and appends rows.
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';

// `vi.mock` factories are hoisted; use `vi.hoisted()` to share state with
// them. The Supabase mock is a chainable builder that records the last
// `.lt(...)` argument so cursor-pagination assertions can read it.
const supabaseMock = vi.hoisted(() => {
  let dataset = [];
  let lastLt = null;
  let calls = 0;
  function buildBuilder() {
    return {
      select: () => buildBuilder(),
      order: () => buildBuilder(),
      lt: (col, val) => { lastLt = { col, val }; return buildBuilder(); },
      limit: (n) => Promise.resolve({
        data: dataset.slice(0, n),
        error: null,
      }),
    };
  }
  return {
    from: (_table) => {
      calls += 1;
      return buildBuilder();
    },
    _setDataset: (d) => { dataset = d; },
    _consumeLastLt: () => { const v = lastLt; lastLt = null; return v; },
    _callCount: () => calls,
    _resetCalls: () => { calls = 0; },
  };
});

vi.mock('../../../src/data/supabase-client.js', () => ({
  supabase: supabaseMock,
}));
vi.mock('../../../src/data/store.js', () => ({
  getOperation: () => ({ id: '00000000-0000-0000-0000-000000000abc' }),
}));
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('../../../src/features/dev-mode/index.js', () => ({
  renderDevModeBadge: () => document.createElement('span'),
}));

import { renderLogsViewer } from '../../../src/features/dev-mode/logs.js';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  document.body.innerHTML = '';
  supabaseMock._resetCalls();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeRow(i, opts = {}) {
  // created_at descends — newer rows have larger second values so a sort
  // by `created_at desc` puts them first.
  return {
    id: `row-${i}`,
    created_at: `2026-05-01T00:00:${String(i).padStart(2, '0')}Z`,
    level: opts.level || 'error',
    source: opts.source || 'audit',
    message: opts.message || `msg ${i}`,
    operation_id: '00000000-0000-0000-0000-000000000abc',
    user_id: 'u',
    session_id: 's',
    context: { i },
    stack: null,
    app_version: '1.0',
  };
}

function mount() {
  const c = document.createElement('div');
  document.body.appendChild(c);
  return c;
}

describe('OI-0150-B logs viewer — search debounce', () => {
  it('does not re-render on each keystroke; only after 250ms idle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    supabaseMock._setDataset([makeRow(1, { message: 'apple pie' }), makeRow(2, { message: 'banana split' })]);
    await renderLogsViewer(mount());

    const list = document.querySelector('[data-testid="dev-logs-list"]');
    expect(list).toBeTruthy();
    // Both rows visible initially.
    expect(list.querySelectorAll('details').length).toBe(2);

    const search = document.querySelector('[data-testid="dev-logs-search"]');
    // Type "apple" → 5 keystrokes. The debounce should NOT have applied
    // any filter yet because the timer hasn't fired.
    for (const ch of 'apple') {
      search.value = (search.value || '') + ch;
      search.dispatchEvent(new Event('input'));
    }
    // Still 2 rows visible — debounce hasn't fired.
    expect(list.querySelectorAll('details').length).toBe(2);

    // Advance fake clock past 250ms.
    vi.advanceTimersByTime(260);

    // Filter now applied — only the apple-pie row matches.
    expect(list.querySelectorAll('details').length).toBe(1);
    expect(list.querySelector('details').textContent).toContain('apple pie');
  });
});

describe('OI-0150-B logs viewer — lazy <pre> rendering', () => {
  it('closed <details> rows have no <pre> child until first toggle', async () => {
    supabaseMock._setDataset([makeRow(1), makeRow(2), makeRow(3)]);
    await renderLogsViewer(mount());

    // Spec contract: querySelectorAll('details:not([open]) pre') === 0.
    const closedPres = document.querySelectorAll('details:not([open]) pre');
    expect(closedPres.length).toBe(0);
  });

  it('opening a row builds its <pre> on first toggle and memoizes via data-built', async () => {
    supabaseMock._setDataset([makeRow(1)]);
    await renderLogsViewer(mount());

    const row = document.querySelector('[data-testid="dev-logs-row-row-1"]');
    expect(row).toBeTruthy();
    expect(row.querySelector('pre')).toBeFalsy();
    expect(row.getAttribute('data-built')).toBeFalsy();

    // Simulate the user opening the disclosure.
    row.open = true;
    row.dispatchEvent(new Event('toggle'));

    expect(row.querySelector('pre')).toBeTruthy();
    expect(row.getAttribute('data-built')).toBe('1');

    // Second toggle (re-close + re-open) must NOT re-build.
    row.open = false;
    row.dispatchEvent(new Event('toggle'));
    row.open = true;
    row.dispatchEvent(new Event('toggle'));
    expect(row.querySelectorAll('pre').length).toBe(1);
  });
});

describe('OI-0150-B logs viewer — Load more cursor pagination', () => {
  it('Load more button is hidden when first page returns < FETCH_LIMIT rows', async () => {
    // Only 5 rows; FETCH_LIMIT = 200 means first page is short.
    supabaseMock._setDataset(Array.from({ length: 5 }, (_, i) => makeRow(i + 1)));
    await renderLogsViewer(mount());
    const btn = document.querySelector('[data-testid="dev-logs-load-more"]');
    expect(btn).toBeTruthy();
    expect(btn.style.display).toBe('none');
  });

  it('Load more reveals when first page is full and cursor advances on click', async () => {
    // 200 rows: first page hits FETCH_LIMIT exactly → Load more reveals.
    const fullPage = Array.from({ length: 200 }, (_, i) => makeRow(i + 1));
    supabaseMock._setDataset(fullPage);
    await renderLogsViewer(mount());

    const btn = document.querySelector('[data-testid="dev-logs-load-more"]');
    expect(btn.style.display).not.toBe('none');

    // Click → second fetch with .lt('created_at', oldest cursor).
    btn.click();
    // Wait one microtask cycle for the async click handler.
    await new Promise(r => setTimeout(r, 0));
    const lt = supabaseMock._consumeLastLt();
    expect(lt).toBeTruthy();
    expect(lt.col).toBe('created_at');
    // The cursor is the oldest row's created_at — for our 200-row dataset
    // that's the last entry's timestamp.
    expect(lt.val).toBe(fullPage[fullPage.length - 1].created_at);
  });
});

describe('OI-0150-B logs viewer — CSV export tooltip documents scope', () => {
  it('CSV export button has a `title` documenting "loaded rows only"', async () => {
    supabaseMock._setDataset([makeRow(1)]);
    await renderLogsViewer(mount());
    const btn = document.querySelector('[data-testid="dev-logs-csv-export"]');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('title') || '').toMatch(/loaded rows only/i);
  });
});
