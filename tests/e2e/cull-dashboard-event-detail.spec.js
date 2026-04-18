/**
 * @file E2E: Cull updates dashboard + event detail + Supabase round-trip (OI-0091).
 *
 * Verifies that culling an animal mid-event:
 *   - closes its animal_group_membership row on the cull date
 *   - splits the event_group_window (1 closed row w/ stamped live values, 1 new open row)
 *   - dashboard card + event detail §7 + Animals list all show the post-cull count
 *
 * Per CLAUDE.md "E2E Testing — Verify Supabase, Not Just UI" — every UI write
 * is cross-checked against Supabase.
 *
 * Prerequisites:
 *   E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY env vars.
 *   Test requires an existing active event with at least 1 group on it (the
 *   test will pick the first open event_group_window for the authenticated
 *   operation and cull one of its animals). If no matching state exists the
 *   test is skipped with a message rather than failing.
 *
 * Run:
 *   E2E_EMAIL=you@real.com E2E_PASSWORD=pass \
 *     npx playwright test tests/e2e/cull-dashboard-event-detail.spec.js
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
    console.warn('[cull-dashboard spec] Skipping: set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY to run.');
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

test.describe('OI-0091 Cull → dashboard + event detail + Supabase round-trip', () => {
  test.skip(SKIP, 'env vars missing — see file header for prerequisites');

  test('culling one animal splits the group window and updates all surfaces', async ({ page }) => {
    // 1. Pick a victim: first open event_group_window on an open event with >=2 live memberships.
    const { data: openGWs } = await supabase
      .from('event_group_windows')
      .select('id, group_id, event_id, head_count, avg_weight_kg')
      .is('date_left', null)
      .order('date_joined', { ascending: false })
      .limit(20);

    test.skip(!openGWs || openGWs.length === 0, 'No open event_group_windows in Supabase — seed data needed.');

    let chosenGW = null;
    let chosenAnimalId = null;
    for (const gw of openGWs) {
      const { data: evt } = await supabase
        .from('events')
        .select('id, date_out')
        .eq('id', gw.event_id)
        .single();
      if (!evt || evt.date_out) continue; // skip closed events
      const { data: mems } = await supabase
        .from('animal_group_memberships')
        .select('id, animal_id')
        .eq('group_id', gw.group_id)
        .is('date_left', null);
      if (!mems || mems.length < 2) continue;
      chosenGW = gw;
      chosenAnimalId = mems[0].animal_id;
      break;
    }
    test.skip(!chosenGW, 'No suitable open GW with >=2 live memberships found — seed data needed.');

    const beforeHead = (await supabase
      .from('animal_group_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', chosenGW.group_id)
      .is('date_left', null)).count;

    await login(page);

    // 2. Navigate to Animals, open the chosen animal, cull it.
    await page.click('[data-testid="nav-animals"]');
    await page.waitForSelector('[data-testid="animals-screen"]', { timeout: 10000 });
    await page.click(`[data-testid="animal-row-${chosenAnimalId}"]`);
    await page.click('[data-testid="open-cull-sheet"]');
    const cullDate = new Date().toISOString().slice(0, 10);
    await page.fill('input[type="date"]', cullDate);
    await page.selectOption('select', 'Sold');
    await page.click('[data-testid="cull-confirm"]');

    // 3. Allow sync to flush.
    await page.waitForTimeout(3000);

    // 4. Verify Supabase: the chosen gw should now be closed with head_count=beforeHead
    //    stamped, and a new open gw should exist with head_count=beforeHead-1.
    const { data: rowsAfter } = await supabase
      .from('event_group_windows')
      .select('id, head_count, date_joined, date_left')
      .eq('group_id', chosenGW.group_id)
      .eq('event_id', chosenGW.event_id)
      .order('date_joined', { ascending: false });

    const closed = rowsAfter.find(r => r.id === chosenGW.id);
    expect(closed, 'original window should still exist').toBeTruthy();
    expect(closed.date_left, 'original window should be closed on cull date').toBe(cullDate);
    expect(closed.head_count, 'closed window stamps live head at close date').toBe(beforeHead - 1);

    const newOpen = rowsAfter.find(r => r.id !== chosenGW.id && r.date_left === null && r.date_joined === cullDate);
    expect(newOpen, 'a new open window should be created on cull date').toBeTruthy();
    expect(newOpen.head_count, 'new open window should reflect live head count').toBe(beforeHead - 1);

    // 5. Dashboard card should reflect the new head count.
    await page.click('[data-testid="nav-dashboard"]');
    await page.waitForSelector(`[data-testid="dashboard-group-card-${chosenGW.group_id}"]`, { timeout: 10000 });
    const dashCard = await page.textContent(`[data-testid="dashboard-group-card-${chosenGW.group_id}"]`);
    expect(dashCard).toContain(`${beforeHead - 1} head`);

    // 6. Event detail §7 should show the new head count.
    await page.click('[data-testid="nav-events"]');
    await page.waitForTimeout(500);
    // Open the event detail sheet via router
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, chosenGW.event_id);
    await page.waitForSelector(`[data-testid^="detail-group-"]`, { timeout: 10000 });
    const detailRow = await page.textContent(`[data-testid="detail-group-${newOpen.id}"]`);
    expect(detailRow).toContain(`${beforeHead - 1} head`);

    // 7. Membership row closed with reason='cull'.
    const { data: mem } = await supabase
      .from('animal_group_memberships')
      .select('date_left, reason')
      .eq('animal_id', chosenAnimalId)
      .eq('group_id', chosenGW.group_id)
      .eq('date_left', cullDate)
      .single();
    expect(mem.reason).toBe('cull');
  });
});
