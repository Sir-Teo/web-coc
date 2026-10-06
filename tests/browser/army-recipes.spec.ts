import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('the Cookbook lists its Town Hall’s recipes and makes one the army in a tap', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { BUILDINGS } = await import('/src/game/data.ts');
    const m = window.__game.model;
    m.state.obstacles = [];
    m.townhall!.level = 10;
    // Complete army buildings and camps for 240 troop spaces, set apart from the village.
    const kinds = ['barracks', 'darkbarracks', 'spellfactory', 'darkspellfactory', 'workshop'];
    m.state.buildings = m.state.buildings.filter(
      (b) => !kinds.includes(b.kind) && b.kind !== 'camp',
    );
    kinds.forEach((kind, i) =>
      m.state.buildings.push(
        makeBuilding(
          m.state.nextId++,
          kind as 'barracks',
          4 + i * 5,
          36,
          BUILDINGS[kind as 'barracks'].maxLevel,
        ),
      ),
    );
    for (let x = 4; m.capacity < 240; x += 5)
      m.state.buildings.push(makeBuilding(m.state.nextId++, 'camp', x, 4, BUILDINGS.camp.maxLevel));
    m.changed();
  });
  await page.locator('.train-add').tap();
  await page.locator('[data-action="army-presets"]').tap();
  await expect(page.locator('#modal-title')).toHaveText('Quick armies');
  await page.locator('.preset-tabs [data-action="cookbook"]').tap();
  await expect(page.locator('#modal-title')).toHaveText('Cookbook');
  await expect(page.locator('.preset-tabs [aria-selected="true"]')).toHaveText('Cookbook');
  // Town Hall 10's four recipes, in the client's order.
  await expect(page.locator('.recipe-card h3')).toHaveText([
    'Hot Hog Summer',
    'Army of the Month',
    'Miner-a-rama!',
    'Wicked Witches',
  ]);
  const hogs = page.locator('[data-recipe="EV_TH10_HotHogSummer"]');
  await expect(hogs.locator('.recipe-head small')).toContainText('by Hog Rider · 240 troop');
  await expect(hogs.locator('.preset-heroes')).toContainText('Barbarian King');
  await expect(hogs).toContainText('Unavailable Heroes, Pets, or Equipment will be swapped');
  for (const target of [
    page.locator('.preset-tabs .tab').first(),
    hogs.locator('[data-action^="recipe-use:"]'),
    hogs.locator('.recipe-castle summary'),
  ]) {
    const box = (await target.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  // A creator's recipe links its guide.
  await expect(
    page.locator('[data-recipe="EV_TH10_June2025"] a[href*="youtube.com"]'),
  ).toHaveAttribute('target', '_blank');
  await page.screenshot({ path: `output/playtest/army-recipes-390-${browserName}.png` });
  await hogs.locator('[data-action="recipe-use:EV_TH10_HotHogSummer"]').tap();
  await expect(page.locator('#toast')).toContainText('Recipe Hot Hog Summer set as active army!');
  expect(
    await page.evaluate(() => {
      const s = window.__game.model.state;
      return {
        army: Object.fromEntries(Object.entries(s.army).filter(([, n]) => n)),
        spells: Object.fromEntries(Object.entries(s.spells).filter(([, n]) => n)),
      };
    }),
  ).toEqual({
    army: { hogrider: 16, valkyrie: 16, wizard: 8 },
    spells: { heal: 3, rage: 2, freeze: 1 },
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  // Save keeps a recipe as a Quick army, in the first empty slot.
  await page.locator('[data-action="recipe-save:EV_TH10_HotHogSummer"]').tap();
  await expect(page.locator('#toast')).toContainText('Hot Hog Summer saved as Quick army 1.');
  await page.locator('[data-action="recipe-save:EV_TH10_June2025"]').tap();
  await page.locator('[data-action="recipe-save:EV_TH10_ClasheramaMassMiners"]').tap();
  // With all three slots full, a card offers the slot to save over, each a 44-pixel target.
  const over = hogs.locator('.recipe-slots .game-btn');
  await expect(over).toHaveText(['1', '2', '3']);
  for (const box of await over.evaluateAll((all) =>
    all.map((b) => b.getBoundingClientRect().height),
  ))
    expect(box).toBeGreaterThanOrEqual(44);
  await page.locator('[data-action="recipe-save:EV_TH10_SeptemberWitches,1"]').tap();
  // Back on the Quick armies tab, the saved recipes are there.
  await page.locator('.preset-tabs [data-action="army-presets"]').tap();
  await expect(page.locator('#preset-name-0')).toHaveValue('Hot Hog Summer');
  await expect(page.locator('#preset-name-1')).toHaveValue('Wicked Witches');
  await expect(page.locator('#preset-name-2')).toHaveValue('Miner-a-rama!');
  await expect(page.locator('[data-action="preset-undo:1"]')).toBeVisible();
});

test('below Town Hall 10 the Cookbook says when its recipes begin', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => window.__game.hud.show('cookbook'));
  await expect(page.locator('.cookbook-body')).toContainText(
    'Featured and Creator recipes start appearing at Town Hall 10.',
  );
  await expect(page.locator('.recipe-card')).toHaveCount(0);
});
