/**
 * #450 Demo Dairy clone — dry-run validator.
 *
 * Gates: runs every check on a synthetic source (no PGlite).
 * Scratch run on a real snapshot (output stays outside the repo; prints counts only):
 *   DEMO_CLONE_IN_DIR=<CP-55 data_json/> (or DEMO_CLONE_IN=<backup.json>)
 *   DEMO_CLONE_DEMO_OP=<uuid> [DEMO_CLONE_DEMO_USER=<uuid>] [DEMO_CLONE_SOURCE_OP=<uuid>]
 *   DEMO_CLONE_REPORT=/tmp/demo-clone-report.json [DEMO_CLONE_OUT=/tmp/demo-clone.json]
 *   [DEMO_CLONE_SCRUB_NAMES="A,B"]  people's names to strip and then prove absent
 *   DEMO_CLONE_PGLITE=<path to @electric-sql/pglite dist/index.js> DEMO_CLONE_CATALOG=<CP-55 schema-catalog.json>
 *   npx vitest run tests/unit/demo-clone-dryrun.test.js
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cloneOperation, readSnapshotDir, selectSourceOperation, assertOutsideRepo } from '../../scripts/demo-clone.mjs';
import { dryRunReport } from './demo-clone-checks.js';
import { syntheticSource, DEMO_OP, DEMO_USER } from './demo-clone-fixture.js';

describe('#450 dry run · synthetic source', () => {
  it.each([['without', null], ['with', DEMO_USER]])('passes every check (%s demo user)', async (_label, demoUserId) => {
    const source = syntheticSource();
    const { backup, summary } = cloneOperation(source, { demoOperationId: DEMO_OP, demoUserId, today: '2026-11-26' });
    const report = await dryRunReport({ source, selectedTables: selectSourceOperation(globalThis.structuredClone(source)).tables, backup, summary, userPreferences: !!demoUserId });
    expect(report.preflight).toMatchObject({ validateBackup: true, preflightUnits: true, preflightAssistantRestore: true, errors: [] });
    expect(report.fk_integrity.failures, JSON.stringify(report.fk_integrity.failures)).toEqual([]);
    expect(report.fk_integrity.checked).toBeGreaterThan(50);
    expect(report.count_parity_mismatches, JSON.stringify(report.count_parity_mismatches)).toEqual([]);
    expect(report.leftover_source_ids).toBe(0);
    expect(report.real_operation_rows).toBe(0);
    expect(report.sample.milking_groups).toEqual([{ name: 'Cow herd', cows: 12 }]);
    expect(report.sample.milk_pickups).toBe(7);
    expect(report.sample.calf_milk_feedings).toBe(28);
    expect(report.pass).toBe(true);
  });
});

const REAL = process.env.DEMO_CLONE_IN || process.env.DEMO_CLONE_IN_DIR;
describe.runIf(REAL)('#450 dry run · scratch snapshot (opt-in)', () => {
  it('validates a clone of the snapshot', async () => {
    const env = process.env;
    const scrubNames = env.DEMO_CLONE_SCRUB_NAMES ? env.DEMO_CLONE_SCRUB_NAMES.split(',') : [];
    const source = env.DEMO_CLONE_IN ? JSON.parse(fs.readFileSync(env.DEMO_CLONE_IN, 'utf8')) : readSnapshotDir(env.DEMO_CLONE_IN_DIR);
    const { backup, summary } = cloneOperation(source, { demoOperationId: env.DEMO_CLONE_DEMO_OP, demoUserId: env.DEMO_CLONE_DEMO_USER || null, sourceOperationId: env.DEMO_CLONE_SOURCE_OP || null, today: env.DEMO_CLONE_TODAY, scrubNames });
    const selected = selectSourceOperation(globalThis.structuredClone(source), env.DEMO_CLONE_SOURCE_OP || null).tables;
    const pglite = env.DEMO_CLONE_PGLITE && env.DEMO_CLONE_CATALOG ? { pglitePath: env.DEMO_CLONE_PGLITE, catalogPath: env.DEMO_CLONE_CATALOG, extraMigrations: env.DEMO_CLONE_EXTRA_MIGRATIONS ? env.DEMO_CLONE_EXTRA_MIGRATIONS.split(',') : [] } : null;
    const report = await dryRunReport({ source, selectedTables: selected, backup, summary, userPreferences: !!env.DEMO_CLONE_DEMO_USER, pglite, scrubNames });
    if (env.DEMO_CLONE_REPORT) { assertOutsideRepo(env.DEMO_CLONE_REPORT); fs.writeFileSync(env.DEMO_CLONE_REPORT, JSON.stringify({ report, summary_counts: summary.counts, scrubbed: summary.scrubbed }, null, 2)); }
    if (env.DEMO_CLONE_OUT) { assertOutsideRepo(env.DEMO_CLONE_OUT); fs.writeFileSync(env.DEMO_CLONE_OUT, JSON.stringify(backup)); }
    expect(report.pass, JSON.stringify({ preflight: report.preflight, fk: report.fk_integrity, parity: report.count_parity_mismatches, leftover: report.leftover_source_ids, names: report.source_names_left, pglite: report.pglite && { errors: report.pglite.errors, fk: report.pglite.fk_failures, counts: report.pglite.count_mismatches } })).toBe(true);
  }, 120000);
});
