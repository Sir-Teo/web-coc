import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// Live late-campaign battles stage full native villages; allow the whole flow to settle.
test.describe.configure({ timeout: 180_000 });

const OUT = 'output/playtest/late-goblin-buildings';
type Squad = [count: number, step: number, kind: string, near: string, nth?: number];

/** Loads the game and installs in-page helpers that read both families' live presentation. */
async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fs.mkdir(OUT, { recursive: true });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  // Late campaign art loads on first use; these checks render it directly.
  await page.evaluate(() => window.__game.scene.loadLateAssets());
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate(async () => {
    const { model, scene, game } = window.__game;
    const { lateGoblinReplay, deployNear } = await import('/tests/fixtures/late-goblin-battle.ts');
    const { replayBattle } = await import('/src/game/replay.ts');
    const { BUILDINGS } = await import('/src/game/data.ts');
    const { iso } = await import('/src/game/scene.ts');
    // Dynamic imports can load module copies outside the scene's graph; match by class name.
    const families = scene.lateCampaign.families;
    const goblin = families.find((f) => f.constructor.name === 'LateGoblinBuildingsPresentation');
    const huts = families.find((f) => f.constructor.name === 'BuilderHutPresentation');
    if (!goblin || !huts) throw Error('Late Goblin building presentations are not registered');
    const tagged = (views, key) => {
      const found = new Map();
      for (const view of views)
        for (const o of view.objects) {
          const value = o.getData(key);
          if (value) found.set(value.id ?? value.key, value);
        }
      return [...found.values()];
    };
    const transforms = (views) =>
      [...views].flatMap((view) =>
        view.objects.map((o) =>
          [o.x, o.y, o.depth, o.alpha, o.visible ? 1 : 0].map((v) => Math.round(v * 1000)),
        ),
      );
    const deploys = (index, squads) =>
      squads.flatMap(([count, step, kind, near, nth = 0]) => {
        const at = deployNear(index, near, nth);
        return Array.from({ length: count }, () => ({ step, kind, ...at }));
      });
    window.__lgb = {
      /** Opens a real-deployment version-44 recording in the replay viewer. */
      replay(index, squads, steps) {
        document.getElementById('ui').style.display = 'none';
        scene.paused = true;
        if (model.battle) model.returnHome();
        return model.openReplay(lateGoblinReplay(index, deploys(index, squads), { steps }));
      },
      /** Stages a live version-44 battle and deploys every squad at once. */
      stage(index, squads) {
        document.getElementById('ui').style.display = 'none';
        scene.paused = true;
        if (model.battle) model.returnHome();
        const data = lateGoblinReplay(index, deploys(index, squads), { steps: 1 });
        model.state.army = { ...data.initial.army };
        model.state.spells = { ...data.initial.spells };
        model.state.troopLevels = { ...data.initial.troopLevels };
        model.battle = replayBattle(data.initial, data.version);
        for (const a of data.actions)
          if (a.type === 'troop') {
            model.activeTroop = a.kind;
            model.activeSpell = null;
            if (!model.deploy(a.x, a.y)) throw Error(`Deployment failed at ${a.x},${a.y}`);
          }
        return model.battle.buildings.length;
      },
      seek(seconds) {
        model.seekReplay(seconds);
        while (model.replay.seeking) model.step(0.05);
        return model.battle.elapsed;
      },
      advance(steps) {
        for (let i = 0; i < steps; i++)
          if (model.replay) {
            model.replay.paused = false;
            model.step(0.05);
            model.replay.paused = true;
          } else model.step(0.05);
        return model.battle.elapsed;
      },
      destroy(id) {
        const b = model.battle.buildings.find((v) => v.id === id);
        if (b.hp > 0) model.damage(b, b.hp);
      },
      find(identity, nth = 0) {
        return model.battle.buildings.filter((b) => (b.npc ?? b.kind) === identity)[nth]?.id;
      },
      render(focusId, zoom = 2, dy = -40) {
        model.changed();
        scene.sync();
        const b = model.buildings.find((v) => v.id === focusId);
        if (b) {
          const size = BUILDINGS[b.kind].size,
            p = iso(b.x + size / 2, b.y + size / 2);
          scene.cameras.main.setZoom(zoom).centerOn(p.x, p.y + dy);
        } else scene.resetCamera();
        scene.sync();
        scene.drawOverlay((model.battle?.elapsed ?? 0) * 1000);
      },
      report() {
        const battle = model.battle,
          late = battle?.late;
        const buildings = model.buildings
          // This family's buildings plus every ordinary Builder's Hut (other late families excluded).
          .filter((b) => goblin.handles(b) || huts.handles(b) || (b.kind === 'builder' && !b.npc))
          .map((b) => {
            const family = goblin.handles(b) ? goblin : huts.handles(b) ? huts : null;
            const body = family?.bodies.get(b.id),
              base = family?.bases.get(b.id);
            return {
              id: b.id,
              identity: b.npc ?? b.kind,
              level: b.level,
              hp: b.hp,
              handled: scene.lateCampaign.handles(b),
              spriteAlpha: scene.sprites.get(b.id)?.alpha,
              bodyObjects: body?.objects.length ?? 0,
              baseObjects: base?.objects.length ?? 0,
              pose: body
                ? tagged([body], family === goblin ? 'lateGoblinBuilding' : 'builderHut')[0]
                : undefined,
              bounds: scene.lateCampaign.bounds(b),
            };
          });
        return {
          elapsed: battle?.elapsed,
          finished: battle?.finished,
          buildings,
          weapons: Object.entries(late?.goblinBuildings?.weapons ?? {}).map(([id, w]) => ({
            id: +id,
            kind: w.kind,
            activatedAt: w.activatedAt,
            readyAt: w.readyAt,
            fired: w.fired,
          })),
          destroyed: late?.goblinBuildings?.destroyed ?? {},
          hutStates: Object.entries(late?.builderHut?.huts ?? {}).map(([id, h]) => ({
            id: +id,
            wakeAt: h.wakeAt,
            readyAt: h.readyAt,
            fired: h.fired,
          })),
          hutsDestroyed: late?.builderHut?.destroyed ?? {},
          arrows: tagged(goblin.projectiles.values(), 'lateGoblinArrow'),
          bombs: tagged(goblin.projectiles.values(), 'lateGoblinBomb'),
          bombShadows: [...goblin.shadows.values()].reduce((n, v) => n + v.objects.length, 0),
          nails: tagged(huts.nails.values(), 'builderHutNail'),
          goblinEffects: [...goblin.effects.keys()].sort(),
          hutEffects: [...huts.effects.keys()].sort(),
          gl: game.renderer.gl.getError(),
        };
      },
      /** Sample cues both families hand to the scene audio for the current frame. */
      cues() {
        const context = {
          buildings: model.buildings.filter((b) => model.visibleBuilding(b)),
          battle: model.battle,
          elapsed: model.battle?.elapsed ?? 0,
          reduced: model.state.settings.reducedMotion,
          iso,
          airLift: 46,
        };
        return [...goblin.render(context), ...huts.render(context)].map((cue) => ({
          key: cue.key,
          sample: cue.sample,
          at: cue.at,
        }));
      },
      /** Complete retained display state of both families, for backward-seek comparisons. */
      signature() {
        const r = window.__lgb.report();
        const views = {
          goblin: ['bases', 'bodies', 'projectiles', 'shadows', 'effects'],
          huts: ['bases', 'bodies', 'nails', 'effects'],
        };
        const family = { goblin, huts };
        return JSON.stringify({
          r: { ...r, gl: 0 },
          displayed: Object.entries(views).map(([owner, names]) =>
            names.map((name) => {
              const map = family[owner][name];
              const keys = [...map.keys()].sort();
              return [owner, name, keys, transforms(keys.map((key) => map.get(key)))];
            }),
          ),
        });
      },
    };
  });
  return errors;
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/live-${name}.png` });
type Report = Awaited<ReturnType<typeof report>>;
const report = (page: Page) =>
  page.evaluate(() => window.__lgb.report()) as Promise<{
    elapsed: number;
    finished: boolean;
    buildings: {
      id: number;
      identity: string;
      level: number;
      hp: number;
      handled: boolean;
      spriteAlpha?: number;
      bodyObjects: number;
      baseObjects: number;
      pose?: Record<string, number | string>;
      bounds?: number[];
    }[];
    weapons: { id: number; kind: string; activatedAt?: number; readyAt?: number; fired: number }[];
    destroyed: Record<string, number>;
    hutStates: { id: number; wakeAt?: number; readyAt?: number; fired: number }[];
    hutsDestroyed: Record<string, number>;
    arrows: { id: string; progress: number }[];
    bombs: { id: string; progress: number }[];
    bombShadows: number;
    nails: { id: string; progress: number; export: string }[];
    goblinEffects: string[];
    hutEffects: string[];
    gl: number;
  }>;
const building = (r: Report, id: number) => r.buildings.find((b) => b.id === id)!;
/** Advances `stride` 50-ms steps at a time until the predicate holds on a fresh render. */
async function until(
  page: Page,
  focus: number,
  zoom: number,
  done: (r: Report) => boolean,
  stride = 1,
) {
  for (let steps = 0; steps <= 400; steps += stride) {
    await page.evaluate(([id, z]) => window.__lgb.render(id, z), [focus, zoom]);
    const r = await report(page);
    if (done(r)) return r;
    await page.evaluate((n) => window.__lgb.advance(n), stride);
  }
  throw Error('Condition not reached within 20 seconds');
}

test('every late Goblin building and armed hut renders natively in the five villages', async ({
  page,
}) => {
  const errors = await boot(page);
  const expected: Record<number, Record<string, number>> = {
    67: { 'goblin-castle': 1, 'goblin-hall': 1 },
    73: { 'comm-mast': 8, 'goblin-hall': 1 },
    74: { 'foreboding-cave': 1, 'goblin-hall': 1 },
    84: { 'goblin-hall': 1, builder: 44 },
    89: { 'goblin-boss-th': 1, 'goblin-castle': 1, builder: 6 },
  };
  for (const [index, counts] of Object.entries(expected)) {
    await page.evaluate((i) => window.__lgb.stage(i, []), +index);
    await page.evaluate(() => window.__lgb.render(-1));
    const r = await report(page);
    const seen: Record<string, number> = {};
    for (const b of r.buildings) {
      seen[b.identity] = (seen[b.identity] ?? 0) + 1;
      const label = `${index} ${b.identity} level ${b.level} #${b.id}`;
      expect(b.handled, label).toBe(true);
      expect(b.spriteAlpha ?? 0, label).toBe(0);
      expect(b.bodyObjects, label).toBeGreaterThan(0);
      // alliance_castle_base holds an empty base clip and the hidden edit-mode shadow only.
      const castleBase = b.identity === 'goblin-castle' || b.identity === 'foreboding-cave';
      expect(b.baseObjects > 0, label).toBe(!castleBase);
      expect(b.bounds, label).toHaveLength(4);
      if (b.identity === 'builder') expect(b.pose).toMatchObject({ state: 'dormant' });
      else if (b.identity !== 'goblin-boss-th')
        expect(b.pose).toMatchObject({ state: 'intact', frame: 0 });
    }
    expect(seen).toEqual(counts);
    expect(r.gl).toBe(0);
    await shot(page, `${index}-overview`);
  }
  // Home Builder's Huts keep their ordinary sprite and never become turrets.
  await page.evaluate(() => window.__game.model.returnHome());
  await page.evaluate(() => window.__lgb.render(-1));
  const home = await report(page);
  expect(home.buildings.filter((b) => b.identity === 'builder').length).toBeGreaterThan(0);
  for (const b of home.buildings) {
    expect(b.handled).toBe(false);
    expect(b.spriteAlpha).toBe(1);
  }
  expect(errors).toEqual([]);
});

