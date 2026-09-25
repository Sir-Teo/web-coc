import { test, expect } from '@playwright/test';

test('live Castle rendering keeps source tiers, guard poses and original ruins', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    scene.model.battle = null;
    scene.model.state.obstacles = [];
    scene.model.state.buildings = Array.from({ length: 14 }, (_, i) =>
      makeBuilding(i + 1, 'clancastle', 10 + (i % 7) * 4, 16 + Math.floor(i / 7) * 5, i + 1),
    );
    scene.sync();
    scene.drawOverlay(0);
    const live = scene.castlePresentation;
    const first = [...live.castles.values()].map((v) => v.objects.length);
    const hidden = [...scene.sprites.values()].every((s) => s.alpha === 0);
    scene.model.state.buildings[4].hp = 0;
    scene.sync();
    scene.drawOverlay(1000);
    const ruin = live.castles.get(5).objects.length;
    return { count: live.castles.size, first, hidden, ruin, glError: game.renderer.gl.getError() };
  });
  expect(report.count).toBe(14);
  expect(report.first.every((n) => n > 0)).toBe(true);
  expect(report.hidden).toBe(true);
  expect(report.ruin).toBeGreaterThan(0);
  expect(report.glError).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `output/playtest/native-castle-live-${browserName}.png` });
});
