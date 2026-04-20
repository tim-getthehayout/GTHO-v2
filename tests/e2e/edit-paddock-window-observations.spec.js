/**
 * @file E2E: OI-0118 — Edit Paddock Window dialog pre/post-graze cards
 *   round-trip to Supabase.
 *
 * Verifies that saving a pre-graze observation from the Edit Paddock Window
 * dialog writes a paddock_observations row (source='event', type='open',
 * source_id = pw.id) to Supabase — not just localStorage. Per CLAUDE.md
 * §"E2E Testing — Verify Supabase, Not Just UI".
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
    console.warn('[edit-paddock-window-observations] Skipping: set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY to run.');
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

test.describe('OI-0118 — pre-graze save from Edit Paddock Window dialog persists to Supabase', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('closed-window pre-graze edit writes paddock_observations row with correct source_id', async ({ page }) => {
    // Find any paddock window (open or closed) — the edit dialog renders the
    // pre-graze card either way. Preferring closed so the test also exercises
    // the "historical pre-graze was otherwise unreachable" root-cause case.
    const { data: closedPws } = await supabase
      .from('event_paddock_windows')
      .select('id, event_id, location_id')
      .not('date_closed', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    let pw = closedPws && closedPws[0];
    if (!pw) {
      const { data: anyPws } = await supabase
        .from('event_paddock_windows')
        .select('id, event_id, location_id')
        .order('created_at', { ascending: false })
        .limit(1);
      pw = anyPws && anyPws[0];
    }
    test.skip(!pw, 'No paddock window available to exercise the edit dialog.');

    await login(page);
    await page.evaluate((eventId) => { window.location.hash = `#/events/${eventId}`; }, pw.event_id);
    await page.waitForTimeout(1000);

    // Open the dialog — §12 sub-move history pencil is the most reliable
    // entry point when the window is closed. Fall back to §4 Paddocks
    // "Edit" button for open windows.
    const pencil = page.locator('[data-testid="detail-submoves"] button.btn-ghost').first();
    if (await pencil.count()) {
      await pencil.click();
    } else {
      await page.getByRole('button', { name: 'Edit' }).first().click();
    }

    // Wait for the dialog's pre-graze card to mount, then fill + save.
    const preGrazeSave = page.locator(`[data-testid="edit-pw-pregraze-save-${pw.id}"]`);
    await preGrazeSave.waitFor({ state: 'visible', timeout: 4000 });

    const marker = `E2E edit-dialog pre-graze ${Date.now()}`;
    await page.fill(`[data-testid="edit-pw-pregraze-${pw.id}"] [data-testid="obs-card-forage-cover"]`, '72');
    await page.fill(`[data-testid="edit-pw-pregraze-${pw.id}"] [data-testid="obs-card-notes"]`, marker);

    await preGrazeSave.click();
    await page.waitForTimeout(2500);

    const { data: rows } = await supabase
      .from('paddock_observations')
      .select('*')
      .eq('source', 'event')
      .eq('type', 'open')
      .eq('source_id', pw.id)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(rows && rows.length).toBe(1);
    const row = rows[0];
    expect(row.location_id).toBe(pw.location_id);
    expect(row.forage_cover_pct).toBe(72);
    expect(row.notes).toBe(marker);
  });
});
