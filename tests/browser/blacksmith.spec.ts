import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page, smith = true) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (smith) => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 8),
      makeBuilding(2, 'herohall', 4, 4, 2),
      makeBuilding(3, 'builder', 30, 30),
    ];
    if (smith) m.state.buildings.push(makeBuilding(4, 'blacksmith', 8, 4));
    m.state.nextId = 10;
    m.state.king = { level: 20 };
    m.state.gems = 1000;
    m.state.ores = { shiny: 120, glowy: 0, starry: 4 };
    m.changed();
    scene.sync();
  }, smith);
  await page.locator('.train-add').click();
  await page.locator('[data-action="heroes"]').click();
  await page.locator('[data-action="equipment-view:puppet"]').click();
}
for (const [width, height] of [
  [1440, 960],
  [390, 844],
  [320, 740],
  [844, 390],
])
  test(`equipment slots, ore upgrade and gem confirmation at ${width}×${height}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page);
    await expect(page.locator('.ore-wallet')).toContainText('120');
    await expect(page.locator('.ore-wallet')).toContainText('Starry Ore');
    await expect(page.locator('.equipment-detail')).toContainText('309');
    await expect(page.locator('.equipment-detail')).toContainText('385');
    await page.locator('[data-action="equipment-upgrade:puppet,1"]').click();
    await expect(page.locator('.equipment-detail-heading')).toContainText('Level 2');
    expect(
      await page.evaluate(() => [window.__game.model.ores.shiny, window.__game.model.state.gems]),
    ).toEqual([0, 1000]);
    await page.locator('[data-action="equipment-upgrade:puppet,2"]').click();
    await expect(page.locator('.missing-ores')).toContainText('240');
    await expect(page.locator('.missing-ores')).toContainText('20');
    await expect(page.locator('[data-action="ore-buy"]')).toContainText('340');
    await expect(page.locator('#toast')).not.toHaveClass(/show/);
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/blacksmith-purchase-${width}-${browserName}.png`,
    });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await page.evaluate(() => window.__game.model.state.gems)).toBe(1000);
    await page.locator('[data-action="equipment-upgrade:puppet,2"]').click();
    await page.locator('[data-action="ore-buy"]').click();
    await expect(page.locator('.equipment-detail-heading')).toContainText('Level 3');
    expect(await page.evaluate(() => window.__game.model.state.gems)).toBe(660);
    await page.locator('.equipment-card[data-action="equipment-view:boots"]').click();
    await page.locator('[data-action="equipment-equip:boots,0"]').click();
    await expect(page.locator('.equipment-slots')).toContainText('Earthquake Boots');
    await expect(page.locator('.equipped-label')).toContainText('slot 1');
    await page.locator('.ore-wallet').scrollIntoViewIfNeeded();
    await expect(page.locator('#toast')).not.toHaveClass(/show/);
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/blacksmith-panel-${width}-${browserName}.png`,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page.locator('.blacksmith-body').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      await page
        .locator('.blacksmith-body img')
        .evaluateAll((imgs) =>
          imgs.every(
            (i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    ).toBe(true);
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('.train-add').click();
    await page.locator('[data-action="heroes"]').click();
    await expect(page.locator('[data-hero="king"] .hero-equipment')).toContainText(
      'Earthquake Boots',
    );
    expect(
      await page.evaluate(() => [
        window.__game.model.kingEquipment.levels.puppet,
        window.__game.model.state.gems,
        window.__game.model.ores.starry,
      ]),
    ).toEqual([3, 660, 4]);
    expect(errors).toEqual([]);
  });

test('locked and unaffordable upgrades are explained without losing resources', async ({
  page,
}) => {
  await boot(page, false);
  await expect(page.locator('.equipment-locked')).toContainText('Town Hall 8');
  await expect(page.locator('[data-action="equipment-upgrade:puppet,1"]')).toBeDisabled();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const m = window.__game.model;
    m.state.buildings.push(makeBuilding(4, 'blacksmith', 8, 4));
    m.state.ores.shiny = 0;
    m.state.gems = 0;
    m.changed();
  });
  await page.locator('[data-action="equipment-upgrade:puppet,1"]').click();
  await expect(page.locator('.ore-insufficient')).toContainText('Not enough gems');
  await expect(page.locator('[data-action="ore-buy"]')).toBeDisabled();
  expect(await page.evaluate(() => window.__game.model.kingEquipment.levels.puppet)).toBe(1);
});

test('Blacksmith scene sprite matches the shipped alpha asset and quake effects follow the battle clock', async ({
  page,
  browserName,
}) => {
  await boot(page);
  const result = await page.evaluate(async () => {
    const { model: m, scene } = window.__game;
    const sprite = scene.sprites.get(4),
      info = [sprite.texture.key, sprite.originY, sprite.displayWidth];
    m.equipKing('boots', 0);
    m.startBattle(0, true);
    scene.scene.pause();
    m.deployHero(12, 15);
    m.activateHeroAbility();
    m.step(0.69);
    scene.sync();
    scene.drawOverlay();
    const count = () => scene.children.list.filter((x) => x.getData?.('kingQuake'));
    const before = count().length;
    m.step(0.02);
    scene.sync();
    scene.drawOverlay();
    const visible = count().length,
      alpha = count()[0]?.alpha;
    scene.drawOverlay(99999);
    const frozen = count()[0]?.alpha;
    m.step(0.2);
    scene.drawOverlay();
    return { info, before, visible, alpha, frozen, faded: count()[0]?.alpha };
  });
  expect(result.info).toEqual(['blacksmith', 0.88, 162]);
  expect(result.before).toBe(0);
  expect(result.visible).toBe(1);
  expect(result.frozen).toBe(result.alpha);
  expect(result.faded).toBeLessThan(result.alpha);
  await page.locator('[data-action="close"]').click();
  await page.screenshot({ path: `output/playtest/blacksmith-quake-${browserName}.png` });
  const cleaned = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.returnHome();
    scene.sync();
    return scene.children.list.filter((x) => x.getData?.('kingQuake')).length;
  });
  expect(cleaned).toBe(0);
});
