import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: /late-goblin-buildings.*\.spec\.ts/,
  timeout: 180000,
  fullyParallel: false,
  workers: 1,
  use: {
    // Serve with: npx vite --host 127.0.0.1 --port 5314 --strictPort
    baseURL: 'http://127.0.0.1:5314',
    viewport: { width: 1440, height: 960 },
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  outputDir: 'output/test-results/late-goblin-buildings',
});
