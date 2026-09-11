import { test, expect } from '@playwright/test';
test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('Tesla shop gate and all six native level textures load', async ({ page }) => {
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="tab:Defenses"]').tap();
  await expect(page.locator('[data-action="build:tesla"]')).toBeDisabled();
  await expect(page.locator('.shop-tile').filter({ hasText: 'Hidden Tesla' })).toContainText(
    'Town Hall 7',
  );
  expect(
    await page.evaluate(() =>
      ['tesla', 'tesla-2', 'tesla-3', 'tesla-4', 'tesla-5', 'tesla-6'].every((k) =>
        window.__game.scene.textures.exists(k),
      ),
    ),
  ).toBe(true);
});

for (const width of [1440, 390, 320])
  test(`inspect Tesla progression and reload level six at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.state.obstacles = [];
      m.state.buildings = [
        makeBuilding(1, 'townhall', 20, 20, 8),
        makeBuilding(2, 'builder', 26, 26),
        makeBuilding(3, 'tesla', 10, 8, 6),
      ];
      m.state.nextId = 4;
      m.selected = 3;
      m.changed();
      scene.sync();
      scene.cameras.main.centerOn(960, 432);
    });
    await page.locator('[data-action="info"]').tap();
    await expect(page.locator('.info-table')).toContainText('75');
    await expect(page.locator('.info-table')).toContainText('7 tiles');
    await expect(page.locator('.info-table')).toContainText('0.6s');
    await expect(page.locator('.info-table')).toContainText('6 tiles');
    await expect(page.locator('.info-table')).toContainText('51% destruction');
    await expect(page.locator('.info-table')).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `output/playtest/tesla-info-${width}-${browserName}.png` });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).tap();
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    expect(
      await page.evaluate(() => {
        const { model: m, scene } = window.__game;
        return [
          m.state.buildings.find((b) => b.id === 3).level,
          scene.sprites.get(3).texture.key,
          scene.sprites.get(3).visible,
        ];
      }),
    ).toEqual([6, 'tesla-6', true]);
  });

for (const kind of ['giant', 'dragon'] as const)
  test(`concealment, emergence and electrical hit on ${kind}`, async ({ page, browserName }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluate(async (kind) => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.state.obstacles = [];
      m.state.buildings = [
        makeBuilding(1, 'townhall', 20, 20, 8),
        makeBuilding(2, 'builder', 26, 26),
        makeBuilding(3, 'tesla', 6, 10, 6),
      ];
      m.state.nextId = 4;
      m.state.army[kind] = 3;
      m.startBattle(0, true);
      scene.scene.pause();
      scene.sync();
      scene.drawOverlay();
      scene.cameras.main.centerOn(768, 400);
      m.activeTroop = kind;
    }, kind);
    const hidden = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      return {
        visible: scene.sprites.get(3).visible,
        blocked: m.deployBlocked(7, 11),
        pick: scene.pickBuilding(768, 400, { x: 7, y: 11 })?.id ?? null,
        text: JSON.parse(window.render_game_to_text()).buildings.some((b) => b.kind === 'tesla'),
        signature: scene.boundary.signature,
      };
    });
    expect(hidden.visible).toBe(false);
    expect(hidden.blocked).toBe(false);
    expect(hidden.pick).toBe(null);
    expect(hidden.text).toBe(false);
    await page.screenshot({ path: `output/playtest/tesla-hidden-${kind}-${browserName}.png` });
    const rise = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.deploy(1, 11);
      m.step(0.05);
      scene.sync();
      scene.drawOverlay();
      m.step(0.05);
      scene.drawOverlay();
      return {
        visible: scene.sprites.get(3).visible,
        cropped: scene.sprites.get(3).isCropped,
        blocked: m.deployBlocked(7, 11),
        signature: scene.boundary.signature,
      };
    });
    expect(rise.visible).toBe(true);
    expect(rise.cropped).toBe(true);
    expect(rise.blocked).toBe(true);
    expect(rise.signature).not.toBe(hidden.signature);
    await page.screenshot({ path: `output/playtest/tesla-rise-${kind}-${browserName}.png` });
    const hit = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      for (let i = 0; i < 12; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
      const zap = scene.children.list.find((o) => o.getData?.('teslaZap'))?.getData('teslaZap');
      return {
        zap,
        cropped: scene.sprites.get(3).isCropped,
        hp: m.battle.units[0].hp,
        maxHp: m.battle.units[0].maxHp,
        projectiles: m.battle.projectiles ?? [],
      };
    });
    expect(hit.zap).toBeDefined();
    expect(hit.zap.from.y).toBeLessThan(320);
    expect(hit.cropped).toBe(false);
    expect(hit.hp).toBeLessThan(hit.maxHp);
    expect(hit.projectiles).toHaveLength(0);
    await page.screenshot({ path: `output/playtest/tesla-zap-${kind}-${browserName}.png` });
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      for (let i = 0; i < 80; i++) m.step(0.05);
      m.finishBattle();
      m.returnHome();
      m.startReplay(m.state.raidLog[0].id);
      m.seekReplay(0);
      for (let i = 0; i < 50 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
    });
    expect(await page.evaluate(() => window.__game.scene.sprites.get(3).visible)).toBe(false);
    expect(
      await page.evaluate(
        () => window.__game.scene.children.list.filter((o) => o.getData?.('teslaZap')).length,
      ),
    ).toBe(0);
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.seekReplay(0.7);
      for (let i = 0; i < 50 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
    });
    expect(
      await page.evaluate(() => [
        window.__game.scene.sprites.get(3).visible,
        window.__game.scene.sprites.get(3).isCropped,
      ]),
    ).toEqual([true, false]);
    expect(errors).toEqual([]);
  });

test('Tesla destroyed while emerging leaves an uncropped ruin on its ground position', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [makeBuilding(1, 'townhall', 20, 20), makeBuilding(2, 'tesla', 6, 10)];
    m.state.nextId = 3;
    m.startBattle(0, true);
    scene.sync();
    scene.scene.pause();
    m.deploy(1, 11);
    m.step(0.05);
    scene.sync();
    m.step(0.05);
    scene.drawOverlay();
    const tower = m.battle.buildings.find((v) => v.kind === 'tesla'),
      im = scene.sprites.get(tower.id);
    const cropped = im.isCropped;
    m.damage(tower, 9999);
    // Exercise the per-frame destruction path, without a full scene sync.
    scene.renderRuin(tower, im);
    return { cropped, ruin: im.texture.key, afterCrop: im.isCropped, x: im.x, y: im.y };
  });
  expect(result).toEqual({ cropped: true, ruin: 'ruins-wood', afterCrop: false, x: 768, y: 400 });
});

test('touch construction, upgrade visibility and reduced-motion reveal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 7),
      makeBuilding(2, 'builder', 26, 26),
    ];
    m.state.nextId = 3;
    m.state.gold = 500000;
    m.changed();
    scene.sync();
    scene.cameras.main.centerOn(960, 432);
  });
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="tab:Defenses"]').tap();
  await page.locator('[data-action="build:tesla"]').tap();
  const point = await page.evaluate(() => window.__game.scene.screenFor(11, 9));
  await page.touchscreen.tap(point.x, point.y);
  const construction = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const tower = m.state.buildings.find((b) => b.kind === 'tesla');
    const result = [tower.constructing, (tower.upgradeEnd - tower.upgradeStart) / 1000, m.busy];
    m.startBattle(0, true);
    scene.sync();
    result.push(scene.sprites.get(tower.id).visible);
    return result;
  });
  expect(construction).toEqual([true, 7200, 1, true]);
  const reveal = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.returnHome();
    const tower = m.state.buildings.find((b) => b.kind === 'tesla');
    m.tick(tower.upgradeEnd + 1);
    m.state.settings.reducedMotion = true;
    m.startBattle(0, true);
    scene.scene.pause();
    scene.sync();
    m.battle.units.push({
      id: 999,
      kind: 'dragon',
      x: tower.x + 1,
      y: tower.y + 1,
      hp: 5000,
      maxHp: 5000,
      cooldown: 99,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    });
    m.battle.started = true;
    m.step(0.05);
    scene.sync();
    scene.drawOverlay();
    return [scene.sprites.get(tower.id).visible, scene.sprites.get(tower.id).isCropped];
  });
  expect(reveal).toEqual([true, false]);
});
