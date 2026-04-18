/**
 * @file E2E: Edit Animal persists all four previously-silent-drop inputs to Supabase (OI-0099).
 *
 * Before OI-0099, `saveAnimal` silently dropped damId, sireTag, weaned, and
 * confirmedBred on every edit. This spec asserts that after the fix, all four
 * (plus the new weanedDate auto-stamp + back-date edit) round-trip through the
 * UI → store → sync adapter → Supabase. Also verifies the inline Add AI bull
 * path creates an `ai_bulls` row and selects it on the animal.
 *
 * Per CLAUDE.md E2E rule: assert the Supabase row shape directly — not just the
 * UI state, not just localStorage. OI-0050 and OI-0053 exist because this rule
 * was previously missed.
 *
 * Skips cleanly when env vars are absent so local vitest doesn't stall.
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
    console.warn('[edit-animal-silent-drop-inputs spec] Skipping: env vars missing.');
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

test.describe('OI-0099 — Edit Animal four-input persistence with Supabase verification', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('damId + sire (herd) + weaned + weanedDate + confirmedBred all land in Supabase', async ({ page }) => {
    // Find a female animal to edit, plus candidate dam (female) and sire (male).
    const { data: females } = await supabase
      .from('animals').select('id, tag_num, name').eq('sex', 'female').is('active', null).or('active.eq.true').limit(5);
    test.skip(!females || females.length < 2, 'Need ≥2 female animals in live data.');
    const { data: males } = await supabase
      .from('animals').select('id, tag_num, name').eq('sex', 'male').limit(5);
    test.skip(!males || males.length === 0, 'Need ≥1 male animal for herd sire.');

    const heifer = females[0];
    const candidateDam = females.find(a => a.id !== heifer.id);
    const sire = males[0];

    await login(page);
    await page.click('[data-testid="nav-animals"]');
    await page.waitForSelector('[data-testid="animals-screen"]', { timeout: 10000 });
    await page.click(`[data-testid="animal-row-${heifer.id}"]`);

    // Dam
    await page.selectOption('[data-testid="edit-animal-dam-select"]', candidateDam.id);

    // Sire — animal in herd
    await page.click('[data-testid="sire-mode-animal"]');
    await page.click(`[data-testid="sire-animal-${sire.id}"]`);

    // Weaned — check, then back-date
    const weanedCheckboxes = page.locator('input[type="checkbox"]');
    await weanedCheckboxes.nth(0).check();
    await page.fill('[data-testid="edit-animal-weaned-date"]', '2026-04-10');

    // Confirmed bred — check
    await weanedCheckboxes.nth(1).check();

    await page.click('[data-testid="animal-save-btn"], button:has-text("Save")');
    await page.waitForTimeout(3000);

    const { data: saved } = await supabase
      .from('animals')
      .select('dam_id, sire_animal_id, sire_ai_bull_id, weaned, weaned_date, confirmed_bred')
      .eq('id', heifer.id)
      .single();
    expect(saved.dam_id).toBe(candidateDam.id);
    expect(saved.sire_animal_id).toBe(sire.id);
    expect(saved.sire_ai_bull_id).toBeNull();
    expect(saved.weaned).toBe(true);
    expect(saved.weaned_date).toBe('2026-04-10');
    expect(saved.confirmed_bred).toBe(true);
  });

  test('inline Add AI bull creates an ai_bulls row and selects it on the animal in Supabase', async ({ page }) => {
    const { data: females } = await supabase
      .from('animals').select('id').eq('sex', 'female').limit(1);
    test.skip(!females || females.length === 0, 'Need a female animal to edit.');
    const heifer = females[0];

    await login(page);
    await page.click('[data-testid="nav-animals"]');
    await page.waitForSelector('[data-testid="animals-screen"]', { timeout: 10000 });
    await page.click(`[data-testid="animal-row-${heifer.id}"]`);

    await page.click('[data-testid="sire-mode-aiBull"]');
    await page.click('[data-testid="sire-add-ai-bull"]');

    const uniqueName = `E2E Bull ${Date.now()}`;
    await page.fill('[data-testid="add-ai-bull-name"]', uniqueName);
    await page.fill('[data-testid="add-ai-bull-tag"]', 'E2E-TAG');
    await page.fill('[data-testid="add-ai-bull-breed"]', 'Angus');
    await page.click('[data-testid="add-ai-bull-save"]');

    await page.click('button:has-text("Save")');
    await page.waitForTimeout(3000);

    // Bull row exists in Supabase.
    const { data: bulls } = await supabase
      .from('ai_bulls').select('id, name, tag, breed').eq('name', uniqueName);
    expect(bulls && bulls.length).toBe(1);
    expect(bulls[0].tag).toBe('E2E-TAG');
    expect(bulls[0].breed).toBe('Angus');

    // Animal row references the new bull.
    const { data: saved } = await supabase
      .from('animals').select('sire_animal_id, sire_ai_bull_id').eq('id', heifer.id).single();
    expect(saved.sire_ai_bull_id).toBe(bulls[0].id);
    expect(saved.sire_animal_id).toBeNull();
  });
});
