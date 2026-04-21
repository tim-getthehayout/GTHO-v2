/**
 * @file E2E: Forage Types Settings card creates a Supabase row (OI-0125 / SP-13).
 *
 * Per CLAUDE.md §E2E, UI-only assertions are insufficient — the app reads from
 * localStorage first, so we must verify the new `forage_types` row lands in
 * Supabase.
 *
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
    console.warn('[forage-types-settings spec] Skipping: env vars missing.');
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

test.describe('OI-0125 — Forage Types Settings UI round-trips to Supabase', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('Add creates a forage_types row with operation_id of the active op', async ({ page }) => {
    // Find active operation from the first available operation the user can read.
    const { data: ops } = await supabase.from('operations').select('id').limit(1);
    test.skip(!ops || !ops.length, 'No operations available.');
    const operationId = ops[0].id;

    const testName = `E2E Forage ${Date.now()}`;

    await login(page);
    await page.evaluate(() => { window.location.hash = '#/settings'; });
    await page.waitForSelector('[data-testid="settings-forage-types"]', { timeout: 5000 });

    await page.click('[data-testid="settings-forage-add"]');
    await page.fill('[data-testid="forage-sheet-name"]', testName);
    await page.fill('[data-testid="forage-sheet-dmPct"]', '32');
    await page.click('[data-testid="forage-sheet-save"]');

    // Wait for sync to flush.
    await page.waitForTimeout(3000);

    const { data } = await supabase
      .from('forage_types')
      .select('id, operation_id, name, dm_pct, is_seeded')
      .eq('operation_id', operationId)
      .eq('name', testName);
    expect(data && data.length).toBe(1);
    expect(Number(data[0].dm_pct)).toBe(32);
    expect(data[0].is_seeded).toBe(false);

    // Cleanup — delete the row via the client so we don't leave test data.
    await supabase.from('forage_types').delete().eq('id', data[0].id);
  });
});
