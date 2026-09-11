import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
});

const appearance = (page: Page, id?: number) =>
  page.evaluate((id) => {
    const scene = window.__game.scene;
    const im = id === undefined ? scene.ghost : scene.sprites.get(id);
    return (
      im && {
        texture: im.texture.key,
        width: im.displayWidth,
        height: im.displayHeight,
        originX: im.originX,
        originY: im.originY,
      }
    );
  }, id);

test('moving previews preserve artwork and geometry across the building catalog', async ({
  page,
}) => {
  const kinds = await page.evaluate(async () => {
    const { BUILDINGS } = await import('/src/game/data.ts');
    const m = window.__game.model;
    m.state.obstacles = [];
    m.state.settings.reducedMotion = true;
    // Reuse a real building to keep every preview on the same visible tiles.
    m.state.buildings = [m.townhall];
    m.townhall.x = 12;
    m.townhall.y = 12;
    return Object.keys(BUILDINGS);
  });
  for (const kind of kinds) {
    for (const requestedLevel of [1, 3, 5, 8]) {
      const id = await page.evaluate(
        async ({ kind, requestedLevel }) => {
          const { BUILDINGS } = await import('/src/game/data.ts');
          const { model: m, scene } = window.__game;
          m.cancel();
          const b = m.state.buildings[0];
          b.kind = kind;
          b.level = Math.min(requestedLevel, BUILDINGS[kind].maxLevel);
          m.changed();
          scene.sync();
          return b.id;
        },
        { kind, requestedLevel },
      );
      const placed = await appearance(page, id);
      await page.evaluate((id) => {
        window.__game.model.move(id);
        window.__game.scene.sync();
      }, id);
      expect(await appearance(page), `${kind} at level ${requestedLevel}`).toEqual(placed);
    }
  }
});

test('a phone move keeps an upgraded Archer Tower through blocked placement, cancellation and reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const original = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const b = m.state.buildings.find((b) => b.kind === 'archertower');
    b.level = 8;
    m.townhall.level = 7;
    m.state.settings.reducedMotion = true;
    m.state.obstacles = [];
    m.selected = b.id;
    m.changed();
    scene.cameras.main.centerOn(896, 490);
    return { id: b.id, x: b.x, y: b.y, gold: m.state.gold, busy: m.busy };
  });
  await expect(page.locator('.context-art')).toHaveAttribute('src', /tier3\/archertower.webp$/);
  const placed = await appearance(page, original.id);
  await page.locator(`[data-action="move:${original.id}"]`).click();
  await expect.poll(() => appearance(page)).toEqual(placed);
  const point = async (x: number, y: number) =>
    page.evaluate(
      ({ x, y }) => {
        const c = window.__game.scene.cameras.main;
        return {
          x: c.width / 2 + (896 + (x - y) * 32 - c.midPoint.x) * c.zoom,
          y: c.height / 2 + (112 + (x + y) * 16 - c.midPoint.y) * c.zoom,
        };
      },
      { x, y },
    );
  const occupied = await page.evaluate(() => {
    const b = window.__game.model.townhall;
    return { x: b.x + 0.2, y: b.y + 0.2 };
  });
  const blocked = await point(occupied.x, occupied.y);
  await page.mouse.move(blocked.x, blocked.y);
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.ghost?.tintTopLeft))
    .toBe(0xff7272);
  await page.mouse.click(blocked.x, blocked.y);
  expect(await page.evaluate(() => window.__game.model.moving)).toBe(original.id);
  await page.keyboard.press('Escape');
  expect(await appearance(page, original.id)).toEqual(placed);
  await page.evaluate((id) => {
    const m = window.__game.model;
    m.selected = id;
    m.changed();
  }, original.id);
  await page.locator(`[data-action="move:${original.id}"]`).click();
  const destination = await point(19.2, 14.2);
  await page.mouse.move(destination.x, destination.y);
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.ghost?.tintTopLeft))
    .toBe(0xd9ffb0);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `output/playtest/upgraded-building-move-${test.info().project.name || 'chromium'}.png`,
    animations: 'disabled',
  });
  await page.mouse.click(destination.x, destination.y);
  await expect.poll(() => page.evaluate(() => window.__game.model.moving)).toBeNull();
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(await appearance(page, original.id)).toEqual(placed);
  expect(
    await page.evaluate((id) => {
      const m = window.__game.model,
        b = m.state.buildings.find((b) => b.id === id);
      return { x: b.x, y: b.y, level: b.level, gold: m.state.gold, busy: m.busy };
    }, original.id),
  ).toEqual({ x: 19, y: 14, level: 8, gold: original.gold, busy: original.busy });
});

test('a paid upgrade completing during a move refreshes preview size without changing texture', async ({
  page,
}) => {
  const id = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    scene.paused = true;
    const b = m.state.buildings.find((b) => b.kind === 'goldmine');
    b.level = 2;
    m.state.elixir = 100000;
    m.upgrade(b.id);
    m.move(b.id);
    scene.sync();
    return b.id;
  });
  const before = await appearance(page);
  expect(before).toEqual(await appearance(page, id));
  await page.evaluate((id) => {
    const { model: m, scene } = window.__game;
    m.tick(m.state.buildings.find((b) => b.id === id).upgradeEnd);
    scene.sync();
  }, id);
  const after = await appearance(page);
  expect(after.texture).toBe(before.texture);
  expect(after.width).toBeGreaterThan(before.width);
  expect(after).toEqual(await appearance(page, id));
});
