import { test, expect, type Page } from '@playwright/test';

// Live late-campaign battles stage full native villages; allow the whole flow to settle.
test.describe.configure({ timeout: 180_000 });

type Moment = {
  label: string;
  condition: string;
  focus: string;
  zoom: number;
  limit: number;
  required?: boolean;
};
type Village = {
  index: number;
  label: string;
  army: Record<string, number>;
  /** Deployment offset from the bunker center (or an absolute point without a bunker). */
  offset: [number, number];
  /** Deploy at the legal point nearest this entity instead of the bunker. */
  anchor?: string;
  moments: Moment[];
};
const LATE = (kind: string) => `battle.defenders?.find((d) => d.kind === '${kind}')`;
const VILLAGES: Village[] = [
  {
    index: 69,
    label: 'the-arena',
    army: { pekka: 8, dragon: 8, giant: 12, wizard: 12, archer: 12 },
    offset: [-9, 0],
    moments: [
      {
        label: 'release',
        condition: `(battle.defenders ?? []).filter((d) => d.kind !== 'skeleton' && battle.elapsed >= d.spawnedAt).length >= 6`,
        focus: 'castle',
        zoom: 1,
        limit: 12,
        required: true,
      },
      {
        label: 'summon',
        condition: `battle.defenders?.some((d) => d.kind === 'witch' && (d.summon?.events.length ?? 0) >= 2 && d.summon.events.some((e) => e.n >= 1 && battle.elapsed - e.at >= 0.3 && battle.elapsed - e.at < 0.4))`,
        focus: LATE('witch'),
        zoom: 2.2,
        limit: 20,
        required: true,
      },
      {
        label: 'bounce',
        condition: `battle.defenders?.some((d) => d.kind === 'bowler' && d.shots?.some((s) => (s.leg ?? 0) > 0 && battle.elapsed - s.launched > 0.25))`,
        focus: LATE('bowler'),
        zoom: 2.2,
        limit: 20,
        required: true,
      },
      {
        label: 'chain',
        condition: `battle.defenders?.some((d) => d.kind === 'electrodragon' && d.hp > 0 && d.attacks.some((a) => a.chain?.some((j) => battle.elapsed - j.at >= 0 && battle.elapsed - j.at < 0.06)))`,
        focus: LATE('electrodragon'),
        zoom: 1.9,
        limit: 30,
        required: true,
      },
      {
        label: 'split',
        condition: `battle.defenders?.some((d) => d.kind === 'golemite' && battle.elapsed - d.spawnedAt >= 0.25 && battle.elapsed - d.spawnedAt < 0.35)`,
        focus: LATE('golem'),
        zoom: 2.2,
        limit: 40,
      },
      {
        label: 'bolts',
        condition: `battle.defenders?.some((d) => d.kind === 'electrodragon' && d.bolts?.some((b) => battle.elapsed - b.at >= 0.02 && battle.elapsed - b.at < 0.1))`,
        focus: LATE('electrodragon'),
        zoom: 1.6,
        limit: 40,
      },
    ],
  },
  {
    index: 74,
    label: 'dragons-lair',
    army: { dragon: 10, wizard: 12, pekka: 8 },
    offset: [0, -6],
    moments: [
      {
        label: 'release',
        condition: `battle.defenders?.some((d) => d.kind === 'goldendragon' && battle.elapsed - d.spawnedAt > 0.6)`,
        focus: 'castle',
        zoom: 1.1,
        limit: 15,
        required: true,
      },
      {
        label: 'attack',
        condition: `battle.defenders?.some((d) => d.kind === 'goldendragon' && d.attacks.some((a) => battle.elapsed - a.at >= 0 && battle.elapsed - a.at < 0.1))`,
        focus: LATE('goldendragon'),
        zoom: 1.4,
        limit: 25,
        required: true,
      },
    ],
  },
  {
    index: 76,
    label: 'ring-of-power',
    army: { pekka: 10, dragon: 10, wizard: 12, archer: 12, healer: 4 },
    offset: [-9, 0],
    moments: [
      {
        label: 'release',
        condition: `battle.defenders?.some((d) => d.kind === 'lavahound' && battle.elapsed - d.spawnedAt > 1)`,
        focus: LATE('lavahound'),
        zoom: 1.6,
        limit: 15,
        required: true,
      },
      {
        label: 'attack',
        condition: `battle.defenders?.some((d) => d.kind === 'lavahound' && d.hp > 0 && d.shots?.length)`,
        focus: LATE('lavahound'),
        zoom: 2.2,
        limit: 25,
        required: true,
      },
      {
        label: 'pups',
        condition: `battle.defenders?.some((d) => d.kind === 'lavapup' && battle.elapsed - d.spawnedAt >= 0.12 && battle.elapsed - d.spawnedAt < 0.2)`,
        focus: LATE('lavahound'),
        zoom: 1.8,
        limit: 30,
        required: true,
      },
      {
        label: 'pups-attack',
        condition: `battle.defenders?.some((d) => d.kind === 'lavapup' && d.shots?.length)`,
        focus: `battle.defenders?.find((d) => d.kind === 'lavapup' && d.shots?.length)`,
        zoom: 2.2,
        limit: 10,
      },
    ],
  },
  {
    index: 83,
    label: 'path-to-pain',
    army: { pekka: 10, dragon: 8, wizard: 12, archer: 10 },
    offset: [-9, 0],
    moments: [
      {
        label: 'release',
        condition: `(battle.defenders ?? []).filter((d) => d.kind === 'electrotitan' && battle.elapsed > d.spawnedAt + 0.5).length >= 3`,
        focus: 'castle',
        zoom: 1.2,
        limit: 15,
        required: true,
      },
      {
        label: 'aura',
        condition: `battle.defenders?.some((d) => d.kind === 'electrotitan' && d.hp > 0 && d.attacks.some((a) => battle.elapsed - a.at >= 0 && battle.elapsed - a.at < 0.1))`,
        focus: `battle.defenders?.find((d) => d.kind === 'electrotitan' && d.hp > 0 && d.attacks.length)`,
        zoom: 2,
        limit: 20,
        required: true,
      },
    ],
  },
  {
    index: 89,
    label: 'mommas-madhouse',
    army: { pekka: 12, dragon: 10, wizard: 12 },
    offset: [-9, 0],
    moments: [
      {
        label: 'release',
        condition: `battle.defenders?.some((d) => d.kind === 'momma' && battle.elapsed - d.spawnedAt > 0.5)`,
        focus: LATE('momma'),
        zoom: 1.4,
        limit: 15,
        required: true,
      },
      {
        label: 'attack',
        condition: `battle.defenders?.some((d) => d.kind === 'momma' && d.attacks.some((a) => battle.elapsed - a.at >= 0.02 && battle.elapsed - a.at < 0.12))`,
        focus: LATE('momma'),
        zoom: 2.4,
        limit: 25,
        required: true,
      },
    ],
  },
  {
    index: 75,
    label: 'go-to-bat',
    army: { giant: 6, swordsman: 12, archer: 10, wizard: 6 },
    offset: [0, 0],
    anchor: `battle.buildings.find((b) => b.npc === 'ghost-trap')`,
    moments: [
      {
        label: 'trigger',
        condition: `Object.values(battle.late?.ghostTrap?.traps ?? {}).some((t) => battle.elapsed - t.activatedAt >= 0.3)`,
        focus: `battle.buildings.find((b) => b.npc === 'ghost-trap' && battle.traps[b.id])`,
        zoom: 3.2,
        limit: 20,
        required: true,
      },
      {
        label: 'concealed',
        condition: `battle.defenders?.some((d) => d.kind === 'royalghost' && battle.elapsed - d.spawnedAt >= 1)`,
        focus: LATE('royalghost'),
        zoom: 3.2,
        limit: 10,
        required: true,
      },
      {
        label: 'attack',
        condition: `battle.defenders?.some((d) => d.kind === 'royalghost' && d.attacks.some((a) => battle.elapsed - a.at >= 0 && battle.elapsed - a.at < 0.3))`,
        focus: `battle.defenders?.find((d) => d.kind === 'royalghost' && d.attacks.length)`,
        zoom: 3.2,
        limit: 20,
        required: true,
      },
    ],
  },
  {
    index: 85,
    label: 'defending-builders',
    army: { giant: 6, archer: 10, wizard: 4 },
    offset: [0, 0],
    anchor: `battle.buildings.find((b) => b.kind === 'builder' && !b.npc && b.x === 32 && b.y === 28)`,
    moments: [
      {
        label: 'builder-walk',
        condition: `battle.late?.defendingBuilder?.builders.some((v) => v.path.length > 0 && v.target !== null)`,
        focus: `(() => { const v = battle.late?.defendingBuilder?.builders.find((v) => v.path.length > 0); return v && { x: v.x, y: v.y }; })()`,
        zoom: 3.2,
        limit: 20,
        required: true,
      },
      {
        label: 'builder-repair',
        condition: `battle.late?.defendingBuilder?.builders.some((v) => v.repairing && v.repairs.some((r) => r.n >= 1 && battle.elapsed - r.at >= 0 && battle.elapsed - r.at < 0.3))`,
        focus: `(() => { const v = battle.late?.defendingBuilder?.builders.find((v) => v.repairing); return v && { x: v.x, y: v.y }; })()`,
        zoom: 3.2,
        limit: 20,
        required: true,
      },
    ],
  },
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
    const { TROOP_KEYS, maxTroopLevel, BUILDINGS } = await import('/src/game/data.ts');
    const buildings = nativeLayout(v.index);
    const loot = campaignResources(campaignStage(v.index, 'goblin-v1'));
    const garrisons = campaignGarrisonSetup(v.index, buildings);
    const setup = {
      catalog: 'goblin-v1' as const,
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
      ...(garrisons ? { garrisons } : {}),
    };
    // The replay runner's isolated inputs (as tests/fixtures liveNativeBattle): deploy at the
    // setup's troop levels rather than the page save's.
    model.recordBattles = false;
    model.state.army = { ...setup.army };
    model.state.spells = { ...setup.spells };
    model.state.troopLevels = { ...setup.troopLevels };
    model.state.nextId = setup.nextId;
    model.battle = replayBattle(setup, 44);
    const battle = model.battle!;
    scene.paused = true;
    scene.sync();
    const bunker = battle.buildings.find(
      (b) => b.npc === 'goblin-castle' || b.npc === 'foreboding-cave',
    );
    const anchor = v.anchor
      ? (new Function('battle', `return (${v.anchor});`)(battle) as { x: number; y: number })
      : undefined;
    const size = bunker ? BUILDINGS[bunker.kind].size : 1;
    const center = anchor
      ? { x: anchor.x + 0.5, y: anchor.y + 0.5 }
      : { x: bunker!.x + size / 2, y: bunker!.y + size / 2 };
    const goal = { x: center.x + v.offset[0], y: center.y + v.offset[1] };
    let best: [number, number, number] | undefined;
    for (let px = 1; px < 47; px += 0.5)
      for (let py = 1; py < 47; py += 0.5) {
        if (model.deployBlocked(px, py)) continue;
        const d = Math.hypot(px - goal.x, py - goal.y);
        if (!best || d < best[2] - 1e-9) best = [px, py, d];
      }
    for (const [kind, count] of Object.entries(v.army))
      for (let n = 0; n < count; n++) {
        model.activeTroop = kind as never;
        if (!model.deploy(best![0], best![1])) throw Error(`Deployment failed: ${kind}`);
      }
    (window as unknown as { __center: typeof center }).__center = center;
    return { deploy: best, garrisons };
  }, village);
}

