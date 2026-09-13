import { expect, test, type Page } from '@playwright/test';

/**
 * Live Eagle Artillery and Scattershot presentation in original campaign villages, driven by real
 * deployments through the game model. Screenshots are written for visual review.
 */
const EA = 'output/playtest/eagle-artillery';
const SS = 'output/playtest/scattershot';

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  return errors;
}

/** Village setup: the playable campaign flow when available, otherwise the ungated native layout. */
async function battle(page: Page, index: number, army: Record<string, number>, spells: Record<string, number> = {}) {
  return page.evaluate(
    async ({ index, army, spells }) => {
      const { model, scene } = window.__game;
      const native = await import('/src/game/native-campaign.ts');
      const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
      const { TROOP_KEYS, maxTroopLevel } = await import('/src/game/data.ts');
      const { replayBattle } = await import('/src/game/replay.ts');
      const { campaignResources } = await import('/src/game/campaign-loot.ts');
      const { campaignStage } = await import('/src/game/campaign-catalog.ts');
      model.state.army = { ...emptyArmy(), ...army };
      model.state.spells = { ...emptySpells(), ...spells };
      model.state.king = undefined;
      model.state.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, maxTroopLevel(k)]));
      model.state.nativeCampaign = native.freshNativeCampaign();
      model.state.nativeCampaign.stars.fill(1);
      const playable = native.nativeCampaignIssues(index).length === 0;
      if (playable) model.startCampaign(index);
      else {
        const loot = campaignResources(campaignStage(index, 'goblin-v1'));
        model.battle = replayBattle(
          {
            catalog: 'goblin-v1',
            scenery: native.nativeScenery(index),
            index,
            practice: false,
            buildings: native.nativeLayout(index),
            army: model.state.army,
            spells: model.state.spells,
            troopLevels: model.state.troopLevels,
            spellLevels: { rage: 1, heal: 1, lightning: 1 },
            nextId: model.state.nextId,
            availableLoot: loot,
            lootRoom: loot,
          },
          44,
        );
      }
      scene.paused = true;
      model.changed();
      scene.sync();
      scene.resetCamera();
      scene.drawOverlay(0);
      return {
        playable,
        defenses: model.battle.buildings
          .filter((b) => b.kind === 'eagleartillery' || b.kind === 'scattershot')
          .map((b) => ({ id: b.id, kind: b.kind, x: b.x, y: b.y, level: b.level })),
      };
    },
    { index, army, spells },
  );
}

type Deploy = { kind: string; count: number; x: number; y: number; dx?: number; dy?: number };
/** Deploys through GameModel.deploy/castSpell, then advances the fixed 50 ms battle step. */
async function advance(page: Page, seconds: number, deploy: Deploy[] = [], cast: [number, number][] = []) {
  return page.evaluate(
    async ({ seconds, deploy, cast }) => {
      const { model, scene } = window.__game;
      const b = model.battle;
      for (const d of deploy) {
        model.activeTroop = d.kind;
        for (let i = 0; i < d.count; i++)
          if (!model.deploy(d.x + i * (d.dx ?? 0), d.y + i * (d.dy ?? 0.4))) throw Error(`deploy ${d.kind}`);
      }
      for (const [x, y] of cast) {
        model.activeSpell = 'lightning';
        if (!model.castSpell(x, y)) throw Error('cast');
      }
      for (let t = 0; t < seconds - 1e-9; t += 0.05) model.step(0.05);
      scene.sync();
      scene.drawOverlay(b.elapsed * 1000);
      const ea = b.late?.eagleArtillery,
        ss = b.late?.scattershot;
      return {
        elapsed: b.elapsed,
        finished: b.finished,
        deployed: ea?.deployed,
        eagles: Object.fromEntries(
          Object.entries(ea?.towers ?? {}).map(([id, t]) => [
            id,
            { stages: t.stages.length, awakeAt: t.awakeAt, fired: t.fired, ammunition: t.ammunition, emptyAt: t.emptyAt, reticle: t.reticle, launches: t.volleys.flatMap((v) => v.launches) },
          ]),
        ),
        shells: ea?.shells.map((s) => ({ id: s.id, towerId: s.towerId, x: s.x, y: s.y, launchedAt: s.launchedAt, arrivesAt: s.arrivesAt })) ?? [],
        eagleImpacts: ea?.impacts.map((i) => ({ id: i.id, towerId: i.towerId, x: i.x, y: i.y, at: i.at, hits: i.hits })) ?? [],
        scatter: Object.fromEntries(
          Object.entries(ss?.towers ?? {}).map(([id, t]) => [id, { fired: t.fired, targetId: t.targetId, shots: t.shots.map((s) => s.at) }]),
        ),
        projectiles: ss?.projectiles.map((p) => ({ id: p.id, towerId: p.towerId, x: p.x, y: p.y })) ?? [],
        scatterImpacts: ss?.impacts.map((i) => ({ id: i.id, towerId: i.towerId, x: i.x, y: i.y, at: i.at, spellAt: i.spellAt, primary: i.primaryHits, shards: i.shardHits })) ?? [],
      };
    },
    { seconds, deploy, cast },
  );
}
type State = Awaited<ReturnType<typeof advance>>;

