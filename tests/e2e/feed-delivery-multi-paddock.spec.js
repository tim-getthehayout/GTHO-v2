/**
 * @file E2E: feed delivery sheet renders a paddock picker on multi-open-window
 * events and writes the picker's `location_id` to every saved entry (OI-0140).
 *
 * Scans live Supabase for a candidate event with ≥3 open paddock windows. If
 * none exists, skips cleanly. Otherwise navigates the event, opens the
 * delivery sheet, picks the second option, saves a small qty for the first
 * available batch, and round-trips via Supabase to assert the new
 * `event_feed_entries.location_id` matches the picked option (NOT
 * `activePWs[0]`, the unsorted-localStorage shortcut the bug used).
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
    console.warn('[feed-delivery-multi-paddock spec] Skipping: env vars missing.');
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

test.describe('OI-0140 — feed delivery picker writes selected location_id', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('picker is rendered with N options on a multi-window event; save round-trips the picked location_id', async ({ page }) => {
    // Find a candidate event with ≥3 open paddock windows.
    const { data: openEvents } = await supabase
      .from('events')
      .select('id')
      .is('date_out', null)
      .limit(30);
    test.skip(!openEvents || openEvents.length === 0, 'No open event.');

    let candidate = null;
    for (const evt of openEvents) {
      const { data: pws } = await supabase
        .from('event_paddock_windows')
        .select('id, location_id, date_opened, time_opened')
        .eq('event_id', evt.id)
        .is('date_closed', null);
      if (pws && pws.length >= 3) {
        candidate = { eventId: evt.id, paddockWindows: pws };
        break;
      }
    }
    test.skip(!candidate, 'No event with ≥3 open paddock windows.');

    await login(page);
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, candidate.eventId);
    await page.waitForTimeout(800);

    // Open the delivery sheet from the event detail.
    await page.click('[data-testid="open-feed-delivery-btn"], [data-testid="feed-delivery-btn"], button:has-text("Deliver Feed"), button:has-text("Log feeding")').catch(() => {});
    await page.waitForTimeout(500);

    // Picker must be rendered and have one option per open paddock window.
    const select = page.locator('[data-testid="feed-delivery-paddock-picker"]');
    await expect(select).toBeVisible({ timeout: 5000 });
    const options = await select.locator('option').all();
    expect(options.length).toBe(candidate.paddockWindows.length);

    // Pick the second option (must be different from the default top option).
    const secondOptionValue = await options[1].getAttribute('value');
    await select.selectOption(secondOptionValue);

    // Tap the first available batch card to select it; bump qty to 0.5.
    await page.locator('.batch-sel').first().click();
    // The plus button is identified by its '+' textContent inside .qty-btn.
    const plusBtn = page.locator('.qty-btn:has-text("+")').first();
    await plusBtn.click();

    // Save.
    await page.locator('button.btn-green:has-text("Save"), button.btn-green:has-text("Deliver")').first().click();
    await page.waitForTimeout(2500);

    // Round-trip: the most recent event_feed_entries row for this event must
    // carry location_id === picked option (not activePWs[0]).
    const { data: latestEntries } = await supabase
      .from('event_feed_entries')
      .select('id, location_id, created_at')
      .eq('event_id', candidate.eventId)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(latestEntries && latestEntries.length).toBe(1);
    expect(latestEntries[0].location_id).toBe(secondOptionValue);
  });
});
