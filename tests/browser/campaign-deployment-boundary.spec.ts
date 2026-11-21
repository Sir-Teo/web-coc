import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, isMobile: true });

for (const { index, width, height } of [
  { index: 0, width: 390, height: 844 },
  { index: 1, width: 568, height: 320 },
]) {
  test(`campaign deployment follows the drawn fractional edge on stage ${index + 1}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?lazyart');
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.locator('.attack-btn').tap();
    await page.locator(`[data-action="attack:${index}"]`).tap();
    await page.waitForFunction(() => !window.__game.scene.scoutingArtNotice());
    await page.locator('[data-action="troop:swordsman"]').tap();

    const probe = await page.evaluate(async () => {
      const { iso } = await import('/src/game/scene.ts');
      const { model, scene } = window.__game;
      for (const building of model.battle.buildings) {
        if (building.kind === 'wall') continue;
        const y = building.y + 0.25;
        const x = building.x - 1.5;
        if (!model.deployBlocked(x + 0.25, y) || model.deployBlocked(x - 0.25, y)) continue;
        const edges = scene.battleBoundary();
        const line = edges.find(
          ([left, top, right, bottom]) => left === right && top < y && bottom > y && left === x,
        );
        if (!line) continue;
        scene.setZoom(1.5);
        const p = iso(x, y);
        scene.cameras.main.centerOn(p.x, p.y + (innerWidth > innerHeight ? 54 : -90));
        const blocked = scene.screenFor(x + 0.25, y);
        const allowed = scene.screenFor(x - 0.25, y);
        if (
          [blocked, allowed].every((p) => document.elementFromPoint(p.x, p.y) === scene.game.canvas)
        )
          return { blocked, allowed };
      }
      throw Error('No exposed half-tile edge matches placement legality');
    });

    await page.touchscreen.tap(probe.blocked.x, probe.blocked.y);
    expect(await page.evaluate(() => window.__game.model.battle.units.length)).toBe(0);
    await page.touchscreen.tap(probe.allowed.x, probe.allowed.y);
    await expect.poll(() => page.evaluate(() => window.__game.model.battle.units.length)).toBe(1);
  });
}