/** Advance in 50 ms steps until a battle predicate holds. */
async function until(page: Page, predicate: (s: State) => boolean, limit = 30) {
  let state = await advance(page, 0);
  for (let t = 0; t < limit && !predicate(state); t += 0.05) state = await advance(page, 0.05);
  expect(predicate(state), `condition by ${state.elapsed}s`).toBe(true);
  return state;
}

async function focus(page: Page, x: number, y: number, zoom: number, lift = 60) {
  await page.evaluate(
    async ({ x, y, zoom, lift }) => {
      const { scene, model } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      scene.setZoom(zoom);
      const p = iso(x, y);
      scene.cameras.main.centerOn(p.x, p.y - lift);
      scene.drawOverlay((model.battle?.elapsed ?? 0) * 1000);
    },
    { x, y, zoom, lift },
  );
}

/** Rendered family objects and their recorded presentation data, independent of the camera. */
async function presentation(page: Page, key: 'eagleArtillery' | 'scattershot') {
  return page.evaluate((key) => {
    const { scene, game } = window.__game;
    const rows = scene.children.list
      .filter((o) => o.getData?.(key) !== undefined && o.visible)
      .map((o) => JSON.stringify([o.getData(key), Math.round(o.x * 10) / 10, Math.round(o.y * 10) / 10, o.depth]));
    return { rows: [...new Set(rows)].sort(), gl: game.renderer.gl.getError() };
  }, key);
}

test('Where Eagles Dare (65): dormancy, activation, firing, impact and replay seeks', async ({ page }) => {
  const errors = await open(page);
  const setup = await battle(page, 65, { giant: 40, archer: 40, wizard: 10 });
  expect(setup.playable).toBe(true);
  const eagles = setup.defenses.filter((d) => d.kind === 'eagleartillery');
  expect(eagles.map((d) => d.level)).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  const watched = eagles.find((d) => d.x === 16 && d.y === 22)!;
  await focus(page, watched.x + 2, watched.y + 2, 2);
  let rows = await presentation(page, 'eagleArtillery');
  expect(rows.rows.some((r) => r.includes('"state":"active"') && r.includes('"awake":false'))).toBe(true);
  await page.screenshot({ path: `${EA}/65-dormant.png` });

  // 150 housing: three of four activation stages light up while the tower stays dormant.
  let state = await advance(page, 1.2, [{ kind: 'giant', count: 30, x: 2, y: 14, dy: 0.5 }]);
  expect(state.eagles[watched.id]).toMatchObject({ stages: 3, fired: 0 });
  expect(state.eagles[watched.id].awakeAt).toBeUndefined();
  await focus(page, watched.x + 2, watched.y + 2, 2);
  await page.screenshot({ path: `${EA}/65-activating.png` });

  // 200 housing wakes every Eagle Artillery; archers follow the giants into the shockwaves.
  state = await advance(page, 1.2, [
    { kind: 'giant', count: 10, x: 2.6, y: 14, dy: 0.5 },
    { kind: 'archer', count: 40, x: 3, y: 12, dy: 0.3 },
  ]);
  expect(state.deployed).toBeGreaterThanOrEqual(200);
  expect(state.eagles[watched.id].awakeAt).toBeDefined();
  await focus(page, watched.x + 2, watched.y + 2, 2);
  await page.screenshot({ path: `${EA}/65-awake.png` });

  state = await until(page, (s) => s.eagles[watched.id].fired >= 1);
  const firingAt = state.elapsed;
  await focus(page, watched.x + 2, watched.y + 2, 1.6, 90);
  const liveFiring = await presentation(page, 'eagleArtillery');
  expect(liveFiring.rows.some((r) => r.includes('"beam":"up"'))).toBe(true);
  await page.screenshot({ path: `${EA}/65-firing.png` });
  await advance(page, 0.8);
  await page.evaluate(() => window.__game.scene.resetCamera());
  await advance(page, 0);
  const flight = await presentation(page, 'eagleArtillery');
  expect(flight.rows.some((r) => r.includes('"shell"'))).toBe(true);
  await page.screenshot({ path: `${EA}/65-shells-in-flight.png` });

  state = await until(page, (s) => s.eagleImpacts.some((i) => i.towerId === watched.id), 8);
  const impact = state.eagleImpacts.find((i) => i.towerId === watched.id)!;
  state = await advance(page, 0.1);
  const impactAt = state.elapsed;
  await focus(page, impact.x, impact.y, 1.6, 40);
  const liveImpact = await presentation(page, 'eagleArtillery');
  expect(liveImpact.rows.some((r) => r.includes('Artillery Hit') || r.includes('Ancient Hit'))).toBe(true);
  await page.screenshot({ path: `${EA}/65-impact.png` });
  await advance(page, 0.5);
  await page.screenshot({ path: `${EA}/65-shockwave.png` });
  expect(liveImpact.gl).toBe(0);

  // Portable replay: backward seeks rebuild identical recorded-history presentation.
  const opened = await page.evaluate(async () => {
    const { model } = window.__game;
    model.finishBattle();
    const record = model.state.raidLog[0].replay;
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    return model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(record))));
  });
  expect(opened).toBe(true);
  const seek = async (time: number) => {
    await page.evaluate((time) => window.__game.model.seekReplay(time), time);
    await page.waitForFunction(() => {
      const { model } = window.__game;
      if (model.replay.seeking) model.step(0.05);
      return !model.replay.seeking;
    });
    await page.evaluate(() => {
      const { scene, model } = window.__game;
      scene.sync();
      scene.drawOverlay(model.battle.elapsed * 1000);
    });
  };
  await seek(impactAt);
  await focus(page, impact.x, impact.y, 1.6, 40);
  expect(await presentation(page, 'eagleArtillery')).toEqual(liveImpact);
  await page.screenshot({ path: `${EA}/65-replay-impact.png` });
  await seek(firingAt);
  await focus(page, watched.x + 2, watched.y + 2, 1.6, 90);
  expect(await presentation(page, 'eagleArtillery')).toEqual(liveFiring);
  await page.screenshot({ path: `${EA}/65-replay-firing.png` });
  expect(errors).toEqual([]);
});

