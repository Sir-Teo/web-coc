import { test, expect } from '@playwright/test';
import { MORTAR_ART } from '../../src/game/mortar-art';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
});

test('eighteen original Mortar levels have distinct untinted artwork and stable scale', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const base = m.state.buildings.find((b) => b.kind === 'cannon');
    m.state.buildings = Array.from({ length: 18 }, (_, i) => ({
      ...base,
      id: 9000 + i,
      kind: 'mortar',
      x: 3 + (i % 6) * 5,
      y: 8 + Math.floor(i / 6) * 6,
      level: i + 1,
    }));
    m.state.nextId = 9018;
    m.state.obstacles = [];
    m.state.settings.reducedMotion = true;
    m.changed();
    scene.cameras.main.centerOn(1020, 640);
    scene.zoomBy(1.05);
  });
  await expect
    .poll(() =>
      page.evaluate(() => [...window.__game.scene.sprites.values()].map((im) => im.texture.key)),
    )
    .toEqual(Array.from({ length: 18 }, (_, i) => (i === 0 ? 'mortar' : `mortar-level-${i + 1}`)));
  const geometry = await page.evaluate(() =>
    [...window.__game.scene.sprites.values()].map((im) => ({
      width: im.displayWidth,
      height: im.displayHeight,
      origin: im.originY,
      tint: im.tintTopLeft,
      alpha: im.alpha,
    })),
  );
  expect(
    geometry.every(
      (g) =>
        g.width === MORTAR_ART.width &&
        g.height === MORTAR_ART.height &&
        g.origin === MORTAR_ART.originY &&
        g.tint === 0xffffff &&
        g.alpha === 0,
    ),
  ).toBe(true);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `output/playtest/mortar-level-gallery-${test.info().project.name || 'chromium'}.png`,
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
});

test('a paid upgrade changes the village and Info artwork without moving the building', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 5;
    const id = m.state.nextId++;
    m.state.buildings.push({
      id,
      kind: 'mortar',
      x: 2,
      y: 2,
      level: 2,
      hp: 450,
      maxHp: 450,
      stored: 0,
      cooldown: 0,
    });
    m.state.obstacles = [];
    m.state.gold = 100000;
    m.selected = id;
    m.changed();
    return id;
  });
  await expect(page.locator('.context-art')).toHaveAttribute('src', /mortar-native\/level-2.png$/);
  const before = await page.evaluate((id) => {
    const im = window.__game.scene.sprites.get(id);
    return [im.x, im.y, im.displayWidth, im.displayHeight];
  }, id);
  await page.locator('[data-action="info"]').click();
  await expect(page.locator('.info-hero img')).toHaveAttribute('src', /level-2.png$/);
  await page.locator(`.info-upgrade [data-action="upgrade:${id}"]`).click();
  await page.evaluate((id) => {
    const m = window.__game.model;
    m.tick(m.state.buildings.find((b) => b.id === id).upgradeEnd);
    m.selected = id;
    m.changed();
  }, id);
  await expect(page.locator('.context-art')).toHaveAttribute('src', /level-3.png$/);
  expect(
    await page.evaluate((id) => {
      const im = window.__game.scene.sprites.get(id);
      return [im.x, im.y, im.displayWidth, im.displayHeight];
    }, id),
  ).toEqual(before);
  // The Info sheet remains open and updates when the upgrade completes.
  await expect(page.locator('.info-hero img')).toHaveAttribute('src', /level-3.png$/);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `output/playtest/mortar-art-info-${test.info().project.name || 'chromium'}.png`,
    animations: 'disabled',
  });
});

test('moving a high-level Mortar preserves its artwork in the placement preview', async ({
  page,
}) => {
  const id = await page.evaluate(() => {
    const { model: m } = window.__game;
    const b = m.state.buildings.find((b) => b.kind === 'cannon');
    b.kind = 'mortar';
    b.level = 18;
    m.selected = b.id;
    m.changed();
    return b.id;
  });
  await page
    .locator('.building-context')
    .getByRole('button', { name: 'Move', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.ghost?.texture.key))
    .toBe('mortar-level-18');
  expect(
    await page.evaluate(() => [
      window.__game.scene.ghost.displayWidth,
      window.__game.scene.ghost.displayHeight,
    ]),
  ).toEqual([MORTAR_ART.width, MORTAR_ART.height]);
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.texture.key, id))
    .toBe('mortar-level-18');
});

test('all eighteen original projectiles retain their airborne position after launcher destruction', async ({
  page,
}) => {
  for (let level = 1; level <= 18; level++) {
    const result = await page.evaluate(async (level) => {
      const { model: m, scene } = window.__game;
      const { mortarBattle } = await import('/tests/fixtures/mortar-battle.ts');
      scene.paused = true;
      m.returnHome();
      const fixture = mortarBattle(level);
      m.battle = fixture.battle;
      m.state.settings.reducedMotion = false;
      m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const view = () =>
        [...scene.mortarPresentation.projectiles.values()]
          .flatMap((v) => v.objects)
          .map((o) => ({
            x: o.x,
            y: o.y,
            vertices: o.vertices ? [...o.vertices] : undefined,
            data: o.getData('nativeMortarProjectile'),
          }));
      const launch = view();
      m.step(0.3);
      scene.drawOverlay(0);
      const before = view();
      m.battle.buildings.find((b) => b.id === 6).hp = 0;
      scene.sync();
      scene.drawOverlay(0);
      return {
        launch,
        before,
        after: view(),
        ruin: scene.sprites.get(6).getData('nativeMortarRuin'),
      };
    }, level);
    expect(result.launch.length).toBeGreaterThan(0);
    expect(result.launch.every((o) => o.data.level === level)).toBe(true);
    expect(result.before).not.toEqual(result.launch);
    expect(result.after).toEqual(result.before);
    expect(result.ruin).toBe(true);
  }
});
