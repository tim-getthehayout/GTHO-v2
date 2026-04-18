/**
 * @file E2E: editing time_in on the Event Detail hero line persists to
 * Supabase's events.time_in column (OI-0116).
 *
 * Per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI": the UI
 * could show the new time via localStorage alone. Only the Supabase row
 * assertion proves the sync path actually wrote it.
 *
 * Skips cleanly when E2E env vars are missing.
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
    console.warn('[detail-time-in-editor spec] Skipping: set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY to run.');
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

test.describe('OI-0116 — Event Detail time_in editor writes to Supabase', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('editing the time input persists events.time_in in Supabase', async ({ page }) => {
    // Find any event to edit. Doesn't matter if it has a prior time_in or not.
    const { data: events } = await supabase.from('events').select('id, time_in').limit(1);
    test.skip(!events || events.length === 0, 'No event to edit.');
    const evt = events[0];
    const originalTime = evt.time_in;
    // Pick a new value that's guaranteed different from the original.
    const newTime = originalTime === '06:00' ? '18:00' : '06:00';

    await login(page);
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, evt.id);
    await page.waitForSelector('[data-testid="detail-time-in"]', { timeout: 4000 });

    const timeInput = page.locator('[data-testid="detail-time-in"]');
    await timeInput.fill(newTime);
    // Trigger change — blur is a reliable commit for time inputs across browsers.
    await timeInput.evaluate((el) => { el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(2500);

    // Supabase row assertion.
    const { data: after } = await supabase
      .from('events')
      .select('id, time_in')
      .eq('id', evt.id)
      .single();
    expect(after).toBeTruthy();
    expect(after.time_in).toBe(newTime);
  });
});
