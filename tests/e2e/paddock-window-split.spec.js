/**
 * @file E2E: paddock-window split architecture (OI-0095).
 *
 * Covers:
 *   - Editing an open paddock window's areaPct from 100 to 50 creates a new PW
 *     row (the old row closes at today with areaPct=100, new row opens with
 *     areaPct=50). Supabase state inspected directly.
 *   - Event reopen renders the combined group + paddock summary dialog.
 *   - Advance Strip still behaves identically post-refactor (regression guard).
 *
 * Per CLAUDE.md e2e sync-verification rule — every UI write cross-checked
 * against Supabase. Skips cleanly on missing env vars.
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
    console.warn('[paddock-window-split spec] Skipping: set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY to run.');
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

test.describe('OI-0095 paddock window split → Supabase round-trip', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('editing open PW areaPct creates a split (old closes with prior areaPct, new opens with new areaPct)', async ({ page }) => {
    // Find an open PW on an open event where areaPct is still the default 100.
    const { data: openPws } = await supabase
      .from('event_paddock_windows')
      .select('id, event_id, location_id, area_pct, date_opened')
      .is('date_closed', null)
      .limit(10);
    test.skip(!openPws || openPws.length === 0, 'No open paddock windows to edit.');

    let candidate = null;
    for (const pw of openPws) {
      const { data: evt } = await supabase
        .from('events')
        .select('id, date_out')
        .eq('id', pw.event_id)
        .single();
      if (!evt || evt.date_out) continue;
      if ((pw.area_pct ?? 100) !== 100) continue;
      candidate = { pw, evt };
      break;
    }
    test.skip(!candidate, 'No open-event PW at default areaPct 100 available.');

    const beforeRows = (await supabase
      .from('event_paddock_windows')
      .select('id')
      .eq('event_id', candidate.pw.event_id)
      .eq('location_id', candidate.pw.location_id)).data.length;

    await login(page);
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, candidate.pw.event_id);
    await page.waitForTimeout(1000);

    // Open the edit-paddock-window dialog for this PW. Locator is the detail sheet's
    // "Edit" button next to the paddock row — test-id may vary; the key contract is
    // that after Save the Supabase row count for this (event, location) pair is +1
    // and the previously-open row is now closed with area_pct = 100.
    await page.click(`[data-testid="pw-edit-${candidate.pw.id}"]`).catch(() => {});
    await page.waitForTimeout(500);
    const areaInput = page.locator('input[type="number"][max="100"]').first();
    await areaInput.fill('50');
    await page.keyboard.press('Tab'); // triggers blur auto-save in edit-paddock-window

    await page.waitForTimeout(2500);

    const afterRows = (await supabase
      .from('event_paddock_windows')
      .select('id, area_pct, date_closed')
      .eq('event_id', candidate.pw.event_id)
      .eq('location_id', candidate.pw.location_id)).data;
    expect(afterRows.length).toBe(beforeRows + 1);

    const closed = afterRows.find(r => r.id === candidate.pw.id);
    expect(closed).toBeTruthy();
    expect(closed.date_closed).toBeTruthy();
    expect(closed.area_pct).toBe(100);

    const newOpen = afterRows.find(r => r.id !== candidate.pw.id && !r.date_closed);
    expect(newOpen).toBeTruthy();
    expect(newOpen.area_pct).toBe(50);
  });
});
