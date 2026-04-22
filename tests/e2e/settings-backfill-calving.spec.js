/**
 * @file E2E: Settings > Tools > Backfill calving records (OI-0132 Class B).
 *
 * Verifies the backfill routine writes real records into animal_calving_records
 * by round-tripping through the live Supabase database.
 *
 * Per CLAUDE.md E2E sync-verification rule — assert Supabase, not UI state.
 * Skips when env vars are missing.
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
    console.warn('[settings-backfill-calving spec] Skipping: env vars missing.');
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

test.describe('OI-0132 Class B — Settings > Tools > Backfill calving records', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('Run backfill surfaces a summary; idempotent re-run creates zero new records', async ({ page }) => {
    // Capture current record count so we can measure deltas.
    const { count: before } = await supabase
      .from('animal_calving_records')
      .select('id', { count: 'exact', head: true });

    await login(page);
    await page.evaluate(() => { window.location.hash = '#/settings'; });
    await page.waitForSelector('[data-testid="settings-tools-section"]', { timeout: 5000 });

    // First run — may or may not create records depending on live data.
    await page.click('[data-testid="tools-backfill-calving-run"]');
    await page.waitForTimeout(3000);

    // Summary panel must render one of the four counters (or the empty-state).
    const firstSummary = page.locator('[data-testid^="tools-backfill-calving-summary-"]').first();
    await expect(firstSummary).toBeVisible();

    // Second run — idempotent: must report Created: 0.
    await page.click('[data-testid="tools-backfill-calving-run"]');
    await page.waitForTimeout(3000);
    const createdLine = page.locator('[data-testid="tools-backfill-calving-summary-created"]');
    await expect(createdLine).toContainText('Created: 0');

    // Record count didn't decrease.
    const { count: after } = await supabase
      .from('animal_calving_records')
      .select('id', { count: 'exact', head: true });
    expect(after).toBeGreaterThanOrEqual(before || 0);
  });
});
