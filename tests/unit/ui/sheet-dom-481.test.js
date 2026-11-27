/** @file #481 — shared ensureSheetDOM(): same shell DOM as the former per-feature copies. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { el } from '../../../src/ui/dom.js';
import { ensureSheetDOM } from '../../../src/ui/sheet.js';

beforeEach(() => { document.body.innerHTML = ''; });

describe('ensureSheetDOM', () => {
  it('standard shell (wrap z-index, backdrop, panel id) matches the legacy DOM', () => {
    expect(ensureSheetDOM({ wrapId: 'heat-sheet-wrap', panelId: 'heat-sheet-panel', zIndex: '210', onBackdropClick: () => {} })).toBe(true);
    const legacy = el('div', { className: 'sheet-wrap', id: 'heat-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop' }),
      el('div', { className: 'sheet-panel', id: 'heat-sheet-panel' }),
    ]);
    expect(document.body.innerHTML).toBe(legacy.outerHTML);
  });

  it('panel style (health sheets, move-feed-out, event detail)', () => {
    const panelStyle = { maxWidth: '720px', margin: '0 auto', overflowY: 'auto', maxHeight: 'min(100dvh, 100vh)' };
    ensureSheetDOM({ wrapId: 'event-detail-sheet-wrap', panelId: 'event-detail-sheet-panel', zIndex: '200', panelStyle });
    const legacy = el('div', { className: 'sheet-wrap', id: 'event-detail-sheet-wrap', style: { zIndex: '200' } }, [
      el('div', { className: 'sheet-backdrop' }),
      el('div', { className: 'sheet-panel', id: 'event-detail-sheet-panel', style: panelStyle }),
    ]);
    expect(document.body.innerHTML).toBe(legacy.outerHTML);
  });

  it('testids + panel children, no z-index (past-event detail, todo sheet)', () => {
    ensureSheetDOM({
      wrapId: 'past-event-detail-sheet-wrap', wrapTestId: 'past-event-detail-sheet',
      backdropTestId: 'past-event-detail-backdrop', panelTestId: 'past-event-detail-panel',
      panelChildren: () => [el('div', { className: 'sheet-handle' }), el('div', { id: 'past-event-detail-sheet-content' })],
    });
    const legacy = el('div', { className: 'sheet-wrap', id: 'past-event-detail-sheet-wrap', 'data-testid': 'past-event-detail-sheet' }, [
      el('div', { className: 'sheet-backdrop', 'data-testid': 'past-event-detail-backdrop' }),
      el('div', { className: 'sheet-panel', 'data-testid': 'past-event-detail-panel' }, [
        el('div', { className: 'sheet-handle' }),
        el('div', { id: 'past-event-detail-sheet-content' }),
      ]),
    ]);
    expect(document.body.innerHTML).toBe(legacy.outerHTML);
  });

  it('is a no-op when the wrap already exists (children not rebuilt)', () => {
    const children = vi.fn(() => [el('div', { id: 'c' })]);
    const spec = { wrapId: 'todo-sheet-wrap', wrapTestId: 'todo-sheet', panelChildren: children };
    expect(ensureSheetDOM(spec)).toBe(true);
    expect(ensureSheetDOM(spec)).toBe(false);
    expect(document.querySelectorAll('#todo-sheet-wrap')).toHaveLength(1);
    expect(children).toHaveBeenCalledTimes(1);
  });

  it('backdrop click calls onBackdropClick', () => {
    const close = vi.fn();
    ensureSheetDOM({ wrapId: 'w', panelId: 'p', zIndex: '230', onBackdropClick: close });
    document.querySelector('#w .sheet-backdrop').click();
    expect(close).toHaveBeenCalledTimes(1);
    document.querySelector('#p').click();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
