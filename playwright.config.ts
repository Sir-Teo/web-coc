import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  // Specs wait for the deferred art batch (scene.artSettled) as well as the boot, and several
  // boot twice; software-rendered runners upload that art slowly.
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 960 },
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  outputDir: 'output/test-results',
});
