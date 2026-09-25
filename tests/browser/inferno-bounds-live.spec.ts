import { test, expect } from '@playwright/test';

test('Inferno selection follows each original tier and construction state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const results = await page.evaluate(async () => {
    const { scene } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { infernoPoses, INFERNO_ROOT } = await import('/src/game/inferno-art.ts');
    const { nativeSceneBounds } = await import('/src/game/native-scene-view.ts');
    scene.paused = true;
    scene.model.state.settings.reducedMotion = true;
    scene.model.battle = null;
    scene.model.state.obstacles = [];
    const results = [];
    for (let level = 1; level <= 12; level++) {
      for (const state of ['active', 'constructing', 'upgrading', 'ruin']) {
        const inferno = makeBuilding(1, 'inferno', 18, 18, level);
        if (state === 'ruin') inferno.hp = 0;
        if (state === 'constructing') inferno.constructing = true;
        if (state === 'upgrading') {
          inferno.upgradeStart = scene.model.clock;
          inferno.upgradeEnd = scene.model.clock + 100000;
        }
        scene.model.state.buildings = [inferno];
        scene.sync();
        scene.drawOverlay(0);
        const bounds = scene.nativeBuildingBounds(inferno);
        const expected = nativeSceneBounds(infernoPoses(level, 'single', state, 0, INFERNO_ROOT));
        const intactBounds = nativeSceneBounds(
          infernoPoses(level, 'single', 'active', 0, INFERNO_ROOT),
        );
        const sprite = scene.sprites.get(1);
        const x = sprite.x + (bounds[0] + bounds[2]) / 2;
        const y = sprite.y + (bounds[1] + bounds[3]) / 2;
        const pick = scene.pickBuilding(x, y, { x: -1, y: -1 });
        const outside = scene.pickBuilding(x, sprite.y + bounds[1] - 1, { x: -1, y: -1 });
        results.push({
          level,
          state,
          bounds,
          expected,
          intactHeight: sprite.getData('intactHeight'),
          expectedHeight: intactBounds[3] - intactBounds[1],
          picked: pick?.id,
          outside: outside?.id,
        });
      }
    }
    return results;
  });
  expect(results).toHaveLength(48);
  for (const row of results) {
    expect(row.bounds).toEqual(row.expected);
    expect(row.intactHeight).toBeCloseTo(row.expectedHeight, 6);
    expect(row.picked, `${row.level}:${row.state}`).toBe(1);
    expect(row.outside, `${row.level}:${row.state}`).toBeUndefined();
  }
  expect(errors).toEqual([]);
});
