import type { Page } from '@playwright/test';

/** Advanced gameplay scenarios start from a deliberate developed-village fixture. */
export async function useDevelopedVillage(page: Page) {
  await page.evaluate(async () => {
    const { developedSave } = await import('/tests/fixtures/developed-village.ts');
    const { model, scene } = window.__game;
    const { settings, tutorial } = model.state;
    model.state = developedSave();
    model.state.settings = settings;
    model.state.tutorial = tutorial;
    model.changed();
    scene.sync();
  });
}
