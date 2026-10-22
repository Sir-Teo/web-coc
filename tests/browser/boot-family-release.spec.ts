import { test, expect } from '@playwright/test';
import { initialSave } from '../../src/game/model';
import { artGraphSave } from './art-graph-fixture';

test('art loaded at boot is released after replacing its village and loads again on undo', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(
    (save) => localStorage.setItem('crown-clan-save-v1', save),
    artGraphSave('xbow'),
  );
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const keys = await page.evaluate(() =>
    window.__game.game.textures
      .getTextureKeys()
      .filter((key) => key.startsWith('xbow:mesh:') || /^xbow-\d+-(ground|both)$/.test(key)),
  );
  expect(keys).toContain('xbow-1-ground');
  expect(keys.some((key) => key.startsWith('xbow:mesh:'))).toBe(true);
  const resident = () =>
    page.evaluate((keys) => keys.filter((key) => window.__game.game.textures.exists(key)), keys);
  const starter = initialSave();
  starter.tutorial = true;
  await page.locator('#import-file').setInputFiles({
    name: 'starter-village.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(starter)),
  });
  await page.locator('[data-action="import-confirm"]').click();
  await page.waitForFunction(() => window.__game.scene.artSettled);
  expect(
    await page.evaluate(() => window.__game.model.buildings.some((b) => b.kind === 'xbow')),
  ).toBe(false);
  // The normal home-idle policy has a twenty-second grace period.
  await expect.poll(resident, { timeout: 35000 }).toEqual([]);
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-action="import-undo"]').click();
  await page.waitForFunction(() => window.__game.scene.artSettled);
  expect(await resident()).toEqual(keys);
  await expect.poll(() => page.evaluate(() => window.__game.scene.sprites.get(3)?.alpha)).toBe(0);
  expect(errors).toEqual([]);
});
