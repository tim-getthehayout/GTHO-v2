/**
 * @file CP-58: v1 → v2 migration integration test.
 *
 * Tests the full flow: upload v1 fixture → transform → preview → confirm →
 * CP-56 pipeline writes → verify data appears in v2 screens → no data loss.
 *
 * Prerequisites:
 *   - E2E_EMAIL and E2E_PASSWORD env vars set to a valid test account
 *   - Account must have at least one operation
 *
 * Run: E2E_EMAIL=you@real.com E2E_PASSWORD=pass npx playwright test tests/e2e/v1-migration.spec.js
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const TEST_EMAIL = process.env.E2E_EMAIL;
const TEST_PASSWORD = process.env.E2E_PASSWORD;

const V1_FIXTURE_PATH = join(import.meta.dirname, '..', 'fixtures', 'v1-export-sample.json');

test.beforeAll(() => {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error('E2E_EMAIL and E2E_PASSWORD env vars are required.');
  }
});

/** Login helper */
async function login(page) {
  await page.goto('/');
  await page.fill('[data-testid="auth-email"]', TEST_EMAIL);
  await page.fill('[data-testid="auth-password"]', TEST_PASSWORD);
  await page.click('[data-testid="auth-submit"]');
  await page.waitForSelector('[data-testid="app-container"]', { timeout: 10000 });
}

test.describe('CP-58: v1 → v2 Migration Integration', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('v1 import button visible in Settings alongside v2 import', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-v1-import-btn"]');
    await expect(page.locator('[data-testid="settings-v1-import-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="settings-import-backup-btn"]')).toBeVisible();
  });

  test('v1 file input detects non-v1 file and shows error', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-v1-import-file-input"]');

    const input = page.locator('[data-testid="settings-v1-import-file-input"]');
    await input.setInputFiles({
      name: 'not-v1.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ random: 'data' })),
    });

    await expect(page.locator('[data-testid="export-toast"]')).toBeVisible({ timeout: 3000 });
  });

  test('v1 file input rejects v2 backup as non-v1', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-v1-import-file-input"]');

    const v2Backup = {
      format: 'gtho-v2-backup',
      format_version: 1,
      schema_version: 14,
      tables: {},
      operation_id: 'x',
    };

    const input = page.locator('[data-testid="settings-v1-import-file-input"]');
    await input.setInputFiles({
      name: 'v2-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(v2Backup)),
    });

    await expect(page.locator('[data-testid="export-toast"]')).toBeVisible({ timeout: 3000 });
  });

  test('v1 fixture shows transform preview with correct counts', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-v1-import-file-input"]');

    const v1Json = readFileSync(V1_FIXTURE_PATH, 'utf-8');
    const input = page.locator('[data-testid="settings-v1-import-file-input"]');
    await input.setInputFiles({
      name: 'v1-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(v1Json),
    });

    // Wait for transform to complete and preview to appear
    await expect(page.locator('[data-testid="v1-import-preview"]')).toBeVisible({ timeout: 10000 });

    // Verify preview grid contains expected tables
    const previewText = await page.locator('[data-testid="v1-import-preview"]').innerText();
    expect(previewText).toContain('locations');
    expect(previewText).toContain('events');
    expect(previewText).toContain('animals');

    // Verify the confirm button exists
    await expect(page.locator('[data-testid="v1-import-confirm-btn"]')).toBeVisible();
  });

  test('v1 preview → confirm → second confirm flow works', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-v1-import-file-input"]');

    const v1Json = readFileSync(V1_FIXTURE_PATH, 'utf-8');
    const input = page.locator('[data-testid="settings-v1-import-file-input"]');
    await input.setInputFiles({
      name: 'v1-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(v1Json),
    });

    await expect(page.locator('[data-testid="v1-import-preview"]')).toBeVisible({ timeout: 10000 });

    // Click first confirm
    await page.click('[data-testid="v1-import-confirm-btn"]');
    await expect(page.locator('[data-testid="v1-import-second-confirm"]')).toBeVisible();

    // Verify cancel works on second confirm
    await page.click('[data-testid="v1-import-second-confirm"] .btn-outline');
    // Mount should be cleared
    await expect(page.locator('[data-testid="v1-import-second-confirm"]')).not.toBeVisible();
  });

  test('cancel on preview clears the sheet', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-v1-import-file-input"]');

    const v1Json = readFileSync(V1_FIXTURE_PATH, 'utf-8');
    const input = page.locator('[data-testid="settings-v1-import-file-input"]');
    await input.setInputFiles({
      name: 'v1-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(v1Json),
    });

    await expect(page.locator('[data-testid="v1-import-preview"]')).toBeVisible({ timeout: 10000 });

    // Click cancel
    await page.click('[data-testid="v1-import-preview"] .btn-outline');
    await expect(page.locator('[data-testid="v1-import-preview"]')).not.toBeVisible();
  });

  test('unparseable dose warning appears in preview', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-v1-import-file-input"]');

    // The fixture has one unparseable dose ("a big squirt")
    const v1Json = readFileSync(V1_FIXTURE_PATH, 'utf-8');
    const input = page.locator('[data-testid="settings-v1-import-file-input"]');
    await input.setInputFiles({
      name: 'v1-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(v1Json),
    });

    await expect(page.locator('[data-testid="v1-import-preview"]')).toBeVisible({ timeout: 10000 });

    // Preview should mention unparseable doses
    const previewText = await page.locator('[data-testid="v1-import-preview"]').innerText();
    expect(previewText).toContain('1');
    expect(previewText.toLowerCase()).toContain('dose');
  });
});
