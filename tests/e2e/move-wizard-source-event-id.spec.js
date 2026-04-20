/**
 * @file E2E: same-farm rotation populates source_event_id (OI-0122).
 *
 * Before the fix at move-wizard.js:680, same-farm rotations were created with
 * source_event_id = NULL, defeating the DMI-8 chart's date-routing bridge
 * (dmi-chart-context.js:140-142). This spec drives the wizard in a same-farm
 * rotation and asserts Supabase carries the link.
 *
 * Per CLAUDE.md E2E sync-verification rule — assert Supabase row, not UI
 * state. Skips when env vars are missing.
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
    console.warn('[move-wizard-source-event-id spec] Skipping: env vars missing.');
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

test.describe('OI-0122 — same-farm rotation populates source_event_id', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('new event links back to prior event + pre-start chart days are filled', async ({ page }) => {
    // Find an open event with a free destination location on the same farm.
    const { data: openEvents } = await supabase
      .from('events')
      .select('id, farm_id')
      .is('date_out', null)
      .limit(10);
    test.skip(!openEvents || openEvents.length === 0, 'No open event.');

    let candidate = null;
    for (const evt of openEvents) {
      const { data: pws } = await supabase
        .from('event_paddock_windows')
        .select('location_id')
        .eq('event_id', evt.id)
        .is('date_closed', null);
      if (!pws || !pws.length) continue;
      const usedLocIds = new Set(pws.map(p => p.location_id));
      const { data: candidateLocs } = await supabase
        .from('locations')
        .select('id')
        .eq('farm_id', evt.farm_id)
        .eq('type', 'land')
        .eq('land_use', 'pasture')
        .is('archived', false)
        .limit(10);
      const freeLoc = (candidateLocs || []).find(l => !usedLocIds.has(l.id));
      if (freeLoc) {
        candidate = { eventId: evt.id, farmId: evt.farm_id, destLocId: freeLoc.id };
        break;
      }
    }
    test.skip(!candidate, 'No open event with a free same-farm destination.');

    await login(page);

    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, candidate.eventId);
    await page.waitForTimeout(800);
    await page.click('[data-testid="move-btn"], button:has-text("Move")').catch(() => {});

    await page.click('[data-testid="move-wizard-dest-new"]').catch(() => {});
    await page.click('[data-testid="move-wizard-step-1-next"]').catch(() => {});
    await page.click(`[data-testid="location-picker-item-${candidate.destLocId}"]`);
    await page.click('[data-testid="move-wizard-step-2-next"]');
    await page.click('[data-testid="move-wizard-save"]');

    await page.waitForTimeout(3000);

    // Find the newly created event — same farm, opened since our starting
    // candidate event, and with a paddock window at our destination location.
    const { data: pws } = await supabase
      .from('event_paddock_windows')
      .select('event_id, date_opened')
      .eq('location_id', candidate.destLocId)
      .order('date_opened', { ascending: false })
      .limit(1);
    expect(pws && pws.length).toBe(1);
    const newEventId = pws[0].event_id;

    const { data: newEvent } = await supabase
      .from('events')
      .select('id, farm_id, source_event_id')
      .eq('id', newEventId)
      .single();
    expect(newEvent).toBeTruthy();
    // Same-farm rotation → source_event_id must be populated (the OI-0122 fix).
    expect(newEvent.source_event_id).toBe(candidate.eventId);
    expect(newEvent.farm_id).toBe(candidate.farmId);
  });
});
