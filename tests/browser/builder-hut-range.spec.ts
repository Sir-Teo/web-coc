import { expect, test, type Page } from '@playwright/test';

async function village(page: Page, level: number) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (level) => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
    const { model, scene } = window.__game;
    scene.paused = true;
    model.state.obstacles = [];
    model.state.buildings = [
      makeBuilding(1, 'townhall', 36, 36, 18),
      makeBuilding(2, 'builder', 24, 14, level),
    ];
    model.state.nextId = 100;
    model.state.army = { ...emptyArmy(), giant: 1 };
    model.state.spells = emptySpells();
    model.state.king = undefined;
    model.selected = 2;
    model.changed();
    scene.sync();
  }, level);
}

for (const width of [1440, 390]) {
  test(`Builder's Hut range ring follows its armed tiers at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await village(page, 1);
    for (const level of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const ring = await page.evaluate(async (level) => {
        const { makeBuilding } = await import('/src/game/model.ts');
        const { iso } = await import('/src/game/scene.ts');
        const { model, scene } = window.__game;
        model.state.buildings[1] = makeBuilding(2, 'builder', 24, 14, level);
        model.selected = 2;
        model.changed();
        scene.sync();
        const center = iso(25, 15);
        scene.cameras.main.centerOn(center.x, center.y);
        const graphics = scene.overlay;
        const stroke = graphics.strokeEllipse;
        let result = null;
        graphics.strokeEllipse = function (x, y, width, height) {
          if (Math.abs(x - center.x) < 0.001 && Math.abs(y - center.y) < 0.001)
            result = { width, height };
          return stroke.call(this, x, y, width, height);
        };
        try {
          scene.drawOverlay(0);
        } finally {
          graphics.strokeEllipse = stroke;
        }
        return result;
      }, level);
      if (level === 1) expect(ring).toBeNull();
      else {
        expect(ring, `level ${level}`).not.toBeNull();
        expect(ring!.width).toBeCloseTo(7 * 64 * Math.SQRT2, 6);
        expect(ring!.height).toBeCloseTo(7 * 32 * Math.SQRT2, 6);
      }
    }
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    await page.screenshot({
      path: `output/playtest/builder-hut-range-home-${width}-${browserName}.png`,
    });
  });

  test(`scouting an armed Builder's Hut shows its source range at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await village(page, 8);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.startBattle(0, true);
      model.activeTroop = 'giant';
      model.selected = null;
      model.changed();
      scene.sync();
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const point = await page.evaluate(async () => {
      const { iso } = await import('/src/game/scene.ts');
      const { scene } = window.__game;
      const center = iso(25, 15);
      scene.cameras.main.setZoom(1).centerOn(center.x, center.y - 45);
      scene.drawOverlay(0);
      return scene.screenFor(25, 15);
    });
    await page.mouse.click(point.x, point.y - 20);
    await expect(page.locator('#toast')).toContainText('Range 7 tiles');
    expect(await page.evaluate(() => window.__game.model.selected)).toBe(2);
    expect(await page.evaluate(() => window.__game.model.battle.units.length)).toBe(0);
    await page.screenshot({
      path: `output/playtest/builder-hut-range-scout-${width}-${browserName}.png`,
    });
  });
}
