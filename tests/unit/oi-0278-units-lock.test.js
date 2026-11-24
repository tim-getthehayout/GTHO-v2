/**
 * @file OI-0278 S4 — lock-in grep contract (Da: dev-mode exempt), modeled on
 * dev-mode audit-units. Over src/features/** and src/ui/** (not dev-mode/):
 * no 'toImperial' / convert(…,'toImperial'), no 2.20462 / 2.47105 / KG_TO_LBS /
 * HA_TO_ACRES, and no literal ' lbs', ' lb', ' kg', '/ac', ' ac', 'acres',
 * 'kg/t' in string literals — units come from src/utils/units.js.
 *
 * PRE_EXISTING is a frozen ceiling for sites outside the 42-row audit that the
 * brief lists as already-correct inputs (Appendix B "unchanged": location /
 * strip area, event and group-window weight, animal weights, feed and batch
 * weight, harvest weight, spreader capacity, forage height, bale-ring
 * diameter, survey / BRC acres) plus one CSS class name. Counts may only go
 * down; any new file or a higher count fails.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['src/features', 'src/ui'];
const CODE = [/['"]toImperial['"]/g, /2\.20462/g, /2\.47105/g, /\bKG_TO_LBS\b/g, /\bHA_TO_ACRES\b/g];
const LITERAL = [/ lbs?\b/g, / kg\b/g, /\/ac\b/g, / ac\b/g, /acres/g, /kg\/t\b/g];

const PRE_EXISTING = {
  'src/features/amendments/entry.js': 1, // application area hint (input side)
  'src/features/amendments/reference-tables.js': 1, // spreader capacity input
  'src/features/animals/index.js': 2, // class default weight + bulk weight inputs
  'src/features/events/detail.js': 1, // paddock area edit input
  'src/features/events/edit-group-window.js': 1, // group-window weight input
  'src/features/events/edit-paddock-window.js': 1, // BRC acres (calc input)
  'src/features/events/index.js': 1, // event avg weight input
  'src/features/events/open-cohort.js': 1, // BRC acres (calc input)
  'src/features/events/rotation-calendar/calendar-grid.js': 1, // CSS class 'loc-mgmt__no-acres'
  'src/features/events/wizard-shared.js': 3, // strip area inputs
  'src/features/feed/index.js': 2, // feed default / batch weight inputs
  'src/features/feed/plausibility-warning.js': 1, // feed-check warning (input side)
  'src/features/field-mode/index.js': 2, // area inputs
  'src/features/harvest/index.js': 3, // harvest area / weight inputs
  'src/features/health/weight.js': 1, // bulk per-head weight prefill (input)
  'src/features/locations/index.js': 8, // area inputs, sort key 'acres', BRC
  'src/features/observations/_shared.js': 2, // forage height / bale-ring inputs
  'src/features/settings/unit-descriptor.js': 4, // the descriptor itself (OI-0111)
  'src/features/surveys/index.js': 1, // BRC acres (calc input)
};

function listFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'dev-mode') walk(p); } else if (p.endsWith('.js')) out.push(p.split(path.sep).join('/'));
    }
  };
  ROOTS.forEach(walk);
  return out;
}

const stripComments = s => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

export function unitViolations(source) {
  const s = stripComments(source);
  const hits = [];
  for (const re of CODE) for (const m of s.matchAll(re)) hits.push(m[0]);
  for (const m of s.matchAll(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g)) {
    for (const re of LITERAL) for (const x of m[0].matchAll(re)) hits.push(`${x[0].trim()} in ${m[0].slice(0, 50)}`);
  }
  return hits;
}

describe('OI-0278 lock-in: units only through the shared helper', () => {
  const files = listFiles();

  it('scans the render code (sanity)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some(f => f.includes('/dev-mode/'))).toBe(false);
  });

  it('no new hard-coded unit math or unit literals; pre-existing input sites only shrink', () => {
    const over = [];
    for (const f of files) {
      const hits = unitViolations(fs.readFileSync(f, 'utf8'));
      const allowed = PRE_EXISTING[f] ?? 0;
      if (hits.length > allowed) over.push(`${f}: ${hits.length} > ${allowed} ${JSON.stringify(hits)}`);
    }
    expect(over).toEqual([]);
  });

  it('audit rows S3/S4 files are clean (no allowance)', () => {
    for (const f of [
      'src/features/feed/delivery.js', 'src/features/feed/check.js', 'src/features/feed/pool-forms.js',
      'src/features/map/import-sheet.js', 'src/features/amendments/manure.js', 'src/features/amendments/npk-prices.js',
      'src/features/settings/forage-types-section.js', 'src/features/settings/forage-type-sheet.js',
      'src/features/reports/index.js', 'src/features/assistant/farm-reads.js',
    ]) {
      expect([f, unitViolations(fs.readFileSync(f, 'utf8'))]).toEqual([f, []]);
    }
  });

  it('the detector catches each forbidden form', () => {
    expect(unitViolations("const x = convert(v, 'weight', 'toImperial');")).toHaveLength(1);
    expect(unitViolations('const K = 2.20462; const A = 2.47105;')).toHaveLength(2);
    expect(unitViolations('const KG_TO_LBS = 1; HA_TO_ACRES;')).toHaveLength(2);
    expect(unitViolations("el('span', {}, [`${n} lbs DM`, ' kg', '3/ac', '2 ac', 'acres', '9 kg/t'])")).toHaveLength(7); // '9 kg/t' trips ' kg' and 'kg/t'
    expect(unitViolations("// 12 lbs in a comment\nconst ok = formatMeasure(v, 'weight');")).toEqual([]);
  });
});
