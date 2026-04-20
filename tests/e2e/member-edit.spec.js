/**
 * @file OI-0120 — Member edit round-trips to Supabase.
 *
 * Admin opens Member Management, clicks Edit on a pending invite, changes
 * the email, Saves, and asserts `operation_members.email` in Supabase
 * reflects the new value. Per CLAUDE.md §"E2E Testing — Verify Supabase,
 * Not Just UI".
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
    console.warn('[member-edit spec] Skipping: set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY to run.');
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

test.describe('OI-0120 — admin-side edit of pending invite round-trips to Supabase', () => {
  test.skip(SKIP, 'env vars missing — see file header.');

  test('edit pending invite email → Supabase row reflects the new value', async ({ page }) => {
    // Pick the first operation this user belongs to (admin or owner).
    const { data: memberships } = await supabase
      .from('operation_members')
      .select('operation_id, role')
      .in('role', ['owner', 'admin'])
      .limit(5);
    test.skip(!memberships || memberships.length === 0, 'No owner/admin membership for test user.');

    // Find the first operation with at least one pending invite that is not
    // our own seed row — we'll edit that one.
    let operationId = null;
    let pendingMember = null;
    for (const m of memberships) {
      const { data: pending } = await supabase
        .from('operation_members')
        .select('*')
        .eq('operation_id', m.operation_id)
        .is('user_id', null)
        .limit(1);
      if (pending && pending.length > 0) {
        operationId = m.operation_id;
        pendingMember = pending[0];
        break;
      }
    }

    // If no pending invite exists, create one for this run.
    if (!pendingMember) {
      operationId = memberships[0].operation_id;
      const seed = {
        operation_id: operationId,
        display_name: 'E2E Seed Invite',
        email: `e2e-seed-${Date.now()}@example.com`,
        role: 'team_member',
        invite_token: crypto.randomUUID(),
        invited_at: new Date().toISOString(),
        user_id: null,
      };
      const { data: inserted } = await supabase.from('operation_members').insert(seed).select('*').single();
      pendingMember = inserted;
    }
    test.skip(!pendingMember, 'Could not establish a pending invite to edit.');

    await login(page);
    // Navigate to settings and open member management.
    await page.evaluate(() => { window.location.hash = '#/settings'; });
    await page.waitForTimeout(800);

    // Directly invoke the member-management sheet via the DOM entry point —
    // the Settings page wires it through a Members row. Click testid if present.
    await page.click('[data-testid="settings-members-row"]').catch(async () => {
      // Fallback: some builds may expose a button; try text match.
      await page.getByText('Members').first().click().catch(() => {});
    });
    await page.waitForSelector(`[data-testid="member-edit-${pendingMember.id}"]`, { timeout: 6000 });

    // Open the edit form.
    await page.click(`[data-testid="member-edit-${pendingMember.id}"]`);
    const newEmail = `e2e-edited-${Date.now()}@example.com`;
    await page.fill(`[data-testid="member-edit-email-${pendingMember.id}"]`, newEmail);
    await page.click(`[data-testid="member-edit-save-${pendingMember.id}"]`);
    await page.waitForTimeout(1500);

    // Success toast is fire-and-forget; assert Supabase row.
    const { data: after } = await supabase
      .from('operation_members')
      .select('email')
      .eq('id', pendingMember.id)
      .single();
    expect(after?.email).toBe(newEmail);

    // Clean up: restore the original email to keep the DB tidy for reruns.
    await supabase.from('operation_members').update({ email: pendingMember.email }).eq('id', pendingMember.id);
  });
});
