/**
 * @file E2E: multi-tab pull-on-visibility (OI-0141).
 *
 * Two browser contexts simulate two devices. Context A writes a todo;
 * context B fires a visibilitychange event and asserts the todo appears.
 * Per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI": the write
 * is verified against Supabase, not just localStorage.
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
let createdTodoId = null;

test.beforeAll(async () => {
  if (SKIP) {
    console.warn('[multi-tab-pull spec] Skipping: set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY to run.');
    return;
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (error) throw new Error(`Supabase auth failed: ${error.message}`);
});

test.afterAll(async () => {
  if (createdTodoId && supabase) {
    await supabase.from('todos').delete().eq('id', createdTodoId);
  }
});

async function login(page) {
  await page.goto('/');
  await page.fill('[data-testid="auth-email"]', TEST_EMAIL);
  await page.fill('[data-testid="auth-password"]', TEST_PASSWORD);
  await page.click('[data-testid="auth-submit"]');
  await page.waitForSelector('[data-testid="app-header"]', { timeout: 15000 });
}

test.describe('Multi-tab pull on visibility', () => {
  test.skip(SKIP, 'E2E env vars not set');

  test('context B sees context A write after visibility pull', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await login(pageA);
    await login(pageB);

    // Navigate both to todos
    await pageA.click('[data-testid="nav-todos"]');
    await pageA.waitForSelector('[data-testid="todo-list"], [data-testid="todo-empty"]', { timeout: 5000 });

    await pageB.click('[data-testid="nav-todos"]');
    await pageB.waitForSelector('[data-testid="todo-list"], [data-testid="todo-empty"]', { timeout: 5000 });

    // Context A creates a todo
    const todoTitle = `OI-0141 test ${Date.now()}`;
    await pageA.click('[data-testid="add-todo-btn"]');
    await pageA.fill('[data-testid="todo-title-input"]', todoTitle);
    await pageA.click('[data-testid="todo-save-btn"]');
    await pageA.waitForTimeout(2000);

    // Verify it reached Supabase
    const { data } = await supabase.from('todos').select('id').ilike('title', `%${todoTitle}%`);
    expect(data.length).toBeGreaterThanOrEqual(1);
    createdTodoId = data[0].id;

    // Simulate visibility change on context B (fire the event)
    await pageB.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Wait for the pull to complete and UI to update
    await pageB.waitForTimeout(3000);

    // Assert the todo appears in context B
    const todoText = await pageB.textContent('body');
    expect(todoText).toContain(todoTitle);

    // Verify lastPulledAt was updated in context B
    const lastPulled = await pageB.evaluate(() => localStorage.getItem('gtho_last_pulled_at'));
    expect(Number(lastPulled)).toBeGreaterThan(0);

    await contextA.close();
    await contextB.close();
  });
});
