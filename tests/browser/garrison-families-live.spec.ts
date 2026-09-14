import { test, expect, type Page } from '@playwright/test';

// Live late-campaign battles stage full native villages; allow the whole flow to settle.
test.describe.configure({ timeout: 180_000 });

type Village = {
  index: number;
  label: string;
  /** Explicit supported subset for inspection when the source roster is still gated. */
  troops?: { kind: string; level: number; count: number }[];
  hero?: boolean;
  army: Record<string, number>;
};
const VILLAGES: Village[] = [
  { index: 67, label: 'goblin-capital', army: { giant: 4, archer: 12, wizard: 4 } },
  { index: 72, label: 'grand-avenue', army: { archer: 28, wizard: 16 } },
  {
    index: 76,
    label: 'ring-of-power-subset',
    // Lava Hound 6 remains unsupported: this fixture releases only the resolved members.
    troops: [
      { kind: 'headhunter', level: 3, count: 2 },
      { kind: 'archer', level: 9, count: 3 },
    ],
    hero: true,
    army: { archer: 14, wizard: 8, giant: 4 },
  },
  { index: 77, label: 'suspicious-gap', army: { giant: 6, archer: 16, wizard: 8 } },
];

async function open(page: Page, village: Village) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  return page.evaluate(async (v) => {
    const { model, scene } = window.__game;
    const { nativeLayout, nativeScenery } = await import('/src/game/native-campaign.ts');
    const { replayBattle } = await import('/src/game/replay.ts');
    const { campaignResources } = await import('/src/game/campaign-loot.ts');
    const { campaignStage } = await import('/src/game/campaign-catalog.ts');
    const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
    const { campaignGarrisonSetup } = await import('/src/game/garrison-campaign.ts');
    const { defaultEquipment } = await import('/src/game/equipment.ts');
    const { TROOP_KEYS, maxTroopLevel } = await import('/src/game/data.ts');
    const buildings = nativeLayout(v.index);
    const castle = buildings.find((b) => b.npc === 'goblin-castle')!;
    const loot = campaignResources(campaignStage(v.index, 'goblin-v1'));
    const garrisons = v.troops
      ? [{ castleId: castle.id, mode: 'guard' as const, troops: v.troops }]
      : campaignGarrisonSetup(v.index, buildings)!;
    model.battle = replayBattle(
      {
        catalog: 'goblin-v1',
        scenery: nativeScenery(v.index),
        index: v.index,
        practice: false,
        buildings,
        army: { ...emptyArmy(), ...v.army },
        spells: emptySpells(),
        troopLevels: Object.fromEntries(TROOP_KEYS.map((k) => [k, maxTroopLevel(k)])) as never,
        nextId: 100000,
        availableLoot: loot,
        lootRoom: loot,
        garrisons,
        ...(v.hero ? { hero: { level: 10, townhall: 8, equipment: defaultEquipment() } } : {}),
      },
      44,
    );
    scene.paused = true;
    scene.sync();
    const center = { x: castle.x + 1.5, y: castle.y + 1.5 };
    const sites = Array.from({ length: 48 * 48 }, (_, i) => ({
      x: (i % 48) + 0.5,
      y: Math.floor(i / 48) + 0.5,
    }))
      .filter((p) => !model.deployBlocked(p.x, p.y))
      // Fights in the open: legal grass 8-12 tiles out, inside the 13-tile trigger radius.
      .filter((p) => Math.hypot(p.x - center.x, p.y - center.y) >= 8)
      .sort(
        (a, b) =>
          Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y),
      );
    let site = 0;
    model.activeHero = false;
    for (const [kind, count] of Object.entries(v.army))
      for (let n = 0; n < count; n++) {
        model.activeTroop = kind as never;
        let placed = false;
        for (let attempt = 0; attempt < 40 && !placed; attempt++) {
          const p = sites[site++ % 24];
          placed = model.deploy(p.x, p.y);
        }
        if (!placed) throw Error(`Deployment failed: ${kind}`);
      }
    if (v.hero && !model.deployHero(sites[1].x, sites[1].y)) throw Error('King deployment failed');
    // Inspection fixture only: late villages' own defenses otherwise erase this low-level local
    // army within seconds. Durable attackers let the source-stat garrison fights play out.
    for (const unit of model.battle!.units)
      unit.hp = unit.maxHp = unit.hero ? unit.maxHp * 4 : 4000;
    (window as unknown as { __garrisonCenter: typeof center }).__garrisonCenter = center;
    return { castle: castle.id, garrisons };
  }, village);
}