test('villages completed by the Goblin buildings start through the campaign', async ({ page }) => {
  const errors = await boot(page);
  for (const index of [67, 71, 72, 78, 79, 86]) {
    const started = await page.evaluate(async (i) => {
      const { model, scene } = window.__game;
      const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
      scene.paused = true;
      if (model.battle) model.returnHome();
      model.state.nativeCampaign = freshNativeCampaign();
      model.state.nativeCampaign.stars.fill(1);
      model.startCampaign(i);
      return { index: model.battle?.index, late: !!model.battle?.late };
    }, index);
    expect(started).toEqual({ index, late: true });
    await page.evaluate(() => window.__lgb.render(-1));
    const r = await report(page);
    const goblin = r.buildings.filter((b) => b.identity !== 'builder');
    expect(goblin.length, `village ${index}`).toBeGreaterThan(0);
    for (const b of goblin) {
      expect(b.handled, `${index} ${b.identity}`).toBe(true);
      expect(b.bodyObjects, `${index} ${b.identity}`).toBeGreaterThan(0);
    }
    expect(r.gl).toBe(0);
    await shot(page, `${index}-campaign-start`);
  }
  expect(errors).toEqual([]);
});

test('the Goblin Hall weapon wakes, fires tracked arrows and collapses in Besieged', async ({
  page,
}) => {
  const errors = await boot(page);
  const squads: Squad[] = [
    [6, 0, 'pekka', 'goblin-hall'],
    [6, 0, 'dragon', 'comm-mast', 3],
    [30, 30, 'archer', 'goblin-hall'],
  ];
  expect(await page.evaluate((s) => window.__lgb.replay(73, s, 400), squads)).toBe(true);
  const hall = await page.evaluate(() => window.__lgb.find('goblin-hall'));
  await page.evaluate(() => window.__lgb.seek(0));
  await page.evaluate((id) => window.__lgb.render(id, 2.4), hall);
  expect(building(await report(page), hall).pose).toMatchObject({ state: 'intact', frame: 0 });
  await shot(page, '73-hall-dormant');

  const activating = await until(page, hall, 3, (r) =>
    r.weapons.some((w) => w.id === hall && w.activatedAt !== undefined),
  );
  const weapon = activating.weapons.find((w) => w.id === hall)!;
  expect(weapon.readyAt! - weapon.activatedAt!).toBeCloseTo(0.5, 9);
  await page.evaluate(() => window.__lgb.advance(5));
  await page.evaluate((id) => window.__lgb.render(id, 3), hall);
  const rising = await report(page);
  expect(Number(building(rising, hall).pose!.frame)).toBeGreaterThan(0);
  // Goblin Townhall Activate is a sound-only effect row.
  const cues = await page.evaluate(() => window.__lgb.cues());
  expect(cues).toContainEqual({
    key: `late-goblin:${hall}:activate:0:0`,
    sample: 'late-goblin-gob_th_activate_01',
    at: weapon.activatedAt,
  });
  await shot(page, '73-hall-activating');

  const firing = await until(page, hall, 3, (r) => r.arrows.length > 0);
  expect(firing.elapsed).toBeGreaterThanOrEqual(weapon.readyAt! - 1e-9);
  await shot(page, '73-hall-arrows');
  // Seeking away and back reconstructs the same retained presentation.
  const at = firing.elapsed;
  const before = await page.evaluate(() => window.__lgb.signature());
  await page.evaluate(() => window.__lgb.seek(20));
  await page.evaluate((t) => window.__lgb.seek(t), at);
  await page.evaluate((id) => window.__lgb.render(id, 3), hall);
  expect(await page.evaluate(() => window.__lgb.signature())).toBe(before);

  // Destruction particles live 0.7-2.1 s, so a 0.2-s search stride still observes them.
  const ruined = await until(page, hall, 2.4, (r) => building(r, hall).hp <= 0, 4);
  expect(ruined.goblinEffects.some((k) => k.includes(`:${hall}:destroy:`))).toBe(true);
  await shot(page, '73-hall-destroyed');
  await page.evaluate(() => window.__lgb.advance(30));
  await page.evaluate((id) => window.__lgb.render(id, 2.4), hall);
  const settled = await report(page);
  expect(building(settled, hall)).toMatchObject({ baseObjects: 0, pose: { state: 'ruin' } });
  expect(building(settled, hall).bodyObjects).toBeGreaterThan(0);
  expect(settled.gl).toBe(0);
  await shot(page, '73-hall-ruin');
  expect(errors).toEqual([]);
});

