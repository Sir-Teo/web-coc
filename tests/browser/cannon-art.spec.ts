import { test, expect } from '@playwright/test';
import { CANNON_ART } from '../../src/game/cannon-art';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
});

test('twenty-one original Cannon levels have distinct untinted artwork and stable scale', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const base = m.state.buildings.find((b) => b.kind === 'cannon');
    m.state.buildings = Array.from({ length: 21 }, (_, i) => ({
      ...base,
      id: 9000 + i,
      kind: 'cannon',
      x: 3 + (i % 7) * 5,
      y: 8 + Math.floor(i / 7) * 6,
      level: i + 1,
    }));
    m.state.nextId = 9021;
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
    .toEqual(Array.from({ length: 21 }, (_, i) => `cannon-level-${i + 1}`));
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
        g.width === CANNON_ART.width &&
        g.height === CANNON_ART.height &&
        g.origin === CANNON_ART.originY &&
        g.tint === 0xffffff &&
        g.alpha === 0,
    ),
  ).toBe(true);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `output/playtest/cannon-level-gallery-${browserName}.png`,
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
});

for (const [width, height] of [
  [320, 844],
  [390, 844],
  [844, 390],
])
  test(`a paid Cannon upgrade preserves artwork, position and one row of level markers at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height });
    const id = await page.evaluate(() => {
      const m = window.__game.model;
      m.townhall.level = 5;
      const id = m.state.nextId++;
      m.state.buildings.push({
        id,
        kind: 'cannon',
        x: 2,
        y: 2,
        level: 2,
        hp: 360,
        maxHp: 360,
        stored: 0,
        cooldown: 0,
      });
      m.state.obstacles = [];
      m.state.gold = 100000;
      m.selected = id;
      m.changed();
      return id;
    });
    await expect(page.locator('.context-art')).toHaveAttribute('src', /cannon-native\/icon-2.png$/);
    const before = await page.evaluate((id) => {
      const im = window.__game.scene.sprites.get(id);
      return [im.x, im.y, im.displayWidth, im.displayHeight];
    }, id);
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-hero img')).toHaveAttribute('src', /icon-2.png$/);
    await page.locator(`.info-upgrade [data-action="upgrade:${id}"]`).click();
    await page.evaluate((id) => {
      const m = window.__game.model;
      m.tick(m.state.buildings.find((b) => b.id === id).upgradeEnd);
      m.selected = id;
      m.changed();
    }, id);
    await expect(page.locator('.context-art')).toHaveAttribute('src', /icon-3.png$/);
    expect(
      await page.evaluate((id) => {
        const im = window.__game.scene.sprites.get(id);
        return [im.x, im.y, im.displayWidth, im.displayHeight];
      }, id),
    ).toEqual(before);
    // The Info sheet remains open and updates when the upgrade completes.
    await expect(page.locator('.info-hero img')).toHaveAttribute('src', /icon-3.png$/);
    const markers = await page.locator('.info-levels').evaluate((el) => {
      const bounds = el.getBoundingClientRect();
      const bars = [...el.children].map((v) => v.getBoundingClientRect());
      return {
        count: bars.length,
        filled: el.querySelectorAll('.on').length,
        rows: new Set(bars.map((r) => r.top)).size,
        minWidth: Math.min(...bars.map((r) => r.width)),
        inside: bars.every((r) => r.left >= bounds.left - 0.01 && r.right <= bounds.right + 0.01),
        equal: Math.max(...bars.map((r) => r.width)) - Math.min(...bars.map((r) => r.width)),
      };
    });
    expect(markers).toMatchObject({ count: 21, filled: 3, rows: 1, inside: true });
    expect(markers.minWidth).toBeGreaterThan(5);
    expect(markers.equal).toBeLessThan(0.1);
    await expect(page.locator('#toast')).not.toHaveClass(/\bshow\b/);
    await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
    await page.locator('.info-hero').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `output/playtest/cannon-info-markers-${width}-${browserName}.png`,
      animations: 'disabled',
    });
  });

test('moving a high-level Cannon preserves its artwork in the placement preview', async ({
  page,
}) => {
  const id = await page.evaluate(() => {
    const { model: m } = window.__game;
    const b = m.state.buildings.find((b) => b.kind === 'cannon');
    b.kind = 'cannon';
    b.level = 21;
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
    .toBe('cannon-level-21');
  expect(
    await page.evaluate(() => [
      window.__game.scene.ghost.displayWidth,
      window.__game.scene.ghost.displayHeight,
    ]),
  ).toEqual([CANNON_ART.width, CANNON_ART.height]);
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.texture.key, id))
    .toBe('cannon-level-21');
});

test('all twenty-one original projectiles retain their airborne position after launcher destruction', async ({
  page,
}) => {
  for (let level = 1; level <= 21; level++) {
    const result = await page.evaluate(async (level) => {
      const { model: m, scene } = window.__game;
      const { cannonBattle } = await import('/tests/fixtures/cannon-battle.ts');
      scene.paused = true;
      m.returnHome();
      const fixture = cannonBattle(level);
      m.battle = fixture.battle;
      m.state.settings.reducedMotion = false;
      m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const view = () =>
        [...scene.cannonPresentation.projectiles.values()]
          .flatMap((v) => v.objects)
          .map((o) => ({
            x: o.x,
            y: o.y,
            vertices: o.vertices ? [...o.vertices] : undefined,
            data: o.getData('nativeCannonProjectile'),
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
        ruin: scene.sprites.get(6).getData('nativeCannonRuin'),
      };
    }, level);
    expect(result.launch.length).toBeGreaterThan(0);
    expect(result.launch.every((o) => o.data.level === level)).toBe(true);
    expect(result.before).not.toEqual(result.launch);
    expect(result.after).toEqual(result.before);
    expect(result.ruin).toBe(true);
  }
});
