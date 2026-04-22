/** @file OI-0132 Class B — Settings > Tools section smoke test.
 *
 * Verifies the Tools card renders the backfill row with title, description, and
 * Run button; tapping Run invokes the routine and populates the summary panel.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { renderToolsSection } from '../../src/features/settings/tools-section.js';

const OP = '00000000-0000-0000-0000-000000040aa1';
const DAM = '00000000-0000-0000-0000-00000004da01';
const CALF = '00000000-0000-0000-0000-00000004ca01';

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  setLocale('en', enLocale);
});

describe('Settings > Tools section (OI-0132 Class B)', () => {
  it('renders the backfill row with title, description, and Run button', () => {
    document.body.appendChild(renderToolsSection(OP));
    expect(document.querySelector('[data-testid="settings-tools-section"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="tools-backfill-calving-run"]')).toBeTruthy();
    expect(document.body.textContent).toMatch(/Backfill calving records from lineage/);
    expect(document.body.textContent).toMatch(/Safe to re-run/);
  });

  it('Run invokes the routine and renders the summary', async () => {
    add('animals', AnimalEntity.create({
      id: DAM, operationId: OP, tagNum: 'DM-1', sex: 'F', active: true,
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animals', AnimalEntity.create({
      id: CALF, operationId: OP, tagNum: 'CF-1', sex: 'F', active: true,
      damId: DAM, birthDate: '2025-03-15',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');

    document.body.appendChild(renderToolsSection(OP));
    const runBtn = document.querySelector('[data-testid="tools-backfill-calving-run"]');
    runBtn.click();
    // Let the async backfill complete (a few microtasks).
    await new Promise(resolve => setTimeout(resolve, 0));
    await Promise.resolve();

    const createdLine = document.querySelector('[data-testid="tools-backfill-calving-summary-created"]');
    expect(createdLine).toBeTruthy();
    expect(createdLine.textContent).toMatch(/Created: 1/);
    expect(runBtn.textContent).toBe('Run again');
  });

  it('empty operation shows the neutral empty-state message', async () => {
    document.body.appendChild(renderToolsSection(OP));
    const runBtn = document.querySelector('[data-testid="tools-backfill-calving-run"]');
    runBtn.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    await Promise.resolve();

    const empty = document.querySelector('[data-testid="tools-backfill-calving-empty"]');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toMatch(/No calves needed backfilling/);
  });
});
