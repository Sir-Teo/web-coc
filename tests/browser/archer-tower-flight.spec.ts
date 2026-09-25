import { expect, test } from '@playwright/test';
test('tower arrow graphics follow physical turns and retire with their projectiles', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const result = await page.evaluate(async () => {
    const { archerTowerBattle } = await import('/tests/fixtures/archer-tower-battle.ts');
    const { stepProjectiles } = await import('/src/game/projectiles.ts');
    const { archerTowerProjectilePose } = await import('/src/game/archer-tower-projectile.ts');
    const { iso } = await import('/src/game/scene.ts');
    const m = archerTowerBattle(10),
      b = m.battle;
    for (let i = 0; i < 100 && !b.projectiles?.some((p) => p.weapon === 'arrow' && p.variant); i++)
      m.step(0.05);
    const p = b.projectiles.find((p) => p.weapon === 'arrow' && p.variant);
    if (!p?.flight) throw Error('Missing physical tower arrow');
    b.units.find((u) => u.id === p.targetId).y += 5;
    b.elapsed += 0.1;
    stepProjectiles(
      b,
      () => {},
      () => {},
    );
    const scene = window.__game.scene;
    scene.paused = true;
    scene.model = m;
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    scene.sync();
    scene.drawProjectiles();
    const graphic = scene.archerTowerProjectiles.views.get(p.id);
    if (!graphic?.objects.length) throw Error('Missing original arrow meshes');
    const physical = iso(p.flight.x, p.flight.y);
    const actualX = graphic.objects[0].getData('nativeTowerArrow').x;
    const expected = archerTowerProjectilePose(p, b.elapsed, iso);
    const duplicates = scene.combatEffects.flights.has(p.id);
    const saved = b.projectiles;
    b.projectiles = [];
    scene.drawProjectiles();
    const retired = scene.archerTowerProjectiles.views.size;
    b.projectiles = saved;
    m.state.settings.reducedMotion = true;
    scene.drawProjectiles();
    const reduced = scene.archerTowerProjectiles.views.size;
    m.state.settings.reducedMotion = false;
    scene.drawProjectiles();
    scene.cameras.main.centerOn(physical.x, physical.y - 30).setZoom(2);
    await new Promise<void>((resolve) => scene.game.events.once('postrender', resolve));
    return {
      actualX,
      expectedX: expected.x,
      duplicates,
      retired,
      reduced,
      restored: scene.archerTowerProjectiles.views.has(p.id),
      glError: scene.game.renderer.gl.getError(),
    };
  });
  expect(result.actualX).toBeCloseTo(result.expectedX, 6);
  expect(result.duplicates).toBe(false);
  expect(result.retired).toBe(0);
  expect(result.reduced).toBe(0);
  expect(result.restored).toBe(true);
  expect(result.glError).toBe(0);
  await page.screenshot({ path: `output/playtest/archer-tower-flight-${browserName}.png` });
});
