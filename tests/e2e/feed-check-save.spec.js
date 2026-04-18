/**
 * @file E2E: feed check Save persists to Supabase (OI-0103).
 *
 * Before the fix, check.js:262 passed `checkDate:` to FeedCheckEntity.create;
 * the entity's FIELDS key is `date`, so create() silently dropped the input
 * and the row persisted with date=null → validate rejected → Save appeared
 * to no-op. This spec guards against the regression by verifying the row
 * actually lands in Supabase with a populated `date` column.
 *
 * Per CLAUDE.md E2E sync-verification rule — assert Supabase rows, not UI.
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
    console.warn('[feed-check-save spec] Skipping: set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY to run.');
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

test.describe('OI-0103 — Feed check Save persists row with populated date', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('Save writes event_feed_checks row with non-null date', async ({ page }) => {
    // Find an open event with at least one feed delivery so the check sheet has
    // something to render (items derived from prior deliveries).
    const { data: openEvents } = await supabase
      .from('events')
      .select('id')
      .is('date_out', null)
      .limit(5);
    test.skip(!openEvents || openEvents.length === 0, 'No open event to run feed check on.');
    let eventWithDelivery = null;
    for (const evt of openEvents) {
      const { data: entries } = await supabase
        .from('event_feed_entries')
        .select('id')
        .eq('event_id', evt.id)
        .limit(1);
      if (entries && entries.length) { eventWithDelivery = evt; break; }
    }
    test.skip(!eventWithDelivery, 'No open event with a feed delivery.');

    const checkDate = new Date().toISOString().slice(0, 10);

    await login(page);
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, eventWithDelivery.id);
    await page.waitForTimeout(1000);

    // Open feed check sheet from event detail. Button test-id varies by layout;
    // the core assertion is the Supabase round-trip, not the selector.
    await page.click('[data-testid="open-feed-check-btn"], [data-testid="feed-check-btn"], button:has-text("Feed check")').catch(() => {});
    await page.waitForTimeout(500);
    await page.fill('input[type="date"]', checkDate);
    // Save — the Save button sits at the bottom of the sheet.
    await page.click('button:has-text("Save")');

    await page.waitForTimeout(2500);

    const { data: checksAfter } = await supabase
      .from('event_feed_checks')
      .select('id, date')
      .eq('event_id', eventWithDelivery.id)
      .eq('date', checkDate)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(checksAfter && checksAfter.length).toBe(1);
    expect(checksAfter[0].date).toBe(checkDate);
  });
});
