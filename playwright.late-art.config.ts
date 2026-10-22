import { defineConfig } from '@playwright/test';
import base from './playwright.config';

if (!process.env.PRODUCTION_BASE_URL) throw Error('Run npm run test:late-art:production.');
const projects = [
  { name: 'chromium', use: { browserName: 'chromium' as const } },
  { name: 'webkit', use: { browserName: 'webkit' as const } },
];
const selected = process.env.PRODUCTION_BROWSER;
if (selected && !projects.some((project) => project.name === selected))
  throw Error('PRODUCTION_BROWSER must be chromium or webkit.');

export default defineConfig(base, {
  testMatch: 'late-art-build.spec.ts',
  timeout: 90000,
  use: {
    baseURL: process.env.PRODUCTION_BASE_URL,
    // Fault injection must reach page.route instead of a service-worker response.
    serviceWorkers: 'block',
  },
  projects: projects.filter((project) => !selected || project.name === selected),
  webServer: [],
  outputDir: 'output/late-art-production',
});
