/**
 * @file E2E: Cull Sheet sync verification (OI-0086 / GH-13).
 *
 * Verifies the cull + reactivate flow round-trips to Supabase per the
 * CLAUDE.md sync-verification pattern (don't trust localStorage; query
 * Supabase directly after every UI write).
 *
 * Prerequisites:
 *   E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY env
 *   vars must be set. The test creates a throwaway animal under the test
 *   account, culls it, reactivates it, then deletes it as cleanup.
 *
 * Run:
 *   E2E_EMAIL=you@real.com E2E_PASSWORD=pass \
 *     npx playwright test tests/e2e/cull-sheet.spec.js
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const TEST_EMAIL = process.env.E2E_EMAIL;
const TEST_PASSWORD = process.env.E2E_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const SKIP = !TEST_EMAIL || !TEST_PASSWORD || !SUPABASE_URL || !SUPABASE_ANON_KEY;

let supabase = null;
let testAnimalId = null;

test.beforeAll(async () => {
  if (SKIP) {
    console.warn('[cull-sheet.spec] Skipping: set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY to run.');
    return;
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error) throw new Error(`Supabase auth failed: ${error.message}`);
});

test.afterAll(async () => {
  if (SKIP || !testAnimalId || !supabase) return;
  // Cleanup: remove the throwaway animal + any open memberships
  await supabase.from('animal_group_memberships').delete().eq('animal_id', testAnimalId);
  await supabase.from('animals').delete().eq('id', testAnimalId);
});

async function login(page) {
  await page.goto('/');
  await page.fill('[data-testid="auth-email"]', TEST_EMAIL);
  await page.fill('[data-testid="auth-password"]', TEST_PASSWORD);
  await page.click('[data-testid="auth-submit"]');
  await page.waitForSelector('[data-testid="app-container"]', { timeout: 10000 });
}

test.describe('OI-0086 Cull Sheet — Supabase round-trip', () => {
  test.skip(SKIP, 'env vars missing — see file header for prerequisites');

  test('cull persists active=false + cullDate + cullReason + cullNotes; reactivate clears them', async ({ page }) => {
    await login(page);

    // 1. Navigate to Animals and add a throwaway test animal via the UI.
    //    (The exact selectors here mirror the data-testid attributes used
    //     by the existing animals screen.)
    await page.click('[data-testid="nav-animals"]');
    await page.waitForSelector('[data-testid="animals-screen"]', { timeout: 10000 });

    // The test assumes a "+ Add animal" button with data-testid="add-animal-btn"
    // and that the resulting sheet exposes form inputs we can fill. If the
    // animals screen does not yet expose these data-testid attributes, this
    // test should be updated as part of OI-0073 (animals-screen v1 parity).
    await page.click('[data-testid="add-animal-btn"]');
    const tagNum = `E2E-${Date.now()}`;
    await page.fill('[data-testid="animal-tag-num"]', tagNum);
    await page.click('[data-testid="animal-save-btn"]');

    // Resolve the new animal's id via Supabase (UI doesn't expose it).
    const { data: rows } = await supabase
      .from('animals')
      .select('id')
      .eq('tag_num', tagNum)
      .limit(1);
    expect(rows?.length).toBe(1);
    testAnimalId = rows[0].id;

    // 2. Open the animal, click Cull, fill the sheet, confirm.
    await page.click(`[data-testid="animal-row-${testAnimalId}"]`);
    await page.click('[data-testid="open-cull-sheet"]');
    await page.fill('input[type="date"]', '2026-04-17');
    await page.selectOption('select', 'Sold');
    await page.fill('input[placeholder*="Buyer"]', 'E2E Buyer');
    await page.click('[data-testid="cull-confirm"]');

    // 3. Allow sync to flush, then query Supabase directly.
    await page.waitForTimeout(2000);
    const { data: culled } = await supabase
      .from('animals')
      .select('active, cull_date, cull_reason, cull_notes')
      .eq('id', testAnimalId)
      .single();
    expect(culled.active).toBe(false);
    expect(culled.cull_date).toBe('2026-04-17');
    expect(culled.cull_reason).toBe('Sold');
    expect(culled.cull_notes).toBe('E2E Buyer');

    // 4. Open membership rows for this animal and confirm any open one
    //    closed on the cull date with reason='cull'.
    const { data: mems } = await supabase
      .from('animal_group_memberships')
      .select('date_left, reason')
      .eq('animal_id', testAnimalId)
      .order('created_at', { ascending: false });
    if (mems && mems.length > 0) {
      const justClosed = mems.find(m => m.date_left === '2026-04-17');
      if (justClosed) expect(justClosed.reason).toBe('cull');
    }

    // 5. Reactivate via the red banner.
    await page.click(`[data-testid="animal-row-${testAnimalId}"]`);
    page.once('dialog', d => d.accept());
    await page.click('[data-testid="reactivate-btn"]');

    await page.waitForTimeout(2000);
    const { data: reactivated } = await supabase
      .from('animals')
      .select('active, cull_date, cull_reason, cull_notes')
      .eq('id', testAnimalId)
      .single();
    expect(reactivated.active).toBe(true);
    expect(reactivated.cull_date).toBeNull();
    expect(reactivated.cull_reason).toBeNull();
    expect(reactivated.cull_notes).toBeNull();
  });
});
