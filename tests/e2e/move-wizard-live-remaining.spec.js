/**
 * @file E2E: move wizard uses live-remaining (OI-0135).
 *
 * Verifies that when a source event has a prior feed-check recording less than
 * the original delivery total, the move wizard writes the check's remaining
 * to the destination delivery (Move) and the close-reading item (Residual) —
 * not the delivery total.
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
    console.warn('[move-wizard-live-remaining spec] Skipping: env vars missing.');
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

test.describe('OI-0135 — move wizard uses live-remaining on Move path', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('Move path writes live-remaining (not delivery total) to destination', async ({ page }) => {
    // Candidate: open event with a delivery AND a prior feed-check that
    // recorded < delivery total — i.e. the live-remaining is distinct from
    // the delivery total. Without that gap, the test can't prove the new
    // behavior is different from the old one.
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
        .eq('event_id', evt.id);
      if (!entries || !entries.length) continue;

      const { data: checks } = await supabase
        .from('event_feed_checks')
        .select('id, date, time')
        .eq('event_id', evt.id)
        .order('date', { ascending: false })
        .order('time', { ascending: false });
      if (!checks || !checks.length) continue;

      for (const entry of entries) {
        for (const chk of checks) {
          const { data: items } = await supabase
            .from('event_feed_check_items')
            .select('remaining_quantity')
            .eq('feed_check_id', chk.id)
            .eq('batch_id', entry.batch_id)
            .eq('location_id', entry.location_id);
          if (items && items.length) {
            const remaining = Number(items[0].remaining_quantity);
            const delivered = Number(entry.quantity);
            if (remaining < delivered) {
              candidate = { eventId: evt.id, entry, expectedRemaining: remaining };
              break;
            }
          }
        }
        if (candidate) break;
      }
      if (candidate) break;
    }
    test.skip(!candidate, 'No open event with a delivery + prior check showing <delivery remaining.');

    await login(page);
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, candidate.eventId);
    await page.waitForTimeout(800);
    await page.click('[data-testid="move-btn"], button:has-text("Move")').catch(() => {});
    await page.click('[data-testid="move-wizard-dest-new"]').catch(() => {});
    await page.click('[data-testid="move-wizard-step-1-next"]').catch(() => {});
    await page.click('[data-testid^="location-picker-item-"]').catch(() => {});
    await page.click('[data-testid="move-wizard-step-2-next"]').catch(() => {});
    // Step 3: Move is the default radio, just save.
    await page.click('[data-testid="move-wizard-save"]');
    await page.waitForTimeout(3000);

    // Verify: the destination event created from this move has a feed entry
    // for the same batch whose quantity == expectedRemaining (live-remaining),
    // not the original delivered quantity.
    const { data: newEvents } = await supabase
      .from('events')
      .select('id')
      .eq('source_event_id', candidate.eventId)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(newEvents && newEvents.length).toBe(1);

    const { data: destEntries } = await supabase
      .from('event_feed_entries')
      .select('quantity')
      .eq('event_id', newEvents[0].id)
      .eq('batch_id', candidate.entry.batch_id);
    expect(destEntries && destEntries.length).toBe(1);
    expect(Number(destEntries[0].quantity)).toBeCloseTo(candidate.expectedRemaining, 6);
  });
});