test('Go to Bat (75): Scattershot idle, throw, impact cone and ruin', async ({ page }) => {
  const errors = await open(page);
  const setup = await battle(page, 75, { giant: 16, swordsman: 40, balloon: 8 });
  const scatter = setup.defenses.filter((d) => d.kind === 'scattershot');
  expect(scatter.map((d) => d.level)).toEqual([2, 2, 2, 2, 2, 2]);
  const watched = scatter.find((d) => d.x === 16 && d.y === 16)!;
  await focus(page, watched.x + 1.5, watched.y + 1.5, 2.2, 40);
  await page.screenshot({ path: `${SS}/75-idle.png` });

  await advance(page, 0.05, [
    { kind: 'giant', count: 16, x: 4, y: 6, dy: 0.5 },
    { kind: 'swordsman', count: 40, x: 4.6, y: 6, dy: 0.25 },
    { kind: 'balloon', count: 8, x: 6, y: 3, dx: 0.8, dy: 0 },
  ]);
  let state = await until(page, (s) => s.projectiles.some((p) => p.towerId === watched.id), 40);
  state = await advance(page, 0.2);
  const rock = state.projectiles.find((p) => p.towerId === watched.id)!;
  await focus(page, (watched.x + 1.5 + rock.x) / 2, (watched.y + 1.5 + rock.y) / 2, 1.4, 70);
  const flight = await presentation(page, 'scattershot');
  expect(flight.rows.some((r) => r.includes('"projectile"'))).toBe(true);
  await page.screenshot({ path: `${SS}/75-throw.png` });

  state = await until(page, (s) => s.scatterImpacts.some((i) => i.towerId === watched.id), 3);
  const impact = state.scatterImpacts.find((i) => i.towerId === watched.id)!;
  // The shard cone opens behind the target, away from the tower.
  for (const [i, dt] of [0.05, 0.25].entries()) {
    await advance(page, dt);
    await focus(page, impact.x, impact.y, 1.6, 30);
    const cone = await presentation(page, 'scattershot');
    expect(cone.rows.some((r) => r.includes('"cone"'))).toBe(true);
    expect(cone.gl).toBe(0);
    await page.screenshot({ path: `${SS}/75-impact-cone-${i + 1}.png` });
  }
  await page.evaluate(() => window.__game.scene.resetCamera());
  await advance(page, 0);
  await page.screenshot({ path: `${SS}/75-battle-wide.png` });

  // Ruin: the original rubble export and destruction effect replace the turret.
  await page.evaluate((id) => {
    const { model } = window.__game;
    const b = model.battle.buildings.find((v) => v.id === id);
    model.damage(b, b.hp);
  }, watched.id);
  await advance(page, 0.3);
  await focus(page, watched.x + 1.5, watched.y + 1.5, 2.2, 30);
  const ruin = await presentation(page, 'scattershot');
  expect(ruin.rows.some((r) => r.includes('"state":"ruin"'))).toBe(true);
  await page.screenshot({ path: `${SS}/75-ruin.png` });
  expect(errors).toEqual([]);
});

