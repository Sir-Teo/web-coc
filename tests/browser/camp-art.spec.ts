import { test, expect } from '@playwright/test';
import { campArt } from '../../src/game/camp-art';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
});

test('eight open fire-pit levels retain their ground anchors, materials and four-tile placement area', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const appearances = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const template = m.state.buildings.find((b) => b.kind === 'camp');
    m.state.buildings = Array.from({ length: 8 }, (_, i) => ({
      ...template,
      id: 9000 + i,
      level: i + 1,
      x: 8 + (i % 4) * 5 + Math.floor(i / 4) * 5,
      y: 23 - (i % 4) * 5 + Math.floor(i / 4) * 5,
    }));
    m.state.nextId = 9008;
    m.state.obstacles = [];
    for (const k of Object.keys(m.state.army)) m.state.army[k] = 0;
    m.state.settings.reducedMotion = true;
    m.changed();
    scene.sync();
    // The gallery isolates the eight assets from the village's decorative flags.
    scene.children.list
      .filter((im) => im.texture?.key === 'flag')
      .forEach((im) => im.setVisible(false));
    scene.cameras.main.centerOn(896, 752);
    scene.zoomBy(1.25);
    return [...scene.sprites.values()].map((im) => ({
      texture: im.texture.key,
      width: im.displayWidth,
      height: im.displayHeight,
      originX: im.originX,
      originY: im.originY,
      tint: im.tintTopLeft,
    }));
  });
  expect(appearances).toEqual(
    Array.from({ length: 8 }, (_, i) => {
      const a = campArt(i + 1);
      return {
        texture: i ? `camp-level-${i + 1}` : 'camp',
        width: a.width,
        height: a.width,
        originX: a.originX,
        originY: a.originY,
        tint: 0xffffff,
      };
    }),
  );
  await page.evaluate(
    () =>
      new Promise((resolve) => window.__game.game.events.once('postrender', () => resolve(null))),
  );
  await page.screenshot({
    path: `output/playtest/camp-level-gallery-${test.info().project.name || 'chromium'}.png`,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => window.__game.model.canPlace('wall', 11, 26))).toBe(false);
  expect(errors).toEqual([]);
});

test('a paid camp upgrade updates Info and village art, then moves with the same anchor on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const before = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.townhall.level = 3;
    const b = m.state.buildings.find((b) => b.kind === 'camp');
    m.selected = b.id;
    m.changed();
    scene.sync();
    scene.cameras.main.centerOn(896 + (b.x - b.y) * 32, 112 + (b.x + b.y + 4) * 16);
    const im = scene.sprites.get(b.id);
    return { id: b.id, x: im.x, y: im.y };
  });
  await page.locator('[data-action="info"]').click();
  await expect(page.locator('.info-hero img')).toHaveAttribute(
    'src',
    /camp-levels-v1\/level-2.webp$/,
  );
  await page.locator(`.info-upgrade [data-action="upgrade:${before.id}"]`).click();
  await page.evaluate((id) => {
    const { model: m, scene } = window.__game;
    m.tick(m.state.buildings.find((b) => b.id === id).upgradeEnd);
    m.selected = id;
    m.changed();
    scene.sync();
  }, before.id);
  await expect(page.locator('.info-hero img')).toHaveAttribute(
    'src',
    /camp-levels-v1\/level-3.webp$/,
  );
  await page.evaluate(
    () =>
      new Promise((resolve) => window.__game.game.events.once('postrender', () => resolve(null))),
  );
  await page.screenshot({
    path: `output/playtest/camp-art-info-${test.info().project.name || 'chromium'}.png`,
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  const appearance = await page.evaluate((id) => {
    const im = window.__game.scene.sprites.get(id);
    return {
      x: im.x,
      y: im.y,
      width: im.displayWidth,
      originX: im.originX,
      originY: im.originY,
      texture: im.texture.key,
    };
  }, before.id);
  expect([appearance.x, appearance.y]).toEqual([before.x, before.y]);
  await page.locator(`[data-action="move:${before.id}"]`).click();
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.ghost?.texture.key))
    .toBe('camp-level-3');
  expect(
    await page.evaluate(() => {
      const im = window.__game.scene.ghost;
      return { width: im.displayWidth, originX: im.originX, originY: im.originY };
    }),
  ).toEqual({ width: appearance.width, originX: appearance.originX, originY: appearance.originY });
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(
    await page.evaluate((id) => window.__game.scene.sprites.get(id).texture.key, before.id),
  ).toBe('camp-level-3');
});

