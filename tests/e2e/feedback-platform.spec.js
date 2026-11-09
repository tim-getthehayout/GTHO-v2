import { test,expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { itemRevision } from '../../vendor/feedback-module/src/index.js';
for (const purpose of ['feedback','support']) test(`real ${purpose} sheet: browser/Node/Deno revision parity throughout capture, correction, review, accept and delivery`, async ({ page }) => {
  // This isolated fixture cannot contact Supabase, providers, or any external host.
  await page.route('**/*',route => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  await page.goto(`/tests/e2e/fixtures/feedback-platform.html?purpose=${purpose}`);
  const panel = page.locator('#fb-sheet-panel');
  await panel.locator('textarea').first().fill('Original 🐄 é 漢字 note');
  await page.getByTestId('feedback-kind').selectOption('bug');
  for (const [key,value] of Object.entries({ title: 'Unicode 🐄',expected: 'expected é',actual: 'actual 漢字',reproSteps: 'first\nsecond',severity: 'normal',affectedWork: 'feeding',workaround: 'manual',dataRisk: 'unknown risk' })) await page.getByTestId(`feedback-${key}`).fill(value);
  await panel.getByRole('button',{ name: 'Save note',exact: true }).click();
  await expect(page.getByTestId('feedback-normal-review')).toHaveAttribute('data-revision',/[a-f0-9]{64}/);
  await page.getByTestId('feedback-actual').fill('corrected 🐄 é');
  await panel.getByRole('button',{ name: 'Save note',exact: true }).click();
  expect(await page.evaluate(() => window.fixture.handoffs.length)).toBe(0);
  await panel.getByRole('button',{ name: 'Save note',exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.fixture.handoffs.length)).toBe(1);
  const observations = await page.evaluate(() => window.fixture.sessions.map(session => ({ item: session.item,revision: window.fixture.feedback.itemRevision(session.item),status: session.status,delivery: session.delivery })));
  expect(observations.some(row => row.status === 'confirmed')).toBe(true);
  const moduleUrl = pathToFileURL(resolve('vendor/feedback-module/src/index.js')).href;
  for (const observation of observations) {
    expect(observation.revision).toBe(itemRevision(observation.item));
    const deno = execFileSync('deno',['eval',`import { itemRevision } from ${JSON.stringify(moduleUrl)}; console.log(itemRevision(JSON.parse(Deno.args[0])))`,JSON.stringify(observation.item)],{ encoding: 'utf8' }).trim();
    expect(deno).toBe(observation.revision);
  }
  const last = observations.at(-1);
  expect(last.delivery.acknowledgedHandoff.revision).toBe(last.revision);
  const reordered = Object.fromEntries(Object.entries(last.item).reverse());
  expect(itemRevision(reordered)).toBe(last.revision);
  expect(itemRevision({ ...reordered,reviewConfirmation: { excluded: true } })).toBe(last.revision);
  const nestedReordered = { ...reordered,legacy: { a: Object.fromEntries(Object.entries(reordered.legacy.a).reverse()),z: reordered.legacy.z } };
  for (const vector of [nestedReordered,{ ...nestedReordered,reviewConfirmation: { excluded: true } }]) {
    expect(itemRevision(vector)).toBe(last.revision);
    expect(await page.evaluate(item => window.fixture.feedback.itemRevision(item),vector)).toBe(last.revision);
    expect(execFileSync('deno',['eval',`import { itemRevision } from ${JSON.stringify(moduleUrl)}; console.log(itemRevision(JSON.parse(Deno.args[0])))`,JSON.stringify(vector)],{ encoding: 'utf8' }).trim()).toBe(last.revision);
  }
});
