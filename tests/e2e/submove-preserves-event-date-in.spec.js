/**
 * @file E2E: sub-move Open must not mutate the parent event's date_in in
 * Supabase (OI-0115).
 *
 * Per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI": after the
 * sub-move Save, query Supabase's `events` row directly and assert
 * `date_in` is byte-for-byte unchanged from the pre-save value. A UI-only
 * check would catch the render-side symptom but not the underlying row
 * write — and this bug IS a real row write, so we have to check the row.
 *
 * Skips cleanly when E2E env vars are missing (same pattern as
 * observation-cards.spec.js, feed-check-save.spec.js, etc.).
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
    console.warn('[submove-preserves-event-date-in spec] Skipping: set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY to run.');
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

test.describe('OI-0115 — sub-move Save preserves event.date_in in Supabase', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('sub-move Save does not overwrite parent event.date_in', async ({ page }) => {
    // Find an open event with at least one paddock window so the dashboard
    // renders a location card we can click Sub-Move on.
    const { data: openEvents } = await supabase
      .from('events')
      .select('id, date_in')
      .is('date_out', null)
      .limit(5);
    test.skip(!openEvents || openEvents.length === 0, 'No open event for sub-move.');

    let candidate = null;
    for (const evt of openEvents) {
      const { data: pws } = await supabase
        .from('event_paddock_windows')
        .select('id')
        .eq('event_id', evt.id)
        .is('date_closed', null)
        .limit(1);
      if (pws && pws.length) { candidate = evt; break; }
    }
    test.skip(!candidate, 'No open event with an open paddock window.');

    const originalDateIn = candidate.date_in;
    expect(originalDateIn).toBeTruthy();

    await login(page);

    // Open the dashboard (default landing) and click Sub-Move on the card.
    await page.waitForTimeout(500);
    const submoveBtn = await page.locator(`[data-testid="dashboard-submove-btn-${candidate.id}"]`).first();
    await submoveBtn.click();
    await page.waitForSelector('[data-testid="submove-open-location-picker"]', { timeout: 4000 });

    // Pick any location in the picker that isn't already in use.
    const firstLoc = await page.locator('[data-testid^="location-picker-item-"]:visible').first();
    await firstLoc.click();

    // Leave date-opened at default (today), fill height enough to satisfy
    // any required-validation, then Save.
    await page.fill('[data-testid="obs-card-forage-height"]', '6').catch(() => {});
    await page.fill('[data-testid="obs-card-forage-cover"]', '80').catch(() => {});
    await page.click('[data-testid="submove-open-save"]');
    await page.waitForTimeout(2500);

    // Supabase verification: the events row's date_in must match the pre-save
    // value byte-for-byte. This is the OI-0115 regression guard — the UI
    // could lie, but the DB row can't.
    const { data: after } = await supabase
      .from('events')
      .select('id, date_in')
      .eq('id', candidate.id)
      .single();
    expect(after).toBeTruthy();
    expect(after.date_in).toBe(originalDateIn);
  });
});
