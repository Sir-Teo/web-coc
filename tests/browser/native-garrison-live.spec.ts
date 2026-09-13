import { test, expect } from '@playwright/test';

test('renders released original garrison troops and clamps Balloon death to its empty terminal frame', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { initializeGarrison, stepGarrisonReleases } =
      await import('/src/game/garrison-release.ts');
    const { hurtDefender } = await import('/src/game/defenders.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.model.state.buildings = [makeBuilding(6, 'clancastle', 18, 18, 5)];
    scene.model.startBattle(0, true);
    if (!scene.model.deploy(12, 18)) throw Error('Unable to begin garrison test battle');
    const battle = scene.model.battle;
    battle.units = [
      {
        id: 1,
        kind: 'giant',
        x: 12,
        y: 18,
        hp: 10000,
        maxHp: 10000,
        cooldown: 0,
        target: null,
        path: [],
        pathAt: 0,
        attacking: false,
      },
    ];
    battle.garrisons = [
      initializeGarrison({
        castleId: 6,
        mode: 'guard',
        troops: [
          { kind: 'dragon', level: 7, count: 1 },
          { kind: 'balloon', level: 8, count: 3 },
        ],
      }),
    ];
    battle.elapsed = 2;
    stepGarrisonReleases(battle);
    scene.paused = true;
    scene.sync();
    scene.drawOverlay(2000);
    const count = scene.garrisonPresentation.defenders.size;
    const visible = [...scene.garrisonPresentation.defenders.values()].map((v) => v.objects.length);
    const balloon = battle.defenders.find((d) => d.kind === 'balloon');
    balloon.engaged = true;
    balloon.cooldown = 0.75;
    scene.drawOverlay(2000);
    const windupObjects = scene.garrisonPresentation.defenders.get(balloon.id).objects.length;
    balloon.attacks.push({
      at: 2,
      x: balloon.x,
      y: balloon.y,
      targetId: 1,
      targetX: 12,
      targetY: 18,
    });
    balloon.cooldown = 3;
    scene.drawOverlay(2000);
    const actionObjects = scene.garrisonPresentation.defenders.get(balloon.id).objects.length;
    hurtDefender(battle, balloon, 1000);
    scene.drawOverlay(2000);
    const deathStart = scene.garrisonPresentation.defenders.get(balloon.id).objects.length;
    battle.elapsed = 3;
    scene.drawOverlay(3000);
    const deathEnd = scene.garrisonPresentation.defenders.get(balloon.id).objects.length;
    const dragon = battle.defenders.find((d) => d.kind === 'dragon');
    const aliveView = scene.garrisonPresentation.defenders.get(dragon.id);
    hurtDefender(battle, dragon, 4000);
    battle.elapsed = 4;
    scene.drawOverlay(4000);
    const ghostView = scene.garrisonPresentation.defenders.get(dragon.id);
    const ghostObjects = ghostView.objects.length;
    const switchedToDeath = ghostView !== aliveView;
    battle.elapsed = 10;
    scene.drawOverlay(10000);
    const dragonTerminal = scene.garrisonPresentation.defenders.get(dragon.id).objects.length;
    dragon.hp = dragon.maxHp;
    delete dragon.defeatedAt;
    battle.elapsed = 2;
    scene.drawOverlay(2000);
    const restored = scene.garrisonPresentation.defenders.get(dragon.id);
    const returnedToBody = restored !== ghostView && restored.objects.length > 0;
    const point = iso(19.5, 19.5);
    scene.cameras.main.setZoom(1.3).centerOn(point.x, point.y - 60);
    return {
      count,
      windupObjects,
      actionObjects,
      ghostObjects,
      switchedToDeath,
      dragonTerminal,
      returnedToBody,
      visible,
      deathStart,
      deathEnd,
      skeletonSprites: scene.defenderSprites.size,
      glError: game.renderer.gl.getError(),
    };
  });
  expect(report.count).toBe(4);
  expect(report.windupObjects).toBeGreaterThan(0);
  expect(report.actionObjects).toBeGreaterThan(0);
  expect(report.ghostObjects).toBeGreaterThan(0);
  expect(report.switchedToDeath).toBe(true);
  expect(report.dragonTerminal).toBe(0);
  expect(report.returnedToBody).toBe(true);
  expect(report.visible.every((n) => n > 0)).toBe(true);
  expect(report.deathStart).toBeGreaterThan(0);
  expect(report.deathEnd).toBe(0);
  expect(report.skeletonSprites).toBe(0);
  expect(report.glError).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `output/playtest/native-garrison-live-${browserName}.png` });
});