test("armed Builder's Huts wake, aim and fire nails in Builderopolis", async ({ page }) => {
  const errors = await boot(page);
  const squads: Squad[] = [
    [12, 0, 'giant', 'builder'],
    [6, 10, 'balloon', 'builder'],
    [4, 20, 'pekka', 'builder'],
  ];
  expect(await page.evaluate((s) => window.__lgb.replay(84, s, 400), squads)).toBe(true);
  const hut = await page.evaluate(() => window.__lgb.find('builder'));
  await page.evaluate(() => window.__lgb.seek(0));
  await page.evaluate((id) => window.__lgb.render(id, 4, -30), hut);
  expect(building(await report(page), hut).pose).toMatchObject({ state: 'dormant' });
  await shot(page, '84-hut-dormant');

  const waking = await until(page, hut, 4, (r) => {
    const pose = building(r, hut).pose;
    return pose?.state === 'waking' && Number(pose.load) > 10;
  });
  const state = waking.hutStates.find((h) => h.id === hut)!;
  expect(state.readyAt! - state.wakeAt!).toBeGreaterThan(1.4);
  await shot(page, '84-hut-waking');

  const firing = await until(page, hut, 4, (r) =>
    r.nails.some((n) => n.id.startsWith(`${hut}:`) && n.progress > 0.2),
  );
  expect(building(firing, hut).pose).toMatchObject({ state: 'active' });
  expect(firing.nails.find((n) => n.id.startsWith(`${hut}:`))!.export).toMatch(/^nail_ammo_/);
  await shot(page, '84-hut-nails');
  const at = firing.elapsed;
  const before = await page.evaluate(() => window.__lgb.signature());
  await page.evaluate(() => window.__lgb.seek(20));
  await page.evaluate((t) => window.__lgb.seek(t), at);
  await page.evaluate((id) => window.__lgb.render(id, 4, -30), hut);
  expect(await page.evaluate(() => window.__lgb.signature())).toBe(before);

  const standing = Object.keys(firing.hutsDestroyed).length;
  const ruined = await until(
    page,
    hut,
    3,
    (r) => Object.keys(r.hutsDestroyed).length > standing,
    4,
  );
  const [fallen] = Object.entries(ruined.hutsDestroyed)
    .map(([id, at]) => [Number(id), at] as const)
    .sort((a, b) => b[1] - a[1])[0];
  expect(ruined.hutEffects.some((k) => k.includes(`:${fallen}:destroy:`))).toBe(true);
  await page.evaluate(() => window.__lgb.advance(20));
  await page.evaluate((id) => window.__lgb.render(id, 3, -20), fallen);
  const settled = await report(page);
  expect(building(settled, fallen)).toMatchObject({ baseObjects: 0, pose: { state: 'ruin' } });
  expect(settled.hutStates.reduce((n, h) => n + h.fired, 0)).toBeGreaterThan(0);
  expect(settled.gl).toBe(0);
  await shot(page, '84-hut-ruin');
  expect(errors).toEqual([]);
});

