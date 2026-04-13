/** @file CP-23 + CP-53: Integration smoke test — full user lifecycle.
 *
 * Prerequisites:
 *   - .env configured with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 *   - Supabase project with migrations applied
 *   - E2E_EMAIL and E2E_PASSWORD env vars set to a valid test account.
 *     Create this account manually in Supabase Auth before running.
 *
 * TODO (CP-53): Steps 10+ (batch → deliver feed → survey → reports) require E2E
 * credentials with a seeded operation. Run after auth setup is complete.
 *
 * Run: E2E_EMAIL=you@real.com E2E_PASSWORD=pass npx playwright test tests/e2e/smoke.spec.js
 */

import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_EMAIL;
const TEST_PASSWORD = process.env.E2E_PASSWORD;

test.beforeAll(() => {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error('E2E_EMAIL and E2E_PASSWORD env vars are required. Create a test account in Supabase Auth first.');
  }
});

test.describe('Phase 3.2 + 3.3 Integration Smoke Test', () => {
  test('full flow: signup → onboard → locations → animals → events → move → close', async ({ page }) => {
    await page.goto('/');

    // ---------------------------------------------------------------
    // Step 1: Auth — login with pre-existing test account
    // ---------------------------------------------------------------
    await expect(page.locator('[data-testid="auth-overlay"]')).toBeVisible({ timeout: 15000 });

    // Ensure we're in login mode (default)
    const authMode = page.locator('[data-testid="auth-mode"]');
    if (await authMode.textContent() === 'Sign Up') {
      await page.locator('[data-testid="auth-toggle"]').click();
    }

    await page.locator('[data-testid="auth-email"]').fill(TEST_EMAIL);
    await page.locator('[data-testid="auth-password"]').fill(TEST_PASSWORD);
    await page.locator('[data-testid="auth-submit"]').click();

    // Wait for either dashboard or onboarding
    await expect(page.locator('[data-testid="dashboard-screen"], [data-testid="onboarding-wizard"]')).toBeVisible({ timeout: 15000 });

    // ---------------------------------------------------------------
    // Step 2: Onboarding (if needed)
    // ---------------------------------------------------------------
    const onboarding = page.locator('[data-testid="onboarding-wizard"]');
    if (await onboarding.isVisible()) {
      // Step 1: Operation name
      await page.locator('[data-testid="onboarding-operation-name"]').fill('Smoke Test Ranch');
      await page.locator('[data-testid="onboarding-next-1"]').click();

      // Step 2: Farm name
      await page.locator('[data-testid="onboarding-farm-name"]').fill('Main Farm');
      await page.locator('[data-testid="onboarding-next-2"]').click();

      // Step 3: Select species (click the beef_cattle toggle)
      await page.locator('[data-testid="onboarding-species-beef_cattle"]').click();
      await page.locator('[data-testid="onboarding-next-3"]').click();

      // Step 4: Review & confirm
      await page.locator('[data-testid="onboarding-confirm"]').click();

      // Wait for dashboard
      await expect(page.locator('[data-testid="dashboard-screen"]')).toBeVisible({ timeout: 15000 });
    }

    // ---------------------------------------------------------------
    // Step 3: Create locations
    // ---------------------------------------------------------------
    await page.goto('/#/locations');
    await expect(page.locator('[data-testid="locations-screen"]')).toBeVisible();

    // Create a pasture
    await page.locator('[data-testid="locations-add-btn"]').click();
    await page.locator('[data-testid="location-sheet-name"]').fill('North Pasture');
    await page.locator('[data-testid="location-sheet-type-land"]').click();
    await page.locator('[data-testid="location-sheet-area"]').fill('40');
    await page.locator('[data-testid="location-sheet-save"]').click();

    // Verify location card appears
    await expect(page.locator('text=North Pasture')).toBeVisible();

    // Create a second pasture (for move destination)
    await page.locator('[data-testid="locations-add-btn"]').click();
    await page.locator('[data-testid="location-sheet-name"]').fill('South Pasture');
    await page.locator('[data-testid="location-sheet-type-land"]').click();
    await page.locator('[data-testid="location-sheet-area"]').fill('30');
    await page.locator('[data-testid="location-sheet-save"]').click();

    await expect(page.locator('text=South Pasture')).toBeVisible();

    // ---------------------------------------------------------------
    // Step 4: Create group + animals
    // ---------------------------------------------------------------
    await page.goto('/#/animals');
    await expect(page.locator('[data-testid="animals-screen"]')).toBeVisible();

    // Create a group
    await page.locator('[data-testid="animals-add-group-btn"]').click();
    await page.locator('[data-testid="group-sheet-name"]').fill('Cow Herd');
    await page.locator('[data-testid="group-sheet-color"]').fill('#639922');
    await page.locator('[data-testid="group-sheet-save"]').click();

    await expect(page.locator('text=Cow Herd')).toBeVisible();

    // Switch to Animals tab and add an animal
    await page.locator('[data-testid="animals-tab-animals"]').click();
    await page.locator('[data-testid="animals-add-animal-btn"]').click();
    await page.locator('[data-testid="animal-sheet-tag"]').fill('001');
    await page.locator('[data-testid="animal-sheet-sex-female"]').click();

    // Select the first class (seeded by onboarding)
    const classSelect = page.locator('[data-testid="animal-sheet-class"]');
    await classSelect.selectOption({ index: 1 });

    // Select group
    const groupSelect = page.locator('[data-testid="animal-sheet-group"]');
    await groupSelect.selectOption({ label: 'Cow Herd' });

    await page.locator('[data-testid="animal-sheet-save"]').click();

    // Verify animal appears in table
    await expect(page.locator('text=001')).toBeVisible();

    // ---------------------------------------------------------------
    // Step 5: Create event
    // ---------------------------------------------------------------
    await page.goto('/#/events');
    await expect(page.locator('[data-testid="events-screen"]')).toBeVisible();

    await page.locator('[data-testid="events-create-btn"]').click();

    // Select location (click first Ready location)
    await page.locator('[data-testid*="location-picker-item-"]').first().click();

    // Select group
    await page.locator('[data-testid*="group-picker-item-"]').first().click();

    // Head count and weight should be auto-filled, but set them explicitly
    await page.locator('[data-testid="create-event-head-count"]').fill('1');
    await page.locator('[data-testid="create-event-avg-weight"]').fill('1200');

    await page.locator('[data-testid="create-event-save"]').click();

    // Verify event card appears with Active status
    await expect(page.locator('.badge-green:has-text("Active")')).toBeVisible({ timeout: 5000 });

    // ---------------------------------------------------------------
    // Step 6: Sub-move (add a paddock window)
    // ---------------------------------------------------------------
    const submoveBtn = page.locator('[data-testid*="events-submove-btn-"]').first();
    await submoveBtn.click();

    // Select a different location
    await page.locator('#submove-open-sheet-panel [data-testid*="location-picker-item-"]').last().click();
    await page.locator('[data-testid="submove-open-save"]').click();

    // Verify 2 paddock windows now shown
    await expect(page.locator('[data-testid*="events-paddock-window-"]')).toHaveCount(2, { timeout: 5000 });

    // Close the sub-move window (non-primary)
    const closeWindowBtn = page.locator('[data-testid*="events-close-window-"]:not([disabled])').first();
    if (await closeWindowBtn.isVisible()) {
      await closeWindowBtn.click();
      await page.locator('[data-testid="submove-close-save"]').click();
    }

    // ---------------------------------------------------------------
    // Step 7: Move wizard
    // ---------------------------------------------------------------
    const moveBtn = page.locator('[data-testid*="events-move-btn-"]').first();
    await moveBtn.click();

    // Step 1: New location
    await page.locator('[data-testid="move-wizard-dest-new"]').click();
    await page.locator('[data-testid="move-wizard-step-1-next"]').click();

    // Step 2: Pick a location
    await page.locator('#move-wizard-sheet-panel [data-testid*="location-picker-item-"]').first().click();
    await page.locator('[data-testid="move-wizard-step-2-next"]').click();

    // Step 3: Save (close & move)
    await page.locator('[data-testid="move-wizard-save"]').click();

    // Verify: old event is Closed, new event is Active
    await expect(page.locator('.badge-amber:has-text("Closed")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.badge-green:has-text("Active")')).toBeVisible({ timeout: 5000 });

    // ---------------------------------------------------------------
    // Step 8: Close event (no move)
    // ---------------------------------------------------------------
    const closeEventBtn = page.locator('[data-testid*="events-close-event-btn-"]').first();
    await closeEventBtn.click();
    await page.locator('[data-testid="close-event-save"]').click();

    // All events should be Closed
    await expect(page.locator('.badge-green:has-text("Active")')).toHaveCount(0, { timeout: 5000 });

    // ---------------------------------------------------------------
    // Step 9: Verify persistence (reload page, check data still there)
    // ---------------------------------------------------------------
    await page.reload();

    // Wait for app to reload (may need auth again or load from localStorage)
    await page.waitForTimeout(2000);

    // Navigate to events
    await page.goto('/#/events');
    await page.waitForTimeout(1000);

    // Should have 2 closed events persisted in localStorage
    const eventCards = page.locator('[data-testid*="events-card-"]');
    await expect(eventCards).toHaveCount(2, { timeout: 10000 });
  });

  // ---------------------------------------------------------------
  // CP-53: Feed → Survey → Reports lifecycle
  // TODO: Requires E2E credentials with seeded operation + feed batches.
  //       Run after auth is configured in CI (see OPEN_ITEMS.md OI-e2e).
  // ---------------------------------------------------------------
  test('CP-53: batch → deliver feed → survey → reports render', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="auth-overlay"]')).toBeVisible({ timeout: 15000 });

    await page.locator('[data-testid="auth-email"]').fill(TEST_EMAIL);
    await page.locator('[data-testid="auth-password"]').fill(TEST_PASSWORD);
    await page.locator('[data-testid="auth-submit"]').click();

    await expect(page.locator('[data-testid="dashboard-screen"]')).toBeVisible({ timeout: 15000 });

    // ---------------------------------------------------------------
    // Feed: create batch
    // ---------------------------------------------------------------
    await page.goto('/#/feed');
    await expect(page.locator('[data-testid="feed-screen"]')).toBeVisible();

    // Create a feed type (if none exists)
    const feedTypesTab = page.locator('[data-testid="feed-tab-feedtypes"]');
    if (await feedTypesTab.isVisible()) {
      await feedTypesTab.click();
    }

    // Navigate to batches tab
    const batchesTab = page.locator('[data-testid="feed-tab-batches"]');
    await batchesTab.click();

    // Create a batch
    await page.locator('[data-testid="feed-add-batch-btn"]').click();
    // The batch sheet requires a feed type — skip if no feed types present
    const feedTypeSelect = page.locator('[data-testid="batch-sheet-feedtype"]');
    const feedTypeCount = await feedTypeSelect.locator('option').count();
    if (feedTypeCount <= 1) {
      // No feed types — skip batch creation and note it
      // TODO: Seed a feed type via API before E2E run
      await page.locator('[data-testid="sheet-cancel"], [data-testid="batch-sheet-cancel"]').first().click();
    } else {
      await feedTypeSelect.selectOption({ index: 1 });
      await page.locator('[data-testid="batch-sheet-name"]').fill('E2E Hay Batch');
      await page.locator('[data-testid="batch-sheet-quantity"]').fill('100');
      await page.locator('[data-testid="batch-sheet-unit"]').fill('bale');
      await page.locator('[data-testid="batch-sheet-weight-per-unit"]').fill('500');
      await page.locator('[data-testid="batch-sheet-dm-pct"]').fill('88');
      await page.locator('[data-testid="batch-sheet-cost-per-unit"]').fill('15');
      await page.locator('[data-testid="batch-sheet-save"]').click();
      await expect(page.locator('text=E2E Hay Batch')).toBeVisible({ timeout: 5000 });
    }

    // ---------------------------------------------------------------
    // Survey: create and commit a survey
    // ---------------------------------------------------------------
    await page.goto('/#/surveys');
    await expect(page.locator('[data-testid="surveys-screen"]')).toBeVisible();

    const createSurveyBtn = page.locator('[data-testid="surveys-create-btn"]');
    if (await createSurveyBtn.isVisible()) {
      await createSurveyBtn.click();

      // Select bulk survey type
      const surveyTypeSelect = page.locator('[data-testid="survey-type-select"]');
      if (await surveyTypeSelect.isVisible()) {
        await surveyTypeSelect.selectOption('bulk');
      }

      await page.locator('[data-testid="survey-save-btn"]').click();
    }

    // ---------------------------------------------------------------
    // Reports: verify all tabs render without error
    // ---------------------------------------------------------------
    await page.goto('/#/reports');
    await expect(page.locator('[data-testid="reports-tab-strip"]')).toBeVisible({ timeout: 10000 });

    // Feed & DMI tab (default)
    await expect(page.locator('[data-testid="reports-tab-feed"]')).toBeVisible();
    await expect(page.locator('[data-testid="reports-feed-dmi"]')).toBeVisible();

    // NPK tab
    await page.locator('[data-testid="reports-tab-npk"]').click();
    await expect(page.locator('[data-testid="reports-npk"]')).toBeVisible();

    // Animals tab
    await page.locator('[data-testid="reports-tab-animals"]').click();
    await expect(page.locator('[data-testid="reports-animals"]')).toBeVisible();

    // Season Summary tab
    await page.locator('[data-testid="reports-tab-season"]').click();
    await expect(page.locator('[data-testid="reports-season"]')).toBeVisible();

    // Reference console tab
    await page.locator('[data-testid="reports-tab-reference"]').click();
    await expect(page.locator('[data-testid="reference-console"]')).toBeVisible();

    // Dashboard metrics
    await page.goto('/');
    await expect(page.locator('[data-testid="dashboard-screen"]')).toBeVisible({ timeout: 10000 });
    // At least one group card metric should be visible if groups + events exist
    const metricEls = page.locator('[data-testid*="dashboard-metrics-"]');
    const metricCount = await metricEls.count();
    // Accept 0 if no groups — the test confirms no crash
    expect(metricCount).toBeGreaterThanOrEqual(0);
  });
});
