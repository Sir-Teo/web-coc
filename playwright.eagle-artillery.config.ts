import { defineConfig } from '@playwright/test';
/** Eagle Artillery and Scattershot checks against the dedicated development server on port 5311. */
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: /(eagle-artillery|scattershot).*\.spec\.ts/,
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5311',
    viewport: { width: 1440, height: 960 },
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  outputDir: 'output/test-results-eagle-scattershot',
});
