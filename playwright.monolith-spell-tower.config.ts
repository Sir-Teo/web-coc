import { defineConfig } from '@playwright/test';
/** Monolith and Spell Tower verification against a dedicated development server on port 5312. */
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: /(monolith|spell-tower).*\.spec\.ts/,
  timeout: 240000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5312',
    viewport: { width: 1440, height: 960 },
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5312 --strictPort',
    url: 'http://127.0.0.1:5312',
    reuseExistingServer: true,
  },
  outputDir: 'output/test-results-monolith-spell-tower',
});
