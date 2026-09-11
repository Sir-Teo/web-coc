import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  testMatch: [
    '**/display-density.spec.ts',
    '**/game.spec.ts',
    '**/hud-layout.spec.ts',
    '**/terrain-field.spec.ts',
    '**/village-camera.spec.ts',
    '**/placement-preview.spec.ts',
    '**/ui-input.spec.ts',
    '**/visual-feedback.spec.ts',
  ],
  use: { ...config.use, deviceScaleFactor: 2 },
  outputDir: 'output/retina-results',
});