/** Advance until any remaining moment's condition holds; returns its index (or -1 at the limit). */
async function advanceToAny(page: Page, moments: Moment[], limit: number) {
  return page.evaluate(
    ({ conditions, limit }) => {
      const { model } = window.__game;
      const tests = conditions.map(
        (c) => new Function('battle', `return !!(${c});`) as (b: unknown) => boolean,
      );
      const battle = model.battle!;
      const until = battle.elapsed + limit;
      for (;;) {
        const hit = tests.findIndex((t) => t(battle));
        if (hit >= 0 || battle.elapsed >= until || battle.finished) return hit;
        model.step(0.05);
      }
    },
    { conditions: moments.map((m) => m.condition), limit },
  );
}

async function capture(page: Page, village: Village, moment: Moment) {
  const report = await page.evaluate(
    async ({ moment }) => {
      const { model, scene, game } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      const test = new Function('battle', `return !!(${moment.condition});`) as (
        b: unknown,
      ) => boolean;
      const battle = model.battle!;
      const met = test(battle);
      const center = (window as unknown as { __center: { x: number; y: number } }).__center;
      const focus =
        moment.focus === 'castle'
          ? center
          : ((new Function('battle', `return (${moment.focus});`)(battle) as
              { x: number; y: number; kind?: string } | undefined) ?? center);
      const size = 'level' in focus ? 0.5 : 0;
      const point = iso(focus.x + size, focus.y + size);
      scene.cameras.main.setZoom(moment.zoom).centerOn(point.x, point.y - 40);
      scene.sync();
      scene.drawOverlay(performance.now());
      const garrison = scene.garrisonPresentation;
      return {
        met,
        elapsed: battle.elapsed,
        defenders: (battle.defenders ?? [])
          .filter((d) => d.kind !== 'skeleton')
          .map((d) => `${d.kind}:${Math.round(d.hp)}`),
        views: [...garrison.defenders.values()].reduce((n, v) => n + v.objects.length, 0),
        builders: scene.children.list.filter(
          (o: { getData?: (key: string) => unknown }) =>
            o.getData?.('defendingBuilder') !== undefined,
        ).length,
        glError: game.renderer.gl.getError(),
      };
    },
    { moment },
  );
  await page.locator('canvas').screenshot({
    path: `output/playtest/defending-troops/live-${village.index}-${village.label}-${moment.label}.png`,
  });
  return report;
}

for (const village of VILLAGES)
  test(`releases and renders the later garrison families live in village ${village.index} (${village.label})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, village);
    // Moments are captured in the order they happen in this deterministic fight.
    const remaining = [...village.moments];
    const met = new Set<string>();
    const limit = Math.max(...village.moments.map((m) => m.limit));
    while (remaining.length) {
      const index = await advanceToAny(page, remaining, limit);
      if (index < 0) break;
      const [moment] = remaining.splice(index, 1);
      const report = await capture(page, village, moment);
      console.log(
        `${village.index} ${moment.label}: met=${report.met} t=${report.elapsed.toFixed(2)} views=${report.views} builders=${report.builders} ${report.defenders.join(' ')}`,
      );
      met.add(moment.label);
      expect(report.glError).toBe(0);
      if (moment.label.startsWith('builder')) expect(report.builders).toBeGreaterThan(0);
    }
    for (const moment of village.moments)
      if (moment.required)
        expect(met.has(moment.label), `${village.label} ${moment.label}`).toBe(true);
    expect(errors).toEqual([]);
  });