/** Advance the live model until `condition` holds; frame a focus defender (or the Castle). */
async function advance(page: Page, condition: string, limit: number, focus: string) {
  return page.evaluate(
    async ({ condition, limit, focus }) => {
      const { model, scene, game } = window.__game;
      const test = new Function('battle', `return (${condition});`) as (b: never) => boolean;
      const pick = new Function('battle', `return (${focus});`) as (
        b: never,
      ) => { id: number } | undefined;
      const battle = model.battle!;
      const until = battle.elapsed + limit;
      while (!test(battle as never) && battle.elapsed < until && !battle.finished) model.step(0.05);
      scene.sync();
      scene.drawOverlay(performance.now());
      const target = pick(battle as never) as { id: number; x: number; y: number } | undefined;
      const defenders = (battle.defenders ?? []).filter((d) => d.kind !== 'skeleton');
      (window as unknown as { __garrisonFocus?: { x: number; y: number } }).__garrisonFocus = target
        ? { x: target.x, y: target.y }
        : undefined;
      return {
        met: test(battle as never),
        elapsed: battle.elapsed,
        focus: target ? { id: target.id, kind: (target as never as { kind: string }).kind } : null,
        glError: game.renderer.gl.getError(),
        defenders: defenders.map((d) => ({
          kind: d.kind,
          hp: d.hp,
          views: scene.garrisonPresentation.defenders.get(d.id)?.objects.length ?? 0,
          shadows: scene.garrisonPresentation.shadows.get(d.id)?.objects.length ?? 0,
        })),
        shotViews: scene.garrisonPresentation.shots.size,
      };
    },
    { condition, limit, focus },
  );
}
async function frame(page: Page, zoom: number, castle = false) {
  await page.evaluate(
    async ({ zoom, castle }) => {
      const { scene } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      const w = window as unknown as {
        __garrisonCenter: { x: number; y: number };
        __garrisonFocus?: { x: number; y: number };
      };
      const at = castle || !w.__garrisonFocus ? w.__garrisonCenter : w.__garrisonFocus;
      const point = iso(at.x, at.y);
      scene.cameras.main.setZoom(zoom).centerOn(point.x, point.y - 30);
      scene.sync();
      scene.drawOverlay(performance.now());
    },
    { zoom, castle },
  );
}

const RELEASED =
  'battle.defenders?.find((d) => d.kind !== "skeleton" && battle.elapsed >= d.spawnedAt)';
/** Distance from the bunker center recorded when the village was opened. */
const OUT = (d: string, tiles: number) =>
  `Math.hypot(${d}.x - window.__garrisonCenter.x, ${d}.y - window.__garrisonCenter.y) >= ${tiles}`;
for (const village of VILLAGES)
  test(`releases, moves, attacks and loses native garrison troops in ${village.label}`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const setup = await open(page, village);
    expect(setup.garrisons[0].troops.length).toBeGreaterThan(0);
    const shot = async (phase: string, zoom: number, castle = false) => {
      await frame(page, zoom, castle);
      await page.screenshot({
        path: `output/playtest/garrison/${browserName}/${village.index}-${village.label}-${phase}.png`,
      });
    };

    const released = await advance(
      page,
      'battle.defenders?.some((d) => d.kind !== "skeleton" && battle.elapsed >= d.spawnedAt + 0.1)',
      20,
      RELEASED,
    );
    expect(released.met).toBe(true);
    expect(released.defenders.some((d) => d.views > 0 && d.shadows > 0)).toBe(true);
    await shot('1-release', 2.2, true);

    await advance(
      page,
      `battle.defenders.some((d) => d.kind !== "skeleton" && d.hp > 0 && !d.attacking && d.target !== null && ${OUT('d', 2.5)})`,
      15,
      `battle.defenders.find((d) => d.kind !== "skeleton" && d.hp > 0 && !d.attacking && d.target !== null && ${OUT('d', 2.5)}) ?? ${RELEASED}`,
    );
    await shot('2-move', 2.6);

    const attacking = await advance(
      page,
      `battle.defenders.some((d) => d.kind !== "skeleton" && d.hp > 0 && d.attacks.length > 0 && ((d.shots?.length ?? 0) > 0 || battle.elapsed - d.attacks.at(-1).at < 0.15) && ${OUT('d', 2)})`,
      30,
      `battle.defenders.find((d) => d.kind !== "skeleton" && d.hp > 0 && ((d.shots?.length ?? 0) > 0 || (d.attacks.length && battle.elapsed - d.attacks.at(-1).at < 0.15)) && ${OUT('d', 2)})`,
    );
    expect(attacking.met).toBe(true);
    await shot('3-attack', 2.6);
    await shot('3-attack-wide', 1.3);

    const dying = await advance(
      page,
      `battle.defenders.some((d) => d.kind !== "skeleton" && d.hp <= 0 && battle.elapsed - d.defeatedAt > 0.2 && battle.elapsed - d.defeatedAt < 0.9 && ${OUT('d', 2)})`,
      150,
      'battle.defenders.filter((d) => d.kind !== "skeleton" && d.hp <= 0).sort((a, b) => b.defeatedAt - a.defeatedAt)[0]',
    );
    expect(dying.met).toBe(true);
    await shot('4-death', 2.6);

    await page.evaluate(() => {
      const { scene } = window.__game;
      scene.resetCamera();
      scene.sync();
      scene.drawOverlay(performance.now());
    });
    await page.screenshot({
      path: `output/playtest/garrison/${browserName}/${village.index}-${village.label}-5-village.png`,
    });
    expect(attacking.glError).toBe(0);
    expect(errors).toEqual([]);
  });
