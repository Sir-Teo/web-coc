import { test, expect } from '@playwright/test';

const FAMILIES = [
  ['electrodragon', 3],
  ['golem', 8],
  ['golemite', 8],
  ['witch', 4],
  ['summonedskeleton', 1],
  ['bowler', 4],
  ['lavahound', 6],
  ['lavapup', 1],
  ['electrotitan', 2],
  ['goldendragon', 1],
  ['momma', 1],
  ['royalghost', 7],
] as const;

/** State-driven lineup on clear ground: art registration, facing, shadows, projectiles and deaths. */
test('renders every later garrison family idle, walking, attacking and dying on clear ground', async ({
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
    const castle = { ...nativeLayout(69).find((b) => b.npc === 'goblin-castle')!, x: 40, y: 4 };
    const loot = campaignResources(campaignStage(69, 'goblin-v1'));
    model.battle = replayBattle(
      {
        catalog: 'goblin-v1',
        index: 69,
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
    battle.elapsed = 20;
    scene.paused = true;
    families.forEach(([kind, level], i) => {
      const x = 10 + (i % 6) * 3.2 + Math.floor(i / 6) * 1.5,
        y = 26 - (i % 6) * 3.2 + Math.floor(i / 6) * 4.5;
      const d = spawnGarrisonDefender(battle, kind as never, level, castle.id, x, y, 0);
      delete d.stealthUntil;
      battle.units.push({
        id: 1 + i,
        kind: 'giant',
        x: x - 1.1,
        y: y + 1.1,
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
      const { animationStates } = await import('/src/game/character-poses.ts');
      const battle = model.battle!;
      for (const [i, d] of battle.defenders!.entries()) {
        if (d.kind === 'skeleton') continue;
        const stats = garrisonStats(d.kind, d.level);
        const target = battle.units[i];
        Object.assign(d, {
          hp: d.maxHp,
          target: null,
          attacking: false,
          path: [],
          attacks: [],
          shots: undefined,
        });
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
          const row = animationStates(stats.animation).attack[0];
          // Hold every non-looping attack row just after its source action frame.
          d.attacks = [
            {
              at: battle.elapsed - 0.02,
              x: d.x,
              y: d.y,
              targetId: target.id,
              targetX: target.x,
              targetY: target.y,
              n: 0,
              ...(stats.chain ? { chain: [] } : {}),
            },
          ];
          d.attackCount = 1;
          d.cooldown = stats.rate - 0.02;
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
                flight: { x: d.x - 0.5, y: d.y + 0.5, at: battle.elapsed },
                launched: battle.elapsed - 0.1,
                impact: battle.elapsed + 0.1,
                air: false,
                damage: stats.damage,
                splash: stats.splash,
              },
            ];
          void row;
        }
        if (phase === 'death') {
          d.hp = 0;
          d.defeatedAt = battle.elapsed - 0.45;
        }
      }
      scene.sync();
      scene.drawOverlay(performance.now());
      const mid = iso(19.5, 20.5);
      scene.cameras.main.setZoom(0.95).centerOn(mid.x, mid.y + 20);
      scene.sync();
      scene.drawOverlay(performance.now());
      return {
        views: battle.defenders!.map(
          (d) => scene.garrisonPresentation.defenders.get(d.id)?.objects.length ?? 0,
        ),
        shadows: battle.defenders!.map(
          (d) => scene.garrisonPresentation.shadows.get(d.id)?.objects.length ?? 0,
        ),
        shots: scene.garrisonPresentation.shots.size,
        glError: game.renderer.gl.getError(),
      };
    }, phase);
    await page
      .locator('canvas')
      .screenshot({ path: `output/playtest/defending-troops/lineup-${phase}.png` });
    if (phase === 'attack' || phase === 'walk') {
      // Close-ups: each family framed at zoom 2.4 with its target Giant.
      const kinds = await page.evaluate(() =>
        window.__game.model.battle!.defenders!.map((d) => d.kind),
      );
      for (const [i, kind] of kinds.entries()) {
        await page.evaluate(async (i) => {
          const { model, scene } = window.__game;
          const { iso } = await import('/src/game/scene.ts');
          const d = model.battle!.defenders![i];
          const point = iso(d.x - 0.5, d.y + 0.5);
          scene.cameras.main.setZoom(2.4).centerOn(point.x, point.y - 40);
          scene.sync();
          scene.drawOverlay(performance.now());
        }, i);
        await page.screenshot({
          path: `output/playtest/defending-troops/closeup-${phase}-${kind}.png`,
          clip: { x: 470, y: 230, width: 500, height: 420 },
        });
      }
    }
    return report;
  };
  for (const phase of ['idle', 'walk', 'attack'] as const) {
    const report = await capture(phase);
    expect(
      report.views.every((n) => n > 0),
      phase,
    ).toBe(true);
    expect(
      report.shadows.every((n) => n > 0),
      phase,
    ).toBe(true);
    expect(report.glError).toBe(0);
    if (phase === 'attack') expect(report.shots).toBeGreaterThanOrEqual(4);
  }
  const death = await capture('death');
  expect(death.views.some((n) => n > 0)).toBe(true);
  expect(errors).toEqual([]);
});
