/**
 * @file CP-55: Backup export E2E test.
 *
 * Prerequisites:
 *   - E2E_EMAIL and E2E_PASSWORD env vars set to a valid test account
 *   - Account must have at least one operation
 *
 * Run: E2E_EMAIL=you@real.com E2E_PASSWORD=pass npx playwright test tests/e2e/backup-export.spec.js
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const TEST_EMAIL = process.env.E2E_EMAIL;
const TEST_PASSWORD = process.env.E2E_PASSWORD;

test.beforeAll(() => {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error('E2E_EMAIL and E2E_PASSWORD env vars are required.');
  }
});

test.describe('CP-55: Backup Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="auth-email"]', TEST_EMAIL);
    await page.fill('[data-testid="auth-password"]', TEST_PASSWORD);
    await page.click('[data-testid="auth-submit"]');
    await page.waitForSelector('[data-testid="app-container"]', { timeout: 10000 });
  });

  test('export button visible in Settings', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-export-backup-btn"]');
    await expect(page.locator('[data-testid="settings-export-backup-btn"]')).toBeVisible();
  });

  test('export confirm sheet opens on click', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-export-backup-btn"]');
    await page.click('[data-testid="settings-export-backup-btn"]');
    await expect(page.locator('[data-testid="export-confirm-sheet"]')).toBeVisible();
  });

  test('export downloads valid JSON file', async ({ page }) => {
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings-export-backup-btn"]');
    await page.click('[data-testid="settings-export-backup-btn"]');
    await page.waitForSelector('[data-testid="export-confirm-sheet"]');

    // Set up download listener before clicking confirm
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-confirm-btn"]');

    const download = await downloadPromise;

    // Verify file name matches §5.2 pattern
    const fileName = download.suggestedFilename();
    expect(fileName).toMatch(/^gtho-v2-backup__.*__\d{4}-\d{2}-\d{2}_\d{4}__schema-v\d+\.json$/);

    // Read and parse the downloaded file
    const filePath = await download.path();
    const content = fs.readFileSync(filePath, 'utf-8');
    const backup = JSON.parse(content);

    // Validate envelope
    expect(backup.format).toBe('gtho-v2-backup');
    expect(backup.format_version).toBe(1);
    expect(typeof backup.schema_version).toBe('number');
    expect(backup.exported_at).toMatch(/Z$/);
    expect(backup.exported_by).toHaveProperty('user_id');
    expect(backup.exported_by).toHaveProperty('email');
    expect(backup.tables).toBeDefined();
    expect(backup.counts).toBeDefined();
  });
});
