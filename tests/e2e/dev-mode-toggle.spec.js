/**
 * @file E2E: owner flips Dev Mode access on another member; Supabase reflects
 * the change (OI-0138, phase 4).
 *
 * Per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI" — the
 * load-bearing assertion is the round-trip on `operation_members.is_dev`,
 * not the UI checkbox state.
 *
 * Skips when env vars are missing or no candidate non-owner member exists.
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
    console.warn('[dev-mode-toggle spec] Skipping: env vars missing.');
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

test.describe('OI-0138 — Dev Mode access toggle (member-management)', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('owner flips dev access on a non-owner member; Supabase reflects the change', async ({ page }) => {
    // Find a candidate non-owner member to flip. Skip cleanly if there aren't
    // any (single-owner operation).
    const { data: members } = await supabase
      .from('operation_members')
      .select('id, role, is_dev, user_id')
      .neq('role', 'owner')
      .not('user_id', 'is', null)
      .limit(5);
    test.skip(!members || members.length === 0, 'No non-owner accepted member to flip.');

    const target = members[0];
    const before = target.is_dev === true;
    const expectedAfter = !before;

    await login(page);
    await page.evaluate(() => { window.location.hash = '#/settings'; });
    await page.waitForTimeout(800);

    // Open member management. Selector varies by layout; the manage button
    // is keyed off `members.manage` which interpolates the count, so match by
    // testid.
    await page.click('[data-testid="members-manage-btn"], button:has-text("Manage members")').catch(() => {});
    await page.waitForTimeout(500);

    // Wait for the row to render.
    const toggle = page.locator(`[data-testid="member-dev-toggle-${target.id}"]`);
    await expect(toggle).toBeVisible({ timeout: 5000 });

    // Flip.
    await toggle.click();
    await page.waitForTimeout(2500);

    // Round-trip: the row's is_dev in Supabase matches the new state.
    const { data: after } = await supabase
      .from('operation_members')
      .select('is_dev')
      .eq('id', target.id)
      .single();
    expect(after?.is_dev).toBe(expectedAfter);

    // Restore previous state so the test is idempotent.
    await supabase
      .from('operation_members')
      .update({ is_dev: before })
      .eq('id', target.id);
  });
});
