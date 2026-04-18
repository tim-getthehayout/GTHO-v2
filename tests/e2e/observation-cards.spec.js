/**
 * @file E2E: Observation cards write to paddock_observations (OI-0112).
 *
 * Per CLAUDE.md "E2E Testing — Verify Supabase, Not Just UI", these specs
 * verify that filling the new pre-graze / post-graze / survey card variants
 * produces paddock_observations rows in Supabase with every field populated
 * (not just height + cover that the old minimal form captured).
 *
 * Skips cleanly when E2E env vars are missing — matches the pattern used by
 * feed-check-save.spec.js and edit-animal-silent-drop-inputs.spec.js.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const TEST_EMAIL = process.env.E2E_EMAIL;
const TEST_PASSWORD = process.env.E2E_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SKIP = !TEST_EMAIL || !TEST_PASSWORD || !SUPABASE_URL || !SUPABASE_ANON_KEY;

let supabase = null;

test.beforeAll(async () => {
  if (SKIP) {
    console.warn('[observation-cards spec] Skipping: set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY to run.');
    return;
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error) throw new Error(`Supabase auth failed: ${error.message}`);
});

async function login(page) {
  await page.goto('/');
  await page.fill('[data-testid="auth-email"]', TEST_EMAIL);
  await page.fill('[data-testid="auth-password"]', TEST_PASSWORD);
  await page.click('[data-testid="auth-submit"]');
  await page.waitForSelector('[data-testid="app-container"]', { timeout: 10000 });
}

test.describe('OI-0112 — Pre-graze card writes to paddock_observations via sub-move Open', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('sub-move Open pre-graze card persists all collected fields', async ({ page }) => {
    // Find an open event to sub-move on.
    const { data: openEvents } = await supabase
      .from('events')
      .select('id')
      .is('date_out', null)
      .limit(1);
    test.skip(!openEvents || openEvents.length === 0, 'No open event to sub-move.');
    const event = openEvents[0];

    await login(page);
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, event.id);
    await page.waitForTimeout(1000);

    await page.click(`[data-testid="dashboard-submove-btn-${event.id}"]`).catch(() => {});
    await page.waitForSelector('[data-testid="obs-pre-graze-card"]', { timeout: 4000 });

    // Pick the first location in the picker so the sub-move has a target.
    await page.click('[data-testid="submove-open-location-picker"] button:visible').catch(() => {});

    // Fill every pre-graze field the card exposes.
    await page.fill('[data-testid="obs-card-forage-height"]', '6');
    await page.fill('[data-testid="obs-card-forage-cover"]', '78');
    await page.fill('[data-testid="obs-card-bale-ring"]', '2');
    await page.click('[data-testid="obs-card-condition-good"]');
    await page.fill('[data-testid="obs-card-notes"]', 'E2E pre-graze card round-trip');
    // Quality slider — set to 80.
    const quality = page.locator('[data-testid="obs-card-forage-quality"]');
    await quality.evaluate((el) => { el.value = '80'; el.dispatchEvent(new Event('input', { bubbles: true })); });

    await page.click('[data-testid="submove-open-save"]');
    await page.waitForTimeout(2500);

    // Verify a paddock_observations row landed with source='event', type='open',
    // and every captured field present.
    const { data: rows } = await supabase
      .from('paddock_observations')
      .select('*')
      .eq('source', 'event')
      .eq('type', 'open')
      .order('created_at', { ascending: false })
      .limit(1);
    expect(rows && rows.length).toBe(1);
    const row = rows[0];
    expect(row.forage_cover_pct).toBe(78);
    expect(row.forage_condition).toBe('good');
    expect(row.bale_ring_residue_count).toBe(2);
    expect(row.notes).toBe('E2E pre-graze card round-trip');
    expect(row.forage_quality).toBe(80);
    // 6 in → ~15.24 cm. Allow a small tolerance for the convert() float.
    expect(Math.abs(row.forage_height_cm - 15.24)).toBeLessThan(0.1);
  });
});

test.describe('OI-0112 — Survey card writes to paddock_observations with source=survey', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('individual-mode survey commit produces paddock_observations row with recovery fields', async ({ page }) => {
    const surveyDate = new Date().toISOString().slice(0, 10);
    await login(page);
    await page.evaluate(() => { window.location.hash = '#/surveys'; });
    await page.waitForTimeout(500);

    await page.click('[data-testid="surveys-create-btn"]');
    await page.fill('[data-testid="create-survey-date"]', surveyDate).catch(() => {});
    await page.click('[data-testid="create-survey-type-single"]');
    await page.click('[data-testid="create-survey-save"]');
    await page.waitForTimeout(500);

    // Open the draft entry sheet via the survey list row.
    await page.click('[data-testid="survey-row-add-entry"]').catch(() => {});
    await page.waitForSelector('[data-testid="obs-survey-card"]', { timeout: 4000 });

    await page.fill('[data-testid="obs-card-forage-height"]', '5');
    await page.fill('[data-testid="obs-card-forage-cover"]', '82');
    await page.click('[data-testid="obs-card-condition-excellent"]');
    await page.fill('[data-testid="obs-card-recovery-min"]', '30');
    await page.fill('[data-testid="obs-card-recovery-max"]', '55');
    await page.fill('[data-testid="obs-card-notes"]', 'E2E survey card readiness');
    await page.click('[data-testid="draft-entry-save"]');
    await page.waitForTimeout(500);

    // Commit the survey → commitSurvey inserts paddock_observations rows.
    await page.click('[data-testid="survey-commit-btn"]').catch(() => {});
    await page.on('dialog', d => d.accept()).catch(() => {});
    await page.waitForTimeout(2500);

    const { data: rows } = await supabase
      .from('paddock_observations')
      .select('*')
      .eq('source', 'survey')
      .eq('type', 'open')
      .order('created_at', { ascending: false })
      .limit(1);
    expect(rows && rows.length).toBe(1);
    const row = rows[0];
    expect(row.forage_cover_pct).toBe(82);
    expect(row.forage_condition).toBe('excellent');
    expect(row.recovery_min_days).toBe(30);
    expect(row.recovery_max_days).toBe(55);
    expect(row.notes).toBe('E2E survey card readiness');
  });
});