test("the Goblin Boss Town Hall throws bombs in M.O.M.M.A's Madhouse", async ({ page }) => {
  const errors = await boot(page);
  const squads: Squad[] = [
    [8, 0, 'pekka', 'goblin-boss-th'],
    [10, 40, 'giant', 'goblin-boss-th'],
  ];
  expect(await page.evaluate((s) => window.__lgb.replay(89, s, 400), squads)).toBe(true);
  const boss = await page.evaluate(() => window.__lgb.find('goblin-boss-th'));
  await page.evaluate(() => window.__lgb.seek(0.3));
  await page.evaluate((id) => window.__lgb.render(id, 2.2), boss);
  const waking = await report(page);
  expect(building(waking, boss).pose).toMatchObject({ state: 'intact' });
  expect(Number(building(waking, boss).pose!.frame)).toBeGreaterThan(0);
  expect(waking.weapons.find((w) => w.id === boss)).toMatchObject({ activatedAt: 0, readyAt: 0.5 });
  await shot(page, '89-boss-activating');

  const throwing = await until(page, boss, 1.6, (r) => r.bombs.length > 0);
  expect(throwing.bombShadows).toBeGreaterThan(0);
  await shot(page, '89-boss-bombs');
  const impact = await until(page, boss, 1.6, (r) =>
    r.goblinEffects.some((k) => k.includes(`:${boss}:hit:`)),
  );
  expect(impact.weapons.find((w) => w.id === boss)!.fired).toBeGreaterThan(0);
  const at = impact.elapsed;
  const before = await page.evaluate(() => window.__lgb.signature());
  await page.evaluate(() => window.__lgb.seek(20));
  await page.evaluate((t) => window.__lgb.seek(t), at);
  await page.evaluate((id) => window.__lgb.render(id, 1.6), boss);
  expect(await page.evaluate(() => window.__lgb.signature())).toBe(before);
  expect(impact.gl).toBe(0);
  await shot(page, '89-boss-impact');
  expect(errors).toEqual([]);
});

