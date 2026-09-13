import { defineConfig } from '@playwright/test';
/** Tornado and Goblin Freeze Trap checks against a separately started dev server:
 * npx vite --host 127.0.0.1 --port 5313 --strictPort */
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: 'tornado-freeze-traps.spec.ts',
  timeout: 180000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5313',
    viewport: { width: 1440, height: 960 },
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  outputDir: 'output/test-results/tornado-freeze',
});
