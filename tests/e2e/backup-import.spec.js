/**
 * @file CP-56: Backup import E2E test.
 *
 * Prerequisites:
 *   - E2E_EMAIL and E2E_PASSWORD env vars set to a valid test account
 *   - Account must have at least one operation
 *
 * Run: E2E_EMAIL=you@real.com E2E_PASSWORD=pass npx playwright test tests/e2e/backup-import.spec.js
 */

import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_EMAIL;
const TEST_PASSWORD = process.env.E2E_PASSWORD;

test.beforeAll(() => {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error('E2E_EMAIL and E2E_PASSWORD env vars are required.');
  }
});

test.describe('CP-56: Backup Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="auth-email"]', TEST_EMAIL);
    await page.fill('[data-testid="auth-password"]', TEST_PASSWORD);
    await page.click('[data-testid="auth-submit"]');
    await page.waitForSelector('[data-testid="app-container"]', { timeout: 10000 });
  });

  test('import button visible in Settings', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-import-backup-btn"]');
    await expect(page.locator('[data-testid="settings-import-backup-btn"]')).toBeVisible();
  });

  test('file input is hidden and accepts .json', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-import-file-input"]');
    const input = page.locator('[data-testid="settings-import-file-input"]');
    await expect(input).toHaveAttribute('accept', '.json');
    await expect(input).not.toBeVisible();
  });

  test('invalid JSON shows error toast', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-import-file-input"]');

    // Create an invalid file and trigger the file input
    const input = page.locator('[data-testid="settings-import-file-input"]');
    await input.setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('not json'),
    });

    await expect(page.locator('[data-testid="export-toast"]')).toBeVisible({ timeout: 3000 });
  });

  test('wrong format shows error toast', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-import-file-input"]');

    const input = page.locator('[data-testid="settings-import-file-input"]');
    await input.setInputFiles({
      name: 'wrong.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ format: 'not-gtho' })),
    });

    await expect(page.locator('[data-testid="export-toast"]')).toBeVisible({ timeout: 3000 });
  });

  test('valid backup shows preview sheet with two-step confirm', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-import-file-input"]');

    // Create a minimal valid backup
    const backup = {
      format: 'gtho-v2-backup',
      format_version: 1,
      schema_version: 14,
      exported_at: '2026-04-13T18:00:00Z',
      exported_by: { user_id: 'test', email: 'test@test.com' },
      operation_id: 'test-op-id',
      build_stamp: 'test',
      counts: { farms: 0, events: 0, animals: 0, batches: 0, todos: 0 },
      tables: { operations: [{ id: 'test-op-id', name: 'Test' }] },
    };

    const input = page.locator('[data-testid="settings-import-file-input"]');
    await input.setInputFiles({
      name: 'test-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });

    // Preview sheet should appear
    await expect(page.locator('[data-testid="import-preview-sheet"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="import-replace-btn"]')).toBeVisible();

    // Click Replace All Data → second confirm
    await page.click('[data-testid="import-replace-btn"]');
    await expect(page.locator('[data-testid="import-second-confirm"]')).toBeVisible();
    await expect(page.locator('[data-testid="import-final-confirm-btn"]')).toBeVisible();
  });
});