test('Goblin Castle, Goblin Hall and Foreboding Cave collapse into their original ruins', async ({
  page,
}) => {
  const errors = await boot(page);
  for (const [index, identities] of [
    [67, ['goblin-castle', 'goblin-hall']],
    [74, ['foreboding-cave', 'goblin-hall']],
  ] as const) {
    await page.evaluate(([i, near]) => window.__lgb.stage(i, [[6, 0, 'pekka', near]]), [
      index,
      identities[0],
    ] as const);
    const ids = await page.evaluate(
      (list) => list.map((identity) => window.__lgb.find(identity)),
      identities as unknown as string[],
    );
    await page.evaluate(() => window.__lgb.advance(40));
    await page.evaluate((id) => window.__lgb.render(id, 2), ids[0]);
    await shot(page, `${index}-${identities[0]}-attacked`);
    // Direct destruction exercises the ruin states without a many-minute siege.
    for (const id of ids) await page.evaluate((v) => window.__lgb.destroy(v), id);
    await page.evaluate(() => window.__lgb.advance(2));
    await page.evaluate((id) => window.__lgb.render(id, 2), ids[0]);
    const falling = await report(page);
    for (const id of ids)
      expect(falling.goblinEffects.some((k) => k.includes(`:${id}:destroy:`))).toBe(true);
    await shot(page, `${index}-${identities[0]}-destroyed`);
    await page.evaluate(() => window.__lgb.advance(30));
    await page.evaluate((id) => window.__lgb.render(id, 2), ids[0]);
    const settled = await report(page);
    for (const id of ids) {
      expect(building(settled, id)).toMatchObject({ baseObjects: 0, pose: { state: 'ruin' } });
      expect(building(settled, id).bodyObjects).toBeGreaterThan(0);
    }
    expect(settled.gl).toBe(0);
    await shot(page, `${index}-${identities[0]}-ruin`);
  }
  expect(errors).toEqual([]);
});
