import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createServer, type ViteDevServer } from 'vite';
import { test, expect, type Page } from '@playwright/test';

// Live late-campaign battles stage full native villages; allow the whole flow to settle.
test.describe.configure({ timeout: 180_000 });

/**
 * Tornado Trap and Goblin Freeze Trap evidence in the real scene: original bodies, reveal and
 * deploy effects, frozen troops and spent states after real ground and air deployments in Keep
 * Your Cool (64), Fireworks Inc. (66) and Cold Flame (81), plus Node/browser state agreement and
 * replay seeks. Runs with the standard config against its development server.
 */
const OUT = 'output/playtest/tornado-freeze';
let modules: ViteDevServer;
test.beforeAll(async () => {
  await fs.mkdir(OUT, { recursive: true });
  modules = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
});
test.afterAll(async () => modules?.close());

type Trap = 'tornadotrap' | 'freeze-trap';
const TORNADO_ARMY = { pekka: 4, giant: 6, swordsman: 12, balloon: 6 };
const FREEZE_ARMY = { giant: 6, swordsman: 12, dragon: 3 };
const COLD_FLAME_ARMY = { pekka: 12, healer: 4, dragon: 6 };

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  // Late campaign art loads on first use; these checks render it directly.
  await page.evaluate(() => window.__game.scene.loadLateAssets());
  await page.locator('#loading').waitFor({ state: 'detached' });
  return errors;
}

/** Opens a village with explicit troop levels and deploys every troop nearest one trap. */
function village(
  page: Page,
  index: number,
  trap: Trap,
  army: Record<string, number>,
  trapIndex = 1,
) {
  return page.evaluate(
    async ({ index, trap, army, trapIndex }) => {
      const { model, scene } = window.__game;
      const native = await import('/src/game/native-campaign.ts');
      const { replayBattle } = await import('/src/game/replay.ts');
      const { emptyArmy } = await import('/src/game/army.ts');
      const { BUILDINGS } = await import('/src/game/data.ts');
      const fixture = await import('/tests/fixtures/late-trap-battle.ts');
      const playable = !native.nativeCampaignIssues(index).length;
      if (playable) {
        // The real campaign start flow for villages without remaining mechanic gates.
        model.state.nativeCampaign = native.freshNativeCampaign();
        model.state.nativeCampaign.stars.fill(1);
        model.state.army = { ...emptyArmy(), ...army };
        model.state.troopLevels = fixture.maxTroopLevels();
        model.startCampaign(index);
      } else model.battle = replayBattle(fixture.nativeSetup(index, army), 44);
      scene.paused = true;
      const b = model.battle;
      const target = b.buildings.filter((v) => v.kind === trap || v.npc === trap)[trapIndex];
      const size = BUILDINGS[target.kind].size;
      const [x, y] = fixture.nearestDeploy(model, target.x + size / 2, target.y + size / 2);
      let deployed = 0;
      for (const kind of Object.keys(army)) {
        model.activeTroop = kind;
        while (b.remaining[kind] && model.deploy(x, y)) deployed++;
      }
      scene.sync();
      return { playable, trapId: target.id, level: target.level, deployed, point: [x, y] };
    },
    { index, trap, army, trapIndex },
  );
}

function focus(page: Page, trapId: number, zoom: number) {
  return page.evaluate(
    async ({ trapId, zoom }) => {
      const { model, scene } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      const { BUILDINGS } = await import('/src/game/data.ts');
      const t = model.battle.buildings.find((v) => v.id === trapId);
      const size = BUILDINGS[t.kind].size;
      const p = iso(t.x + size / 2, t.y + size / 2);
      scene.cameras.main.setZoom(zoom).centerOn(p.x, p.y);
      scene.drawOverlay(model.battle.elapsed * 1000);
    },
    { trapId, zoom },
  );
}

