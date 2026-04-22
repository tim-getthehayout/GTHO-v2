/**
 * @file E2E: Edit Animal damId set round-trips to animal_calving_records (OI-0132 Class A).
 *
 * Verifies the A1 create path end-to-end: open Edit Animal on a calf that has
 * no dam, pick a dam and a birthDate, save, then query Supabase directly to
 * assert a new animal_calving_records row exists with calved_at = birthDate +
 * T12:00:00Z.
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
    console.warn('[dam-calf-bidirectional-sync spec] Skipping: env vars missing.');
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

test.describe('OI-0132 Class A — Edit Animal damId create round-trips to animal_calving_records', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('A1 create: setting damId + birthDate creates a matching calving record in Supabase', async ({ page }) => {
    // Find a calf candidate: a female animal with no damId and no existing
    // calving record. Then find a separate dam candidate (different female).
    const { data: calfCandidates } = await supabase
      .from('animals')
      .select('id, operation_id, dam_id')
      .is('dam_id', null)
      .eq('sex', 'female')
      .limit(20);
    test.skip(!calfCandidates || calfCandidates.length === 0, 'No calf without dam.');

    const calf = calfCandidates[0];
    const { data: damCandidates } = await supabase
      .from('animals')
      .select('id')
      .eq('sex', 'female')
      .eq('operation_id', calf.operation_id)
      .neq('id', calf.id)
      .limit(1);
    test.skip(!damCandidates || damCandidates.length === 0, 'No candidate dam.');

    await login(page);
    await page.evaluate((calfId) => { window.location.hash = `#/animals?edit=${calfId}`; }, calf.id);
    await page.waitForTimeout(800);

    await page.selectOption('[data-testid="edit-animal-dam-select"]', damCandidates[0].id);
    await page.fill('[data-testid="edit-animal-birth-date"]', '2025-03-15');

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(3000);

    const { data: records } = await supabase
      .from('animal_calving_records')
      .select('dam_id, calf_id, calved_at, stillbirth')
      .eq('calf_id', calf.id)
      .eq('dam_id', damCandidates[0].id);
    expect(records && records.length).toBe(1);
    expect(records[0].calved_at.slice(0, 10)).toBe('2025-03-15');
    expect(records[0].stillbirth).toBe(false);
  });
});
