import { defineConfig } from '@playwright/test';
/** Garrison checks (new families and the No Flight Zone foundation) on a dev server at port 5315. */
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: /(garrison|no-flight-zone|dragon-fire).*\.spec\.ts/,
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
  projects: [
    { name: 'chromium', testIgnore: /native-garrison-mesh/ },
    {
      name: 'webkit',
      testMatch: /garrison-families.*\.spec\.ts/,
      use: { browserName: 'webkit' },
    },
    // Original mesh pixel witnesses need the DPR-2 framebuffer they were frozen with and, on
    // macOS, the Metal ANGLE backend used by the asset checks for their large reference sheets.
    {
      name: 'chromium-dpr2',
      testMatch: /native-garrison-mesh\.spec\.ts/,
      use: {
        deviceScaleFactor: 2,
        launchOptions: process.platform === 'darwin' ? { args: ['--use-angle=metal'] } : {},
      },
    },
  ],
  reporter: 'list',
  outputDir: 'output/test-results-garrison',
});
