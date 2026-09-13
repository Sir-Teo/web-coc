import { defineConfig } from '@playwright/test';
/** Garrison family checks against an already running dev server on port 5315. */
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: /garrison-families.*\.spec\.ts/,
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5315',
    viewport: { width: 1440, height: 960 },
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  outputDir: 'output/test-results-garrison',
});
