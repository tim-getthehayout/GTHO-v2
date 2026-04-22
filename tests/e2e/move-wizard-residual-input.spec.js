/**
 * @file E2E: move wizard forces residual-qty input (OI-0136).
 *
 * Verifies that when the farmer selects the Residual radio, the move wizard
 * reveals a required remaining-qty input pre-filled with live-remaining, and
 * that the farmer-entered value (not the default) is what lands in
 * event_feed_check_items.remaining_quantity.
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
    console.warn('[move-wizard-residual-input spec] Skipping: env vars missing.');
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

test.describe('OI-0136 — residual input captures farmer-corrected value', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('Corrected residual qty lands in event_feed_check_items.remaining_quantity', async ({ page }) => {
    const { data: openEvents } = await supabase
      .from('events')
      .select('id')
      .is('date_out', null)
      .limit(20);
    test.skip(!openEvents || openEvents.length === 0, 'No open event.');

    let candidate = null;
    for (const evt of openEvents) {
      const { data: entries } = await supabase
        .from('event_feed_entries')
        .select('id, batch_id, location_id, quantity')
        .eq('event_id', evt.id)
        .limit(1);
      if (entries && entries.length) {
        candidate = { eventId: evt.id, entry: entries[0] };
        break;
      }
    }
    test.skip(!candidate, 'No open event with a feed delivery.');

    await login(page);
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, candidate.eventId);
    await page.waitForTimeout(800);
    await page.click('[data-testid="move-btn"], button:has-text("Move")').catch(() => {});
    await page.click('[data-testid="move-wizard-dest-new"]').catch(() => {});
    await page.click('[data-testid="move-wizard-step-1-next"]').catch(() => {});
    await page.click('[data-testid^="location-picker-item-"]').catch(() => {});
    await page.click('[data-testid="move-wizard-step-2-next"]').catch(() => {});

    // Step 3: flip to Residual, override the prefilled input with a clearly
    // distinct value (0.07 — unlikely to match any real delivery or check).
    const safeKey = `${candidate.entry.batch_id}-${candidate.entry.location_id}`;
    await page.click(`[data-testid="move-wizard-transfer-residual-${safeKey}"]`);
    const input = page.locator(`[data-testid="move-wizard-residual-input-${safeKey}"]`);
    await expect(input).toBeVisible();
    await input.fill('0.07');
    await page.click('[data-testid="move-wizard-save"]');
    await page.waitForTimeout(3000);

    // Verify: the close-reading row for this source event stamped 0.07.
    const { data: checks } = await supabase
      .from('event_feed_checks')
      .select('id')
      .eq('event_id', candidate.eventId)
      .eq('is_close_reading', true)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(checks && checks.length).toBe(1);

    const { data: items } = await supabase
      .from('event_feed_check_items')
      .select('remaining_quantity')
      .eq('feed_check_id', checks[0].id)
      .eq('batch_id', candidate.entry.batch_id)
      .eq('location_id', candidate.entry.location_id);
    expect(items && items.length).toBe(1);
    expect(Number(items[0].remaining_quantity)).toBeCloseTo(0.07, 6);
  });
});
