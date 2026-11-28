/**
 * #436 / OI-0281 at a mocked ceiling 51 (052 held; the pre-release state and
 * any client still below 52). Released at the real ceiling 52 — see
 * stored-feed-plan-436.test.js. Nothing is written, pulled, exported or
 * restored for the new tables, and the Feed card / Home tile stay hidden.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/data/schema-release.js', async original => {
  const actual = await original();
  const RELEASED_SCHEMA_VERSION = 51;
  return {
    ...actual,
    RELEASED_SCHEMA_VERSION,
    HELD_SCHEMA_VERSIONS: [52],
    isStoredFeedPlanReleased: (ceiling = RELEASED_SCHEMA_VERSION) => ceiling >= actual.STORED_FEED_PLAN_SCHEMA_VERSION,
    isTableReleased: (table, ceiling = RELEASED_SCHEMA_VERSION) => actual.isTableReleased(table, ceiling),
  };
});
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { _reset, mergeRemote, setSyncAdapter } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import {
  RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, STAGED_TABLES, STAGED_COLUMNS,
  STORED_FEED_PLAN_SCHEMA_VERSION, isStoredFeedPlanReleased, isTableReleased,
} from '../../src/data/schema-release.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';
import { BACKUP_TABLES } from '../../src/data/backup-export.js';
import { BROWSER_FK_ORDER } from '../../src/data/backup-import.js';
import * as Plan from '../../src/entities/stored-feed-plan.js';
import * as PlanRow from '../../src/entities/stored-feed-plan-row.js';
import { renderStoredFeedPlanCard, homeStoredFeedPlanTile } from '../../src/features/feed/stored-feed-plan-card.js';
import { renderFeedScreen } from '../../src/features/feed/index.js';
import { renderDashboard } from '../../src/features/dashboard/index.js';

const OP = '00000000-0000-4000-8000-0000000436b1';
const FARM = '00000000-0000-4000-8000-0000000436b2';
const root = resolve(import.meta.dirname, '../..');

beforeEach(() => {
  setLocale('en', en);
  _reset();
  document.body.replaceChildren();
  setSyncAdapter(null);
  mergeRemote('operations', [{ id: OP, name: 'Op', unitSystem: 'metric' }]);
  mergeRemote('farms', [{ id: FARM, operationId: OP, name: 'Home' }]);
  mergeRemote('userPreferences', [{ id: 'p1', userId: 'user', activeFarmId: FARM }]);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('#436 schema 052 is held at a mocked ceiling 51', () => {
  it('mocked ceiling 51; 052 is held with the locked staged columns and tables', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(51);
    expect(STORED_FEED_PLAN_SCHEMA_VERSION).toBe(52);
    expect(HELD_SCHEMA_VERSIONS).toEqual([52]);
    expect(isStoredFeedPlanReleased()).toBe(false);
    expect(isTableReleased('stored_feed_plans')).toBe(false);
    expect(isTableReleased('stored_feed_plan_rows')).toBe(false);
    expect(isTableReleased('stored_feed_plans', 52)).toBe(true);
    expect(STAGED_TABLES[52]).toEqual(['stored_feed_plans', 'stored_feed_plan_rows']);
    expect(STAGED_COLUMNS[52].stored_feed_plans).toEqual(expect.arrayContaining(['operation_id', 'farm_id', 'period_start', 'period_end']));
    expect(BACKUP_MIGRATIONS[51]).toBeTypeOf('function');
  });

  it('has a 052 migration file that is not applied by this PR', () => {
    const dir = resolve(root, 'supabase/migrations');
    const files = readdirSync(dir).filter(f => f.startsWith('052_'));
    expect(files).toEqual(['052_stored_feed_plan.sql']);
    const sql = readFileSync(resolve(dir, files[0]), 'utf8');
    expect(sql).toMatch(/WRITTEN ONLY \/ NOT APPLIED/);
    expect(sql).toMatch(/CREATE TABLE public\.stored_feed_plans/);
    expect(sql).toMatch(/CREATE TABLE public\.stored_feed_plan_rows/);
    expect(sql).toMatch(/stored_feed_plan_rows_kind_ck/);
    expect(sql).toMatch(/stored_feed_plans_select/);
    expect(sql).toMatch(/stored_feed_plan_rows_delete/);
    expect(sql).toMatch(/UPDATE public\.operations SET schema_version = 52/);
  });

  it('registers the tables in backup export/import in header-then-row order', () => {
    expect(BACKUP_TABLES.stored_feed_plans).toEqual({ paginate: false });
    expect(BACKUP_TABLES.stored_feed_plan_rows).toEqual({ paginate: false });
    const plans = BROWSER_FK_ORDER.indexOf('stored_feed_plans');
    const rows = BROWSER_FK_ORDER.indexOf('stored_feed_plan_rows');
    const farms = BROWSER_FK_ORDER.indexOf('farms');
    expect(farms).toBeGreaterThanOrEqual(0);
    expect(plans).toBeGreaterThan(farms);
    expect(rows).toBe(plans + 1);
  });

  it('refuses toSupabaseShape while the ceiling is 51', () => {
    const plan = Plan.create({
      operationId: OP, farmId: FARM, periodStart: '2026-10-01', periodEnd: '2027-09-30',
    });
    expect(() => Plan.toSupabaseShape(plan)).toThrow();
    const row = PlanRow.create({
      operationId: OP, planId: plan.id, startDate: '2026-10-01', endDate: '2026-10-31', plannedPct: 100,
    });
    expect(() => PlanRow.toSupabaseShape(row)).toThrow();
  });

  it('hides the Feed card and the Home tile while 052 is held', () => {
    expect(renderStoredFeedPlanCard()).toBeNull();
    expect(homeStoredFeedPlanTile('metric')).toBeNull();
    const feed = document.createElement('div');
    document.body.appendChild(feed);
    renderFeedScreen(feed);
    expect(feed.querySelector('[data-testid="feed-stored-plan-card"]')).toBeNull();
    expect(feed.querySelector('[data-testid="feed-screen"]')).toBeTruthy();

    document.body.replaceChildren();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    const home = document.createElement('div');
    document.body.appendChild(home);
    renderDashboard(home);
    expect(home.querySelector('[data-testid="dashboard-plan-savings"]')).toBeNull();
    expect(home.querySelector('.dash-stats-grid--plan')).toBeNull();
  });
});
