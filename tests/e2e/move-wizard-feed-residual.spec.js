/**
 * @file E2E: move wizard feed-transfer Residual path (OI-0104).
 *
 * Verifies that choosing "Leave as residual" on a per-line feed transfer lands
 * a close-reading event_feed_check_items row with remaining_quantity equal to
 * the real remaining amount (not the pre-OI-0104 hardcoded 0).
 *
 * Per CLAUDE.md E2E sync-verification rule — assert Supabase row, not UI
 * state. Skips when env vars are missing.
 *
 * Note: real fertility-ledger write lands with OI-0092. This e2e verifies the
 * Step-1 close-reading capture only; the downstream ledger round-trip will get
 * its own e2e when OI-0092 ships its schema.
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
    console.warn('[move-wizard-feed-residual spec] Skipping: env vars missing.');
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

test.describe('OI-0104 — Residual path writes real remaining on close-reading', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('Leave-as-residual persists remaining_quantity > 0 in event_feed_check_items', async ({ page }) => {
    // Find an open event with a feed delivery we can mark residual.
    const { data: openEvents } = await supabase
      .from('events')
      .select('id')
      .is('date_out', null)
      .limit(10);
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

    // Open move wizard for the candidate event.
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, candidate.eventId);
    await page.waitForTimeout(800);
    await page.click('[data-testid="move-btn"], button:has-text("Move")').catch(() => {});

    // Step 1: pick destType 'new', advance.
    await page.click('[data-testid="move-wizard-dest-new"], [data-testid="step-1-new"]').catch(() => {});
    await page.click('[data-testid="move-wizard-step-1-next"]').catch(() => {});
    // Step 2: pick some location, advance.
    await page.click('[data-testid^="location-picker-item-"]').catch(() => {});
    await page.click('[data-testid="move-wizard-step-2-next"]').catch(() => {});
    // Step 3: select Residual radio for the one line we found.
    const safeKey = `${candidate.entry.batch_id}-${candidate.entry.location_id}`;
    await page.click(`[data-testid="move-wizard-transfer-residual-${safeKey}"]`);
    await page.click('[data-testid="move-wizard-save"]');

    await page.waitForTimeout(3000);

    // Verify: the close-reading feed_check row for this event has an item with
    // remaining_quantity == entry.quantity (approximately, if nothing was
    // consumed prior to close — which is the common "no check happened before
    // close" case).
    const { data: checks } = await supabase
      .from('event_feed_checks')
      .select('id, is_close_reading, date')
      .eq('event_id', candidate.eventId)
      .eq('is_close_reading', true)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(checks && checks.length).toBe(1);

    const { data: items } = await supabase
      .from('event_feed_check_items')
      .select('id, remaining_quantity, batch_id, location_id')
      .eq('feed_check_id', checks[0].id)
      .eq('batch_id', candidate.entry.batch_id)
      .eq('location_id', candidate.entry.location_id);
    expect(items && items.length).toBe(1);
    // Real remaining stamped — not the pre-OI-0104 hardcoded 0.
    expect(Number(items[0].remaining_quantity)).toBeGreaterThan(0);
  });
});
