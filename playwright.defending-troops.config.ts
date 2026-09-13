import { defineConfig } from '@playwright/test';
/** Remaining defending troop families, Ghost Trap and Defending Builder on a dev server at 5316. */
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: /defending-troops.*\.spec\.ts/,
  timeout: 180000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5316',
    viewport: { width: 1440, height: 960 },
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium' }],
  reporter: 'list',
  outputDir: 'output/test-results-defending-troops',
});
