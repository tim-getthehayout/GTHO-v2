/**
 * @file CP-54: Rotation calendar E2E tests.
 *
 * Prerequisites:
 *   - E2E_EMAIL and E2E_PASSWORD env vars set to a valid test account
 *   - Account must have at least one operation with locations and events
 *
 * Run: E2E_EMAIL=you@real.com E2E_PASSWORD=pass npx playwright test tests/e2e/rotation-calendar.spec.js
 */

import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_EMAIL;
const TEST_PASSWORD = process.env.E2E_PASSWORD;

test.beforeAll(() => {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error('E2E_EMAIL and E2E_PASSWORD env vars are required.');
  }
});

test.describe('CP-54: Rotation Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login
    await page.fill('[data-testid="auth-email"]', TEST_EMAIL);
    await page.fill('[data-testid="auth-password"]', TEST_PASSWORD);
    await page.click('[data-testid="auth-submit"]');
    await page.waitForSelector('[data-testid="app-container"]', { timeout: 10000 });
  });

  test('default first-load: Calendar view, Estimated Status mode', async ({ page }) => {
    await page.click('[data-testid="nav-events"]');
    await page.waitForSelector('[data-testid="events-screen"]');

    // Desktop: calendar view should be default
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width >= 900) {
      await expect(page.locator('[data-testid="calendar-header-strip"]')).toBeVisible();
      await expect(page.locator('[data-testid="mode-indicator"]')).toContainText('Estimated Status View');
      await expect(page.locator('[data-testid="view-toggle-calendar"]')).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('Calendar/List toggle swaps views', async ({ page }) => {
    await page.click('[data-testid="nav-events"]');
    await page.waitForSelector('[data-testid="events-screen"]');

    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width >= 900) {
      // Switch to list
      await page.click('[data-testid="view-toggle-list"]');
      await expect(page.locator('[data-testid="events-log"]')).toBeVisible();

      // Switch back to calendar
      await page.click('[data-testid="view-toggle-calendar"]');
      await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible();
    }
  });

  test('confinement toggle updates paddock list', async ({ page }) => {
    await page.click('[data-testid="nav-events"]');
    await page.waitForSelector('[data-testid="events-screen"]');

    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width >= 900) {
      const pill = page.locator('[data-testid="toolbar-confinement-pill"]');
      await expect(pill).toHaveAttribute('aria-pressed', 'false');

      await pill.click();
      await expect(pill).toHaveAttribute('aria-pressed', 'true');

      await pill.click();
      await expect(pill).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('deep-link loads specific state', async ({ page }) => {
    await page.goto('/#/events?zoom=month&anchor=2026-01-01&view=calendar');
    await page.waitForSelector('[data-testid="events-screen"]');

    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width >= 900) {
      await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible();
    }
  });

  test('mobile: no calendar, shows banner + list', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.click('[data-testid="nav-events"]');
    await page.waitForSelector('[data-testid="events-screen"]');

    // Should show mobile events screen, not calendar
    await expect(page.locator('[data-testid="mobile-events-screen"]')).toBeVisible();
    await expect(page.locator('[data-testid="calendar-grid"]')).not.toBeVisible();
  });

  test('resize to 800px: calendar disappears, list renders', async ({ page }) => {
    await page.click('[data-testid="nav-events"]');
    await page.waitForSelector('[data-testid="events-screen"]');

    // Start desktop
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width >= 900) {
      await expect(page.locator('[data-testid="calendar-header-strip"]')).toBeVisible();
    }

    // Resize to mobile
    await page.setViewportSize({ width: 800, height: 600 });
    // Navigate away and back to trigger re-render with new viewport
    await page.click('[data-testid="nav-dashboard"]');
    await page.click('[data-testid="nav-events"]');
    await page.waitForSelector('[data-testid="events-screen"]');

    await expect(page.locator('[data-testid="mobile-events-screen"]')).toBeVisible();
  });

  test('Reports has 7 tabs, no Rotation Calendar', async ({ page }) => {
    await page.click('[data-testid="nav-reports"]');
    await page.waitForSelector('[data-testid="reports-tab-strip"]');

    // Check expected tabs exist
    await expect(page.locator('[data-testid="reports-tab-feed"]')).toBeVisible();
    await expect(page.locator('[data-testid="reports-tab-npk"]')).toBeVisible();
    await expect(page.locator('[data-testid="reports-tab-animals"]')).toBeVisible();
    await expect(page.locator('[data-testid="reports-tab-season"]')).toBeVisible();
    await expect(page.locator('[data-testid="reports-tab-surveys"]')).toBeVisible();
    await expect(page.locator('[data-testid="reports-tab-weaning"]')).toBeVisible();
    await expect(page.locator('[data-testid="reports-tab-reference"]')).toBeVisible();

    // No rotation calendar tab
    const allTabs = await page.locator('[data-testid^="reports-tab-"]').count();
    expect(allTabs).toBe(7);
  });
});
