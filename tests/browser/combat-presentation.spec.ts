import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('destroyed stone, timber and walls become grounded rubble with intact aspect ratios', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.state.settings.reducedMotion = true;
    model.startBattle(0);
    for (const kind of ['townhall', 'barracks', 'wall']) {
      const building = model.battle.buildings.find((b) => b.kind === kind);
      model.damage(building, building.maxHp);
    }
    scene.sync();
  });
  const ruins = await page.evaluate(() => {
    const { model, scene } = window.__game;
    return ['townhall', 'barracks', 'wall'].map((kind) => {
      const b = model.battle.buildings.find((b) => b.kind === kind);
      const sprite = scene.sprites.get(b.id);
      return {
        kind,
        hp: b.hp,
        texture: sprite.texture.key,
        alpha: sprite.alpha,
        actualRatio: sprite.displayWidth / sprite.displayHeight,
        sourceRatio: sprite.width / sprite.height,
        depth: sprite.depth,
        ground: sprite.y,
      };
    });
  });
  for (const ruin of ruins) {
    expect(ruin.hp).toBe(0);
    expect(ruin.texture).toBe(ruin.kind === 'barracks' ? 'ruins-wood' : 'ruins-stone');
    expect(ruin.alpha).toBe(1);
    expect(ruin.actualRatio).toBeCloseTo(ruin.sourceRatio, 5);
    expect(ruin.depth).toBeLessThan(ruin.ground);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'output/playtest/ruins-desktop.png' });
  expect(errors).toEqual([]);
});

test('returning from a destroyed practice village restores every home building', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const { model, scene } = window.__game;
    const before = model.state.buildings.map((b) => [b.id, b.hp]);
    model.startBattle(0, true);
    for (const b of model.battle.buildings) model.damage(b, b.maxHp);
    scene.sync();
    const rubble = [...scene.sprites.values()].filter((s) =>
      s.texture.key.startsWith('ruins-'),
    ).length;
    model.finishBattle();
    model.returnHome();
    scene.sync();
    return {
      before,
      after: model.state.buildings.map((b) => [b.id, b.hp]),
      rubble,
      remainingRuins: [...scene.sprites.values()].filter((s) => s.texture.key.startsWith('ruins-'))
        .length,
      wrongOrigin: [...scene.sprites.values()].filter((s) => s.originY !== 0.88).length,
      groundCommands: scene.ruinGround.commandBuffer.length,
    };
  });
  expect(result.rubble).toBeGreaterThan(30);
  expect(result.after).toEqual(result.before);
  expect(result.remainingRuins).toBe(0);
  expect(result.wrongOrigin).toBe(0);
  // Phaser clear() may retain its line/fill setup, but no scar drawing commands.
  expect(result.groundCommands).toBeLessThan(10);
});
