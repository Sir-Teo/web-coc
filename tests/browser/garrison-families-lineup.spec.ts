import { test, expect } from '@playwright/test';

const FAMILIES = [
  ['goblin', 7],
  ['archer', 9],
  ['headhunter', 3],
  ['valkyrie', 7],
  ['pekka', 8],
  ['superminion', 9],
  ['babydragon', 6],
  ['dragon', 5],
] as const;

/** State-driven lineup on clear ground: art registration, facing, shadows and effects. */
test('renders every new garrison family in idle, walk, attack and death states on clear ground', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate(async (families) => {
    const { model, scene } = window.__game;
    const { nativeLayout } = await import('/src/game/native-campaign.ts');
    const { replayBattle } = await import('/src/game/replay.ts');
    const { campaignResources } = await import('/src/game/campaign-loot.ts');
    const { campaignStage } = await import('/src/game/campaign-catalog.ts');
    const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
    const { spawnGarrisonDefender } = await import('/src/game/garrison-combat.ts');
    const castle = { ...nativeLayout(67).find((b) => b.npc === 'goblin-castle')!, x: 30, y: 8 };
    const loot = campaignResources(campaignStage(67, 'goblin-v1'));
    model.battle = replayBattle(
      {
        catalog: 'goblin-v1',
        index: 67,
        practice: false,
        buildings: [castle],
        army: emptyArmy(),
        spells: emptySpells(),
        troopLevels: Object.fromEntries(Object.keys(emptyArmy()).map((k) => [k, 1])) as never,
        nextId: 100000,
        availableLoot: loot,
        lootRoom: loot,
      },
      44,
    );
    const battle = model.battle!;
    battle.started = true;
    battle.elapsed = 10;
    scene.paused = true;
    families.forEach(([kind, level], i) => {
      const x = 14 + i * 1.4,
        y = 30 - i * 1.4;
      spawnGarrisonDefender(battle, kind as never, level, castle.id, x, y, 0);
      battle.units.push({
        id: 1 + i,
        kind: 'giant',
        x: x - 2.2,
        y: y + 2.2,
        hp: 100,
        maxHp: 100,
        cooldown: 0,
        target: null,
        path: [],
        pathAt: 0,
        attacking: false,
        spawnedAt: 999,
      });
    });
    scene.sync();
  }, FAMILIES);

  const capture = async (phase: string) => {
    const report = await page.evaluate(async (phase) => {
      const { model, scene, game } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      const { garrisonStats } = await import('/src/game/garrison-kinds.ts');
      const battle = model.battle!;
      for (const [i, d] of battle.defenders!.entries()) {
        if (d.kind === 'skeleton') continue;
        const stats = garrisonStats(d.kind, d.level);
        const target = battle.units[i];
        Object.assign(d, { hp: d.maxHp, target: null, attacking: false, path: [], attacks: [], shots: undefined });
        delete d.engaged;
        delete d.defeatedAt;
        d.attackCount = 0;
        target.spawnedAt = 0;
        if (phase === 'walk') {
          d.target = target.id;
          if (!stats.flying) d.path = [{ x: d.x - 0.6, y: d.y + 0.6 }];
        }
        if (phase === 'attack') {
          d.target = target.id;
          d.attacking = true;
          d.engaged = true;
          // The damage event: every non-looping attack row is at its source action frame.
          d.cooldown = 0;
          d.attacks = [{ at: battle.elapsed, x: d.x, y: d.y, targetId: target.id, targetX: target.x, targetY: target.y, n: 0 }];
          d.attackCount = 1;
          d.cooldown = stats.rate;
          if (stats.projectile)
            d.shots = [
              {
                n: 0,
                projectile: stats.projectile,
                speed: stats.projectileSpeed,
                targetId: target.id,
                fromX: d.x,
                fromY: d.y,
                x: target.x,
                y: target.y,
                flight: { x: d.x - 0.6, y: d.y + 0.6, at: battle.elapsed },
                launched: battle.elapsed - 0.1,
                impact: battle.elapsed + 0.1,
                air: false,
                damage: stats.damage,
                splash: stats.splash,
              },
            ];
        }
        if (phase === 'death') {
          d.hp = 0;
          d.defeatedAt = battle.elapsed - 0.45;
        }
      }
      scene.sync();
      scene.drawOverlay(performance.now());
      const mid = iso(14 + 3.5 * 1.4, 30 - 3.5 * 1.4);
      scene.cameras.main.setZoom(1.7).centerOn(mid.x, mid.y + 10);
      scene.sync();
      scene.drawOverlay(performance.now());
      return {
        views: battle.defenders!.map((d) => scene.garrisonPresentation.defenders.get(d.id)?.objects.length ?? 0),
        shadows: battle.defenders!.map((d) => scene.garrisonPresentation.shadows.get(d.id)?.objects.length ?? 0),
        shots: scene.garrisonPresentation.shots.size,
        glError: game.renderer.gl.getError(),
      };
    }, phase);
    await page.locator('canvas').screenshot({ path: `output/playtest/garrison/lineup-${phase}.png` });
    return report;
  };
  for (const phase of ['idle', 'walk', 'attack'] as const) {
    const report = await capture(phase);
    expect(report.views.every((n) => n > 0), phase).toBe(true);
    expect(report.shadows.every((n) => n > 0), phase).toBe(true);
    expect(report.glError).toBe(0);
    if (phase === 'attack') expect(report.shots).toBeGreaterThanOrEqual(4);
  }
  const death = await capture('death');
  expect(death.views.some((n) => n > 0)).toBe(true);
  expect(errors).toEqual([]);
});
