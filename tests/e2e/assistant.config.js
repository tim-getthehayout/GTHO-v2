import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
const production = process.env.GTHO_REVIEW_PRODUCTION === '1';
const port = production ? 5188 : 5187;
export default defineConfig({
  outputDir: '/tmp/gtho-assistant-e2e-results',testDir: '.',testMatch: 'feedback-platform.spec.js',workers: 1,retries: 0,
  use: { baseURL: `http://localhost:${port}`,headless: true,launchOptions: process.env.GTHO_CHROMIUM_EXECUTABLE ? { executablePath: process.env.GTHO_CHROMIUM_EXECUTABLE } : {} },
  webServer: { cwd: fileURLToPath(new URL('../..',import.meta.url)),command: `npx -p node@22 node node_modules/vite/bin/vite.js ${production ? 'preview' : '--mode assistant-e2e'} --host localhost --port ${port} --strictPort`,url: `http://localhost:${port}`,reuseExistingServer: false },
});
