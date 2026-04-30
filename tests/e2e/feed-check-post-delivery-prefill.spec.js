/**
 * @file E2E: feed-check sheet prefill includes deliveries timestamped strictly
 * after the most-recent check (OI-0139).
 *
 * Scans the live DB for any event with a feed check followed by a strictly-
 * later delivery (the Pasture D pattern). Opens the feed-check sheet, asserts
 * the units stepper prefill = latestCheck.remainingQuantity + Σ post-check
 * deliveries for the (batch, location) pair, then saves and verifies the
 * resulting event_feed_check_items.remaining_quantity via Supabase round-trip
 * per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI".
 *
 * Skips cleanly when env vars are missing or no candidate event exists.
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
    console.warn('[feed-check-post-delivery-prefill spec] Skipping: env vars missing.');
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

function stamp(date, time) {
  return `${date}T${time || '00:00'}`;
}

test.describe('OI-0139 — feed-check prefill includes post-check deliveries', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('prefill = latestCheck.remainingQuantity + post-check deliveries; round-trip persists the saved value', async ({ page }) => {
    // Find a candidate (eventId, batchId, locationId) where the latest check
    // has at least one strictly-later delivery for the same pair.
    const { data: openEvents } = await supabase
      .from('events')
      .select('id')
      .is('date_out', null)
      .limit(30);
    test.skip(!openEvents || openEvents.length === 0, 'No open event.');

    let candidate = null;
    for (const evt of openEvents) {
      const { data: entries } = await supabase
        .from('event_feed_entries')
        .select('id, batch_id, location_id, quantity, date, time')
        .eq('event_id', evt.id);
      if (!entries || !entries.length) continue;

      const { data: checks } = await supabase
        .from('event_feed_checks')
        .select('id, date, time')
        .eq('event_id', evt.id)
        .order('date', { ascending: false })
        .order('time', { ascending: false });
      if (!checks || !checks.length) continue;

      // Group entries by (batch, location) and find a pair whose latest check
      // is strictly before at least one delivery.
      const pairs = new Map();
      for (const e of entries) {
        const key = `${e.batch_id}|${e.location_id}`;
        if (!pairs.has(key)) pairs.set(key, { batchId: e.batch_id, locationId: e.location_id, entries: [] });
        pairs.get(key).entries.push(e);
      }

      for (const pair of pairs.values()) {
        // Find latest check item for this pair.
        let latestCheck = null;
        let latestItem = null;
        for (const chk of checks) {
          const { data: items } = await supabase
            .from('event_feed_check_items')
            .select('remaining_quantity')
            .eq('feed_check_id', chk.id)
            .eq('batch_id', pair.batchId)
            .eq('location_id', pair.locationId)
            .limit(1);
          if (items && items.length) {
            latestCheck = chk;
            latestItem = items[0];
            break;
          }
        }
        if (!latestCheck) continue;

        const checkStamp = stamp(latestCheck.date, latestCheck.time);
        const postCheckSum = pair.entries
          .filter(e => stamp(e.date, e.time) > checkStamp)
          .reduce((sum, e) => sum + Number(e.quantity), 0);
        if (postCheckSum > 0) {
          const expected = Number(latestItem.remaining_quantity) + postCheckSum;
          candidate = {
            eventId: evt.id,
            batchId: pair.batchId,
            locationId: pair.locationId,
            expected,
          };
          break;
        }
      }
      if (candidate) break;
    }
    test.skip(!candidate, 'No event with a check followed by a strictly-later delivery for the same (batch, location).');

    await login(page);
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, candidate.eventId);
    await page.waitForTimeout(800);

    // Open the feed-check sheet.
    await page.click('[data-testid="open-feed-check-btn"], [data-testid="feed-check-btn"], button:has-text("Feed check")').catch(() => {});
    await page.waitForTimeout(500);

    // Assert the units stepper prefill matches expected. The stepper is the only
    // input[type=number][step="0.01"] in the panel (the percent input uses 0.5).
    const prefill = await page.locator('#feed-check-sheet-panel input[type="number"][step="0.01"]').first().inputValue();
    expect(Number(prefill)).toBeCloseTo(candidate.expected, 2);

    // Save with the prefill unchanged.
    const checkDate = new Date().toISOString().slice(0, 10);
    await page.fill('input[type="date"]', checkDate);
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(2500);

    // Round-trip: the new event_feed_check_items row carries remaining_quantity == expected.
    const { data: checksAfter } = await supabase
      .from('event_feed_checks')
      .select('id')
      .eq('event_id', candidate.eventId)
      .eq('date', checkDate)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(checksAfter && checksAfter.length).toBe(1);

    const { data: itemsAfter } = await supabase
      .from('event_feed_check_items')
      .select('remaining_quantity')
      .eq('feed_check_id', checksAfter[0].id)
      .eq('batch_id', candidate.batchId)
      .eq('location_id', candidate.locationId);
    expect(itemsAfter && itemsAfter.length).toBe(1);
    expect(Number(itemsAfter[0].remaining_quantity)).toBeCloseTo(candidate.expected, 2);
  });
});
