import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Raises the Town Hall, waits for an object's art and returns its screen point, in view. */
async function showObject(page: Page, townhall: number, id: string) {
  await page.evaluate((townhall) => {
    const m = window.__game.model;
    m.townhall!.level = townhall;
    m.changed();
  }, townhall);
  await page.waitForFunction((id) => window.__game.scene.villageObjectSprites.get(id)?.visible, id);
  return page.evaluate(async (id) => {
    const scene = window.__game.scene,
      im = scene.villageObjectSprites.get(id)!,
      bounds = im.getBounds();
    scene.cameras.main.centerOn(bounds.centerX, bounds.centerY);
    scene.clampCamera();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // The tile under the middle of its art, so screenFor projects it through the camera.
    const dx = (bounds.centerX - 896) / 32,
      dy = (bounds.centerY - 112) / 16;
    return scene.screenFor((dx + dy) / 2, (dy - dx) / 2);
  }, id);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('the Trader’s camp arrives at Town Hall 6 and a tap on his tent opens Weekly Deals', async ({
  page,
  browserName,
}) => {
  // A Town Hall 5 village has no camp.
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 5;
    m.changed();
  });
  expect(await page.evaluate(() => window.__game.scene.villageObjectSprites.size)).toBe(0);
  const tent = await showObject(page, 6, 'trader-tent');
  for (const id of ['trader-pots', 'trader-rug', 'trader-sign', 'trader'])
    await page.waitForFunction(
      (id) => window.__game.scene.villageObjectSprites.get(id)?.visible,
      id,
    );
  expect(
    await page.evaluate(() => window.__game.scene.villageObjectSprites.has('super-troops')),
  ).toBe(false);
  await page.screenshot({ path: `output/playtest/village-objects-trader-390-${browserName}.png` });
  await page.touchscreen.tap(tent.x, tent.y);
  await expect(page.locator('#modal-title')).toHaveText('Weekly Deals');
  // As in docs/TRADER.md, the deals stay locked until Town Hall 8.
  await expect(page.locator('[data-action="trader-buy:free-glowy-ore"]')).toBeDisabled();
  await expect(page.locator('.trader-deal').first()).toContainText(
    'Gem Offers unlock at Town Hall Level 8',
  );
});

test('the Super Troop building arrives at Town Hall 11, glows while a boost runs and lists the boosts', async ({
  page,
  browserName,
}) => {
  const sauna = await showObject(page, 11, 'super-troops');
  expect(
    await page.evaluate(
      () => window.__game.scene.villageObjectSprites.get('super-troops')!.texture.key,
    ),
  ).toBe('village-object-super-troops');
  await page.evaluate(async () => {
    const { superOriginal } = await import('/src/game/special-troops.ts');
    const m = window.__game.model,
      kind = Object.keys(m.state.army).find((k) => superOriginal(k as never))!;
    m.state.superBoosts = { [kind]: m.clock + 3_600_000 };
    m.changed();
  });
  await page.waitForFunction(
    () =>
      window.__game.scene.villageObjectSprites.get('super-troops')!.texture.key ===
      'village-object-super-troops-active',
  );
  await page.screenshot({ path: `output/playtest/village-objects-super-390-${browserName}.png` });
  await page.touchscreen.tap(sauna.x, sauna.y);
  await expect(page.locator('#army-family')).toHaveValue('super');
  await expect(page.locator('.army-tile').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