/** Advances the paused simulation and returns trap, unit and presentation state. */
function advance(page: Page, seconds: number, until?: number) {
  return page.evaluate(
    ({ seconds, until }) => {
      const { model, scene, game } = window.__game;
      const b = model.battle;
      const end = b.elapsed + seconds;
      const carriedKinds = new Set<string>();
      while (!b.finished && (until !== undefined ? !b.traps[until] : b.elapsed < end - 1e-9)) {
        model.step(0.05);
        for (const u of b.units) if (u.hp > 0 && u.late?.tornadoTrap) carriedKinds.add(u.kind);
      }
      scene.sync();
      scene.drawOverlay(b.elapsed * 1000);
      const families = (scene as unknown as { lateCampaign: { families: unknown[] } }).lateCampaign
        .families as {
        bodies: Map<number, { objects: { getData(key: string): unknown }[] }>;
        effects: Map<string, unknown>;
      }[];
      const [tornado, freeze] = [families[1], families[2]];
      const frozen = b.units.filter(
        (u) =>
          u.hp > 0 &&
          u.late?.freezeTrap &&
          u.late.freezeTrap.since <= b.elapsed &&
          b.elapsed < u.late.freezeTrap.until,
      );
      return {
        elapsed: +b.elapsed.toFixed(2),
        finished: b.finished,
        vortices: Object.values(b.late?.tornadoTrap?.vortices ?? {}).map((v) => ({
          id: v.trapId,
          hits: v.hits,
          caught: v.caught.length,
          castAt: v.castAt,
          endAt: v.endAt,
        })),
        casts: Object.values(b.late?.freezeTrap?.casts ?? {}).map((c) => ({
          id: c.trapId,
          hit: c.hit,
          frozen: c.frozen.length,
          castAt: c.castAt,
        })),
        carried: b.units.filter((u) => u.hp > 0 && u.late?.tornadoTrap).map((u) => u.kind),
        carriedKinds: [...carriedKinds].sort(),
        frozen: frozen.map((u) => u.kind),
        frozenTints: frozen.map((u) => scene.unitSprites.get(u.id)?.tintTopLeft),
        // Phaser.TintModes: MULTIPLY 0, SCREEN 4.
        frozenModes: frozen.map((u) => scene.unitSprites.get(u.id)?.tintMode),
        thawedTints: b.units
          .filter((u) => u.hp > 0 && u.late?.freezeTrap && b.elapsed >= u.late.freezeTrap.until)
          .map((u) => scene.unitSprites.get(u.id)?.tintTopLeft),
        thawedModes: b.units
          .filter((u) => u.hp > 0 && u.late?.freezeTrap && b.elapsed >= u.late.freezeTrap.until)
          .map((u) => scene.unitSprites.get(u.id)?.tintMode),
        tornadoBodies: [...tornado.bodies.values()].map((v) =>
          v.objects[0]?.getData('nativeTornadoTrap'),
        ),
        tornadoEffects: [...tornado.effects.keys()]
          .map((k) => k.split(':').slice(1, 2).join())
          .sort(),
        tornadoEmitters: [
          ...new Set(
            [...tornado.effects.values()].flatMap((v) =>
              (v as { objects: { getData(key: string): { emitter: string } }[] }).objects.map(
                (o) => o.getData('nativeTornadoEffect')?.emitter,
              ),
            ),
          ),
        ].sort(),
        freezeBodies: [...freeze.bodies.values()].map((v) =>
          v.objects[0]?.getData('nativeFreezeTrap'),
        ),
        freezeEmitters: [
          ...new Set(
            [...freeze.effects.values()].flatMap((v) =>
              (v as { objects: { getData(key: string): { emitter: string } }[] }).objects.map(
                (o) => o.getData('nativeFreezeEffect')?.emitter,
              ),
            ),
          ),
        ].sort(),
        gl: game.renderer.gl.getError(),
      };
    },
    { seconds, until },
  );
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

test('Fireworks Inc. Tornado Trap carries real ground and air troops and leaves its spent box', async ({
  page,
}) => {
  const errors = await open(page);
  const setup = await village(page, 66, 'tornadotrap', TORNADO_ARMY);
  expect(setup).toMatchObject({ playable: true, level: 1, deployed: 28 });
  await focus(page, setup.trapId, 1.9);
  const trigger = await advance(page, 0, setup.trapId);
  expect(trigger.vortices.map((v) => v.id)).toContain(setup.trapId);
  await advance(page, 0.2);
  await shot(page, 'fireworks-trigger');
  const deploy = await advance(page, 0.55);
  expect(deploy.tornadoEmitters).toEqual(
    expect.arrayContaining([
      'e_trap_TornadoTrap_Model',
      'e_trap_TornadoTrap_Wind',
      'e_trap_TornadoTrap_Shadow',
    ]),
  );
  expect(deploy.tornadoBodies).toContainEqual({ id: setup.trapId, export: 'tornado_trap_lvl1' });
  await shot(page, 'fireworks-deploy');
  const vortex = await advance(page, 1.4);
  expect(vortex.carried.length).toBeGreaterThan(0);
  // Ground and air troops were both carried during the first hits (14 Air Defenses fire here).
  expect(vortex.carriedKinds).toEqual(expect.arrayContaining(['balloon', 'giant', 'swordsman']));
  await shot(page, 'fireworks-vortex');
  await focus(page, setup.trapId, 0.75);
  await shot(page, 'fireworks-village-vortex');
  await focus(page, setup.trapId, 1.9);
  const release = vortex.vortices.find((v) => v.id === setup.trapId)!.endAt;
  // The source WindOverlay (300 ms delay, 5.375 s life) fades about 0.3 s after a level-1 release.
  const spent = await advance(page, release - vortex.elapsed + 0.4);
  expect(spent.finished).toBe(false);
  expect(spent.carried).toEqual([]);
  expect(spent.tornadoBodies).toContainEqual({
    id: setup.trapId,
    export: 'tornado_trap_unarmed_lvl1',
  });
  expect(spent.tornadoEmitters).toEqual([]);
  await shot(page, 'fireworks-spent');
  expect([spent.gl, errors]).toEqual([0, []]);
});

test('Keep Your Cool Goblin Freeze Traps freeze real ground and air troops, then thaw', async ({
  page,
}) => {
  const errors = await open(page);
  // An outer western trap keeps the frozen troops readable beside fewer defenses.
  const setup = await village(page, 64, 'freeze-trap', FREEZE_ARMY, 6);
  expect(setup).toMatchObject({ playable: true, level: 1, deployed: 21 });
  await focus(page, setup.trapId, 1.9);
  await advance(page, 0, setup.trapId);
  const bottle = await advance(page, 0.3);
  expect(bottle.freezeBodies).toContainEqual({ id: setup.trapId, activated: true });
  await shot(page, 'keep-your-cool-bottle');
  const cast = bottle.casts.find((c) => c.id === setup.trapId)!;
  const burst = await advance(page, cast.castAt - bottle.elapsed + 0.15);
  expect(burst.casts.find((c) => c.id === setup.trapId)).toMatchObject({ hit: true });
  expect(burst.freezeEmitters).toEqual(
    expect.arrayContaining(['Freeze_glow_blue_lvl1', 'Freeze_crystal_lvl1', 'Freeze3_lvl1']),
  );
  expect(burst.frozen).toContain('dragon');
  expect(burst.frozen.some((kind) => kind !== 'dragon')).toBe(true);
  expect(burst.frozenTints.every((tint) => tint === 0x5fa8e8)).toBe(true);
  expect(burst.frozenModes.every((mode) => mode === 4)).toBe(true);
  await shot(page, 'keep-your-cool-burst');
  const frozen = await advance(page, 2);
  expect(frozen.frozen.length).toBeGreaterThan(0);
  await shot(page, 'keep-your-cool-frozen');
  await focus(page, setup.trapId, 0.75);
  await shot(page, 'keep-your-cool-village-frozen');
  await focus(page, setup.trapId, 1.9);
  const thawed = await advance(page, 3.5);
  expect(thawed.thawedTints.length).toBeGreaterThan(0);
  expect(thawed.thawedTints).not.toContain(0x5fa8e8);
  expect(thawed.thawedModes.every((mode) => mode === 0)).toBe(true);
  await shot(page, 'keep-your-cool-thawed');
  expect([thawed.gl, errors]).toEqual([0, []]);
});

test('Cold Flame freezes, carries level-3 troops and reconstructs the effects after replay seeks', async ({
  page,
}) => {
  const errors = await open(page);
  const setup = await village(page, 81, 'freeze-trap', COLD_FLAME_ARMY, 0);
  expect(setup).toMatchObject({ playable: true, deployed: 22 });
  await focus(page, setup.trapId, 1.4);
  await advance(page, 0, setup.trapId);
  const burst = await advance(page, 0.75);
  expect(burst.frozen.length).toBeGreaterThan(0);
  await shot(page, 'cold-flame-freeze');
  // The level-3 vortex at (31,31) later catches the same attack.
  const tornadoId = await page.evaluate(
    () =>
      window.__game.model.battle.buildings.find(
        (v) => v.kind === 'tornadotrap' && v.x === 31 && v.y === 31,
      ).id,
  );
  await focus(page, tornadoId, 1.5);
  const triggered = await advance(page, 0, tornadoId);
  expect(triggered.vortices.map((v) => v.id)).toContain(tornadoId);
  const vortex = await advance(page, 2);
  expect(vortex.tornadoBodies).toContainEqual({ id: tornadoId, export: 'tornado_trap_lvl2' });
  expect(vortex.carried.length).toBeGreaterThan(0);
  await shot(page, 'cold-flame-vortex');
  const late = await advance(page, 4.6);
  expect(late.vortices.find((v) => v.id === tornadoId)!.hits).toBeGreaterThan(39);
  expect(late.tornadoEmitters).not.toContain('e_trap_TornadoTrap_Model');
  expect(late.tornadoBodies).toContainEqual({ id: tornadoId, export: 'tornado_trap_lvl2' });
  await shot(page, 'cold-flame-late-whirl');
  const spent = await advance(page, 2);
  expect(spent.tornadoBodies).toContainEqual({
    id: tornadoId,
    export: 'tornado_trap_unarmed_lvl2',
  });
  await shot(page, 'cold-flame-spent');

  // Replay seeks rebuild the same presentation state backward and forward.
  const seeks = await page.evaluate(async () => {
    const { model, scene } = window.__game;
    const fixture = await import('/tests/fixtures/late-trap-battle.ts');
    model.returnHome();
    const { data } = fixture.coldFlameReplay(900);
    if (!model.openReplay(data)) throw Error('Cold Flame replay did not open');
    scene.paused = true;
    const seek = (time: number) => {
      model.seekReplay(time);
      while (model.replay.seeking) model.step(0.05);
      scene.sync();
      scene.drawOverlay(model.battle.elapsed * 1000);
      const families = (
        scene as unknown as {
          lateCampaign: {
            families: {
              effects: Map<string, unknown>;
              bodies: Map<number, { objects: { getData(key: string): unknown }[] }>;
            }[];
          };
        }
      ).lateCampaign.families;
      return JSON.stringify({
        battle: model.battle.late,
        tornado: [...families[1].effects.keys()].sort(),
        tornadoBodies: [...families[1].bodies.values()].map((v) =>
          v.objects[0]?.getData('nativeTornadoTrap'),
        ),
        freeze: [...families[2].effects.keys()].sort(),
      });
    };
    const casts = () => Object.values(model.battle.late?.freezeTrap?.casts ?? {});
    seek(40);
    const tornado = Object.values(model.battle.late?.tornadoTrap?.vortices ?? {})[0];
    const freeze = casts()[0];
    if (!tornado || !freeze) throw Error('Replay did not trigger both traps');
    const times = [freeze.castAt + 0.2, tornado.castAt + 1.5];
    const forward = times.map(seek);
    seek(0);
    const backward = [...times].reverse().map(seek).reverse();
    return { forward, backward, times };
  });
  expect(seeks.backward).toEqual(seeks.forward);
  for (const state of seeks.forward)
    expect(JSON.parse(state).tornado.length + JSON.parse(state).freeze.length).toBeGreaterThan(0);
  await focus(page, tornadoId, 1.5);
  await shot(page, 'cold-flame-replay-seek');
  const gl = await page.evaluate(() => window.__game.game.renderer.gl.getError());
  expect([gl, errors]).toEqual([0, []]);
});

for (const scenario of [
  { index: 66, trap: 'tornadotrap' as const, army: TORNADO_ARMY },
  { index: 64, trap: 'freeze-trap' as const, army: FREEZE_ARMY },
  { index: 81, trap: 'tornadotrap' as const, army: COLD_FLAME_ARMY, trapIndex: 0 },
])
  test(`complete combat state matches Node at every step in village ${scenario.index}`, async ({
    page,
    browserName,
  }) => {
    const steps = 700;
    const fixture = await modules.ssrLoadModule('/tests/fixtures/late-trap-battle.ts');
    const { m } = fixture.nativeTrapBattle(
      scenario.index,
      scenario.trap,
      scenario.army,
      scenario.trapIndex,
    );
    const expected: string[] = [];
    let held = 0;
    for (let step = 0; step <= steps; step++) {
      expected.push(createHash('sha256').update(JSON.stringify(m.battle)).digest('hex'));
      if (m.battle.finished) break;
      m.step(0.05);
      held = Math.max(
        held,
        m.battle.units.filter(
          (u: { late?: { tornadoTrap?: unknown; freezeTrap?: unknown } }) =>
            u.late?.tornadoTrap || u.late?.freezeTrap,
        ).length,
      );
    }
    expect(held).toBeGreaterThan(0);
    await page.goto('/');
    const actual = await page.evaluate(
      async ({ scenario, steps }) => {
        const fixture = await import('/tests/fixtures/late-trap-battle.ts');
        const { m } = fixture.nativeTrapBattle(
          scenario.index,
          scenario.trap,
          scenario.army,
          scenario.trapIndex,
        );
        const hashes: string[] = [],
          encoder = new TextEncoder();
        for (let step = 0; step <= steps; step++) {
          const digest = await crypto.subtle.digest(
            'SHA-256',
            encoder.encode(JSON.stringify(m.battle)),
          );
          hashes.push(
            [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
          );
          if (m.battle.finished) break;
          m.step(0.05);
        }
        return hashes;
      },
      { scenario, steps },
    );
    expect(actual).toHaveLength(expected.length);
    for (let step = 0; step < expected.length; step++)
      expect(actual[step], `State differs at step ${step} (${step * 0.05}s)`).toBe(expected[step]);
    await fs.writeFile(
      `${OUT}/determinism-${scenario.index}-${browserName}.json`,
      JSON.stringify(
        { stepSeconds: 0.05, samples: expected.length, node: expected, browser: actual },
        null,
        2,
      ),
    );
  });

/** Open ground with one live trap, a Town Hall beyond it and real deployments that walk past. */
function arena(page: Page, trap: Trap, level: number, reduced = false) {
  return page.evaluate(
    async ({ trap, level, reduced }) => {
      const { model, scene } = window.__game;
      const { makeBuilding, makeNpcBuilding } = await import('/src/game/model.ts');
      const { replayBattle } = await import('/src/game/replay.ts');
      const { campaignResources } = await import('/src/game/campaign-loot.ts');
      const { campaignStage } = await import('/src/game/campaign-catalog.ts');
      const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
      const fixture = await import('/tests/fixtures/late-trap-battle.ts');
      model.returnHome();
      model.state.settings.reducedMotion = reduced;
      const index = trap === 'tornadotrap' ? 66 : 64;
      const loot = campaignResources(campaignStage(index, 'goblin-v1'));
      const body =
        trap === 'tornadotrap'
          ? { ...makeBuilding(900, 'tornadotrap', 22, 22, level), hp: 1, maxHp: 1 }
          : makeNpcBuilding(900, 'freeze-trap', 22, 22);
      model.battle = replayBattle(
        {
          catalog: 'goblin-v1',
          index,
          practice: false,
          buildings: [
            body,
            makeBuilding(901, 'townhall', 40, 40),
            makeBuilding(902, 'cannon', 28, 18, 5),
          ],
          army: { ...emptyArmy(), swordsman: 3, giant: 3, balloon: 3 },
          spells: emptySpells(),
          troopLevels: fixture.maxTroopLevels(),
          nextId: 100000,
          availableLoot: loot,
          lootRoom: loot,
        },
        44,
      );
      scene.paused = true;
      const center = trap === 'tornadotrap' ? 22.5 : 23;
      for (const [row, kind] of ['swordsman', 'giant', 'balloon'].entries()) {
        model.activeTroop = kind;
        for (let n = 0; n < 3; n++) model.deploy(center - 4.2 + n * 0.4, center - 1 + row * 0.9);
      }
      scene.sync();
      return 900;
    },
    { trap, level, reduced },
  );
}

test('isolated original states at levels 1 and 3, reduced motion and armed bodies', async ({
  page,
}) => {
  const errors = await open(page);
  // Tornado Trap level 1: reveal, deploy, carried troops and the spent box.
  let id = await arena(page, 'tornadotrap', 1);
  await focus(page, id, 2.4);
  await advance(page, 0, id);
  const reveal = await advance(page, 0.2);
  expect(reveal.tornadoBodies).toContainEqual({ id, export: 'tornado_trap_lvl1' });
  expect(reveal.tornadoEmitters).toEqual(expect.arrayContaining(['Grass', 'gen_appear_fx']));
  await shot(page, 'isolated-tornado-1-reveal');
  const cast = reveal.vortices[0].castAt;
  await advance(page, cast + 0.35 - reveal.elapsed);
  await shot(page, 'isolated-tornado-1-deploy');
  const vortex = await advance(page, 2);
  expect(vortex.carried).toEqual(expect.arrayContaining(['swordsman', 'giant', 'balloon']));
  await shot(page, 'isolated-tornado-1-vortex');
  const spent = await advance(page, vortex.vortices[0].endAt - vortex.elapsed + 0.4);
  expect(spent.tornadoBodies).toContainEqual({ id, export: 'tornado_trap_unarmed_lvl1' });
  expect([spent.carried, spent.tornadoEmitters]).toEqual([[], []]);
  await shot(page, 'isolated-tornado-1-spent');

  // Level 3 outlasts its source Model/Wind lifetimes; the triggered whirl continues to release.
  id = await arena(page, 'tornadotrap', 3);
  await focus(page, id, 2.4);
  await advance(page, 0, id);
  const three = await advance(page, 1.9);
  expect(three.tornadoBodies).toContainEqual({ id, export: 'tornado_trap_lvl2' });
  await shot(page, 'isolated-tornado-3-vortex');
  const late = await advance(page, three.vortices[0].castAt + 6.2 - three.elapsed);
  expect(late.carried.length).toBeGreaterThan(0);
  expect(late.tornadoEmitters).toEqual([]);
  expect(late.tornadoBodies).toContainEqual({ id, export: 'tornado_trap_lvl2' });
  await shot(page, 'isolated-tornado-3-late-whirl');
  const threeSpent = await advance(page, late.vortices[0].endAt - late.elapsed + 0.2);
  expect(threeSpent.tornadoBodies).toContainEqual({ id, export: 'tornado_trap_unarmed_lvl2' });
  await shot(page, 'isolated-tornado-3-spent');

  // Reduced motion keeps the spent body and one static wind marker.
  id = await arena(page, 'tornadotrap', 1, true);
  await focus(page, id, 2.4);
  await advance(page, 0, id);
  const calm = await advance(page, 2.5);
  expect(calm.tornadoEmitters).toEqual(['e_trap_TornadoTrap_Wind']);
  expect(calm.tornadoBodies).toContainEqual({ id, export: 'tornado_trap_unarmed_lvl1' });
  await shot(page, 'isolated-tornado-1-reduced');

  // Goblin Freeze Trap: rising bottle, both deploy effects, tinted frozen troops, thaw.
  id = await arena(page, 'freeze-trap', 1);
  await focus(page, id, 2.4);
  await advance(page, 0, id);
  const bottle = await advance(page, 0.3);
  expect(bottle.freezeBodies).toContainEqual({ id, activated: true });
  await shot(page, 'isolated-freeze-bottle');
  const burst = await advance(page, bottle.casts[0].castAt + 0.15 - bottle.elapsed);
  expect(burst.freezeEmitters).toEqual(
    expect.arrayContaining(['Freeze_glow_blue_lvl1', 'Freeze_dots1_lvl1', 'Freeze_crystal_lvl1']),
  );
  expect(burst.frozen).toEqual(expect.arrayContaining(['swordsman', 'giant', 'balloon']));
  await shot(page, 'isolated-freeze-burst');
  const frozen = await advance(page, 2);
  expect(frozen.frozenTints.length).toBeGreaterThan(0);
  expect(frozen.frozenTints.every((tint) => tint === 0x5fa8e8)).toBe(true);
  expect(frozen.frozenModes.every((mode) => mode === 4)).toBe(true);
  await shot(page, 'isolated-freeze-frozen');
  const thawed = await advance(page, 3.2);
  expect(thawed.frozen).toEqual([]);
  expect(thawed.thawedTints).not.toContain(0x5fa8e8);
  expect(thawed.thawedModes.every((mode) => mode === 0)).toBe(true);
  await shot(page, 'isolated-freeze-thawed');

  // Armed bodies are concealed in battle; a synthetic reveal without trap state shows them.
  await page.evaluate(async () => {
    const { model, scene } = window.__game;
    const { makeBuilding, makeNpcBuilding } = await import('/src/game/model.ts');
    const { replayBattle } = await import('/src/game/replay.ts');
    const { campaignResources } = await import('/src/game/campaign-loot.ts');
    const { campaignStage } = await import('/src/game/campaign-catalog.ts');
    const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
    const fixture = await import('/tests/fixtures/late-trap-battle.ts');
    const { iso } = await import('/src/game/scene.ts');
    model.returnHome();
    model.state.settings.reducedMotion = false;
    const loot = campaignResources(campaignStage(81, 'goblin-v1'));
    const buildings = [
      { ...makeBuilding(900, 'tornadotrap', 21, 23, 1), hp: 1, maxHp: 1 },
      { ...makeBuilding(901, 'tornadotrap', 24, 23, 3), hp: 1, maxHp: 1 },
      makeNpcBuilding(902, 'freeze-trap', 26, 22),
      makeBuilding(903, 'townhall', 40, 40),
    ];
    model.battle = replayBattle(
      {
        catalog: 'goblin-v1',
        index: 81,
        practice: false,
        buildings,
        army: { ...emptyArmy(), swordsman: 1 },
        spells: emptySpells(),
        troopLevels: fixture.maxTroopLevels(),
        nextId: 100000,
        availableLoot: loot,
        lootRoom: loot,
      },
      44,
    );
    scene.paused = true;
    const b = model.battle;
    for (const t of buildings.slice(0, 3))
      b.traps[t.id] = { activatedAt: 0, resolved: true, targetId: 0, x: t.x, y: t.y };
    scene.sync();
    const p = iso(24.5, 23.5);
    scene.cameras.main.setZoom(3).centerOn(p.x, p.y);
    scene.drawOverlay(0);
  });
  const armed = await advance(page, 0);
  expect(armed.tornadoBodies).toEqual(
    expect.arrayContaining([
      { id: 900, export: 'tornado_trap_setup_lvl1' },
      { id: 901, export: 'tornado_trap_setup_lvl2' },
    ]),
  );
  expect(armed.freezeBodies).toContainEqual({ id: 902, activated: false });
  await shot(page, 'isolated-armed-bodies');
  expect([armed.gl, errors]).toEqual([0, []]);
});
