/**
 * @file E2E: editing the Event Detail hero-line date input writes through to
 * the earliest child paddock window's date_opened (OI-0117). Also asserts
 * that events.date_in / events.time_in columns no longer exist in Supabase.
 *
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
    console.warn('[event-start-write-through spec] Skipping: set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY to run.');
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

test.describe('OI-0117 — Event Detail hero date writes through to earliest child window', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('events.date_in and events.time_in no longer exist in Supabase (migration 028 landed)', async () => {
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'events')
      .in('column_name', ['date_in', 'time_in']);
    // information_schema may not be queryable via PostgREST in all setups; fall back
    // to a direct select that should fail if the column is gone.
    if (!error && data) {
      expect(data.length).toBe(0);
      return;
    }
    // Fallback: try `.select('date_in')` — PostgREST returns a specific error
    // when the column is missing.
    const probe = await supabase.from('events').select('date_in').limit(1);
    expect(probe.error).toBeTruthy();
    expect(String(probe.error.message || '')).toMatch(/date_in/);
  });

  test('editing the hero date updates the earliest child paddock window', async ({ page }) => {
    // Pick any event that has at least one paddock window.
    const { data: pws } = await supabase
      .from('event_paddock_windows')
      .select('id, event_id, date_opened')
      .order('date_opened', { ascending: true })
      .limit(1);
    test.skip(!pws || pws.length === 0, 'No paddock window to edit.');
    const pw = pws[0];
    const originalDate = pw.date_opened;
    // Pick a new value: one day earlier (no sibling would be orphaned).
    const dt = new Date(originalDate + 'T00:00:00');
    dt.setDate(dt.getDate() - 1);
    const newDate = dt.toISOString().slice(0, 10);

    await login(page);
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, pw.event_id);
    // Wait for the summary to render — the date input sits inside the hero block.
    await page.waitForSelector('[data-testid="detail-summary"] input[type="date"]', { timeout: 4000 });
    // Accept the tied-earliest confirm dialog automatically if it fires.
    page.on('dialog', (dialog) => dialog.accept());
    const dateInput = page.locator('[data-testid="detail-summary"] input[type="date"]').first();
    await dateInput.fill(newDate);
    await dateInput.evaluate((el) => { el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(2500);

    // Supabase row assertion: the earliest paddock window's date_opened moved.
    const { data: after } = await supabase
      .from('event_paddock_windows')
      .select('id, date_opened')
      .eq('id', pw.id)
      .single();
    expect(after).toBeTruthy();
    expect(after.date_opened).toBe(newDate);

    // Restore original to keep the fixture clean.
    await supabase.from('event_paddock_windows').update({ date_opened: originalDate }).eq('id', pw.id);
  });
});
