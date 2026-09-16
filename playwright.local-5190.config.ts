import { defineConfig } from '@playwright/test';
import config from './playwright.config';

// Temporary (not committed): this checkout's own dev server, clear of other local sessions.
export default defineConfig({
  ...config,
  use: { ...config.use, baseURL: 'http://127.0.0.1:5190' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5190 --strictPort',
    url: 'http://127.0.0.1:5190',
    reuseExistingServer: true,
  },
  outputDir: 'output/local-5190-results',
});