test('Titanic (80): level-5 Eagle Artillery and level-3 Scattershots in one attack', async ({ page }) => {
  const errors = await open(page);
  const setup = await battle(page, 80, { giant: 20, dragon: 5, archer: 30 }, { lightning: 2 });
  const eagles = setup.defenses.filter((d) => d.kind === 'eagleartillery');
  const scatter = setup.defenses.filter((d) => d.kind === 'scattershot');
  expect(eagles.map((d) => d.level)).toEqual([5, 5]);
  expect(scatter.map((d) => d.level)).toEqual([3, 3, 3, 3]);
  await advance(page, 0.05, [
    { kind: 'giant', count: 20, x: 2, y: 20, dy: 0.4 },
    { kind: 'dragon', count: 5, x: 2.5, y: 22, dy: 0.8 },
    { kind: 'archer', count: 30, x: 3, y: 19, dy: 0.3 },
  ], [[10, 24], [12, 24]]);
  let state = await until(page, (s) => Object.values(s.eagles).some((t) => t.fired >= 1), 12);
  const firing = eagles.find((d) => state.eagles[d.id].fired >= 1)!;
  await focus(page, firing.x + 2, firing.y + 2, 1.6, 90);
  await page.screenshot({ path: `${EA}/80-firing.png` });
  const since = state.elapsed;
  state = await until(page, (s) => s.scatterImpacts.some((i) => i.at > since), 20);
  const impact = state.scatterImpacts.find((i) => i.at > since)!;
  const thrower = scatter.find((d) => d.id === impact.towerId)!;
  await advance(page, 0.1);
  await focus(page, (thrower.x + 1.5 + impact.x) / 2, (thrower.y + 1.5 + impact.y) / 2, 1.4, 50);
  expect((await presentation(page, 'scattershot')).rows.some((r) => r.includes('"cone"'))).toBe(true);
  await page.screenshot({ path: `${SS}/80-impact.png` });
  await page.evaluate(() => window.__game.scene.resetCamera());
  await advance(page, 0);
  await page.screenshot({ path: `${EA}/80-battle-wide.png` });
  const landed = state.elapsed;
  state = await until(page, (s) => s.eagleImpacts.some((i) => i.at > landed), 8);
  const shell = state.eagleImpacts.find((i) => i.at > landed)!;
  await focus(page, shell.x, shell.y, 1.6, 40);
  await advance(page, 0.05);
  await page.screenshot({ path: `${EA}/80-impact.png` });
  const rows = await presentation(page, 'eagleArtillery');
  expect(rows.gl).toBe(0);
  expect(errors).toEqual([]);
});

test('Monolithic (85): level-5 Eagle Artillery awake, empty and ruined', async ({ page }) => {
  const errors = await open(page);
  const setup = await battle(page, 85, { giant: 40, archer: 20 });
  const eagles = setup.defenses.filter((d) => d.kind === 'eagleartillery');
  expect(eagles.map((d) => d.level)).toEqual([5, 5]);
  const [watched, other] = eagles;
  await focus(page, watched.x + 2, watched.y + 2, 2);
  await page.screenshot({ path: `${EA}/85-dormant.png` });
  let state = await advance(page, 1.3, [
    { kind: 'giant', count: 40, x: 2, y: 30, dy: 0.35 },
    { kind: 'archer', count: 20, x: 2.6, y: 30, dy: 0.5 },
  ]);
  expect(state.eagles[watched.id].awakeAt).toBeDefined();
  await focus(page, watched.x + 2, watched.y + 2, 2);
  await page.screenshot({ path: `${EA}/85-awake.png` });
  // Presentation harness: leave three shells so one real burst empties this tower.
  await page.evaluate((id) => {
    window.__game.model.battle.late.eagleArtillery.towers[id].ammunition = 3;
  }, watched.id);
  state = await until(page, (s) => s.eagles[watched.id].emptyAt !== undefined, 8);
  await advance(page, 1.2);
  await focus(page, watched.x + 2, watched.y + 2, 2);
  const empty = await presentation(page, 'eagleArtillery');
  expect(empty.rows.some((r) => r.includes(`"id":${watched.id}`) && r.includes('"ammunition":0'))).toBe(true);
  await page.screenshot({ path: `${EA}/85-empty.png` });
  await page.evaluate((id) => {
    const { model } = window.__game;
    const b = model.battle.buildings.find((v) => v.id === id);
    model.damage(b, b.hp);
  }, other.id);
  await advance(page, 0.4);
  await focus(page, other.x + 2, other.y + 2, 2, 40);
  const ruin = await presentation(page, 'eagleArtillery');
  expect(ruin.rows.some((r) => r.includes(`"id":${other.id}`) && r.includes('"state":"ruin"'))).toBe(true);
  await page.screenshot({ path: `${EA}/85-ruin.png` });
  expect(errors).toEqual([]);
});
