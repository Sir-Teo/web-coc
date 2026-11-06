import { test, expect } from '@playwright/test';

for (const level of [5, 8])
  test(`renders original Balloon ${level} impacts, reconstructs them on seek and clears expired views`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.evaluate(() => window.__game.scene.loadLateAssets());
    await page.locator('#loading').waitFor({ state: 'detached' });
    const report = await page.evaluate(async (level) => {
      const { scene, game } = window.__game;
      const { spawnGarrisonDefender, stepGarrisonDefender } =
        await import('/src/game/garrison-combat.ts');
      const { hurtDefender } = await import('/src/game/defenders.ts');
      const { iso } = await import('/src/game/scene.ts');
      scene.model.startBattle(0, true);
      scene.paused = true;
      const battle = scene.model.battle;
      const balloon = spawnGarrisonDefender(battle, 'balloon', level, 1, 28, 28, 0);
      balloon.attacks.push({ at: 1, x: 28, y: 28, targetId: 1, targetX: 28, targetY: 28 });
      const point = iso(28, 28);
      scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 30);
      scene.sync();
      const sample = (time: number) => {
        battle.elapsed = time;
        scene.drawOverlay(time * 1000);
        return [...scene.garrisonPresentation.effects].map(([key, view]) => ({
          key,
          objects: view.objects.length,
        }));
      };
      const hit = sample(1.05);
      const expired = sample(5);
      const restored = sample(1.05);
      battle.elapsed = 2;
      hurtDefender(battle, balloon, 1000);
      battle.elapsed = 2.6;
      stepGarrisonDefender(battle, balloon, 0.6, () => {});
      const death = sample(2.6);
      const emitters = [...scene.garrisonPresentation.effects.values()].flatMap((view) =>
        view.objects.map((object) => object.getData('nativeGarrisonEffect')?.emitter),
      );
      return { hit, expired, restored, death, emitters, glError: game.renderer.gl.getError() };
    }, level);
    expect(report.hit.length).toBeGreaterThan(0);
    expect(report.hit.every((p) => p.objects > 0)).toBe(true);
    expect(report.expired).toEqual([]);
    expect(report.restored).toEqual(report.hit);
    expect(report.death.some((p) => p.key.includes('death-damage') && p.objects > 0)).toBe(true);
    expect(report.emitters).toContain(level === 5 ? 'Balloon_Die_bloon' : 'Balloon_Die_darkBloon');
    expect(report.emitters).not.toContain(
      level === 5 ? 'Balloon_Die_darkBloon' : 'Balloon_Die_bloon',
    );
    expect(report.glError).toBe(0);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `output/playtest/garrison-effects-live-${level}-${browserName}.png`,
    });
    const cleared = await page.evaluate(() => {
      const presentation = window.__game.scene.garrisonPresentation;
      presentation.clear();
      return presentation.effects.size;
    });
    expect(cleared).toBe(0);
  });