test('troops gather on open camp tiles, avoid the fire and reroute around a new obstacle without losing actors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const read = () =>
    page.evaluate(() => window.__game.scene.campActors.map((a) => ({ id: a.id, route: a.route })));
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const b = m.state.buildings.find((b) => b.kind === 'camp');
    b.x = 10;
    b.y = 10;
    b.level = 6;
    m.state.buildings = [b];
    m.state.obstacles = [];
    for (const k of Object.keys(m.state.army)) m.state.army[k] = k === 'swordsman' ? 30 : 0;
    m.state.settings.reducedMotion = true;
    m.changed();
    scene.sync();
    scene.cameras.main.centerOn(896, 496);
    scene.zoomBy(1.6);
  });
  const before = await read();
  expect(before).toHaveLength(30);
  expect(
    before.some((a) => a.route.some((p) => p.x >= 10 && p.x < 14 && p.y >= 10 && p.y < 14)),
  ).toBe(true);
  expect(
    before.every((a) => a.route.every((p) => !(p.x >= 11 && p.x < 13 && p.y >= 11 && p.y < 13))),
  ).toBe(true);
  await page.evaluate(
    () =>
      new Promise((resolve) => window.__game.game.events.once('postrender', () => resolve(null))),
  );
  await page.screenshot({
    path: `output/playtest/camp-open-gathering-${test.info().project.name || 'chromium'}.png`,
    animations: 'disabled',
  });
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.state.obstacles = [{ id: 9000, kind: 'trees', x: 14, y: 11 }];
    m.changed();
    scene.sync();
  });
  const after = await read();
  expect(after.map((a) => a.id)).toEqual(before.map((a) => a.id));
  expect(
    after.every((a) => a.route.every((p) => !(p.x >= 14 && p.x < 16 && p.y >= 11 && p.y < 13))),
  ).toBe(true);
  expect(after).not.toEqual(before);
});

test('destroyed wooden and standing-rock camps retain their ground position and level-sized ruins', async ({
  page,
}) => {
  const snapshots = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const template = m.state.buildings.find((b) => b.kind === 'camp');
    m.state.buildings = [
      { ...template, id: 9100, x: 10, y: 10, level: 2 },
      { ...template, id: 9101, x: 15, y: 10, level: 8 },
    ];
    m.state.obstacles = [];
    for (const k of Object.keys(m.state.army)) m.state.army[k] = 0;
    m.state.army.swordsman = 1;
    m.startBattle(0, true);
    scene.sync();
    const positions = [...scene.sprites.values()].map((im) => ({ x: im.x, y: im.y }));
    m.battle.buildings.forEach((b) => (b.hp = 0));
    scene.sync();
    const ruined = [...scene.sprites.values()].map((im) => ({
      x: im.x,
      y: im.y,
      width: im.displayWidth,
      texture: im.texture.key,
      originX: im.originX,
      originY: im.originY,
      alpha: im.alpha,
      tint: im.tintTopLeft,
    }));
    m.finishBattle();
    m.returnHome();
    scene.sync();
    return { positions, ruined, restored: [...scene.sprites.values()].map((im) => im.texture.key) };
  });
  expect(snapshots.ruined).toEqual(
    [2, 8].map((level, i) => ({
      ...snapshots.positions[i],
      width: campArt(level).width * 0.98,
      texture: level === 2 ? 'ruins-wood' : 'ruins-stone',
      originX: 0.5,
      originY: 0.58,
      alpha: 1,
      tint: 0xffffff,
    })),
  );
  expect(snapshots.restored).toEqual(['camp-level-2', 'camp-level-8']);
});
