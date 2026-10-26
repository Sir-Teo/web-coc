import { expect, test, type Page } from '@playwright/test';
import { nativeFieldSpellRecording } from '../fixtures/native-field-spells';
async function boot(page: Page, r: ReturnType<typeof nativeFieldSpellRecording>, late = false) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(
    async ({ r, late }) => {
      window.__field = r;
      const { model, scene, audio } = window.__game,
        { replayBattle } = await import('/src/game/replay.ts');
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      model.battle = late
        ? structuredClone(r.snapshots.find((s) => s.at === r.afterLive).battle)
        : replayBattle(r.data.initial);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    },
    { r, late },
  );
}
async function open(page: Page, version?: number) {
  await page.evaluate(async (version) => {
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
      { model, scene } = window.__game,
      data = structuredClone(window.__field.data);
    if (version) data.version = version;
    model.returnHome();
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Field spell replay rejected');
    scene.sync();
  }, version);
}
async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts'),
      p = iso(11.5, 11.5);
    scene.cameras.main.setZoom(window.innerWidth < 500 ? 0.9 : 1.35).centerOn(p.x, p.y - 125);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return {
      battle: before,
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}
async function ready(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { model, scene, audio } = window.__game,
            { name } = window.__field,
            { spellSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
          scene.drawOverlay(0);
          return (
            scene.fieldSpellPresentations.get(name).hasArt(model.battle, false) &&
            spellSoundFiles(name).every((f) => audio.samples.has(troopSample(f)))
          );
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}
async function visible(page: Page, names: string[]) {
  await expect
    .poll(() =>
      page.evaluate((names) => {
        const { scene } = window.__game;
        scene.drawOverlay(0);
        return names.every((name) =>
          scene.children.list.some(
            (o) => o.getData?.('nativeEffect') === name && o.visible && o.alpha > 0,
          ),
        );
      }, names),
    )
    .toBe(true);
}
for (const { name, level, width } of [
  { name: 'Rage', level: 1, width: 1440 },
  { name: 'Rage', level: 7, width: 390 },
  { name: 'Haste', level: 1, width: 390 },
  { name: 'Haste', level: 7, width: 1440 },
  { name: 'Healing', level: 1, width: 390 },
  { name: 'Healing', level: 12, width: 1440 },
  { name: 'Poison', level: 1, width: 1440 },
  { name: 'Poison', level: 12, width: 390 },
  { name: 'Clone', level: 1, width: 390 },
  { name: 'Clone', level: 9, width: 1440 },
  { name: 'Invisibility', level: 1, width: 1440 },
  { name: 'Invisibility', level: 4, width: 390 },
] as const)
  test(`original ${name} level ${level} fields and audio survive cold portable seeks at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const r = nativeFieldSpellRecording(name, level),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await boot(page, r, true);
    await ready(page);
    expect(requests).toContain(`/assets/field-spells-native/${r.key}/graph.json`);
    if (name === 'Rage')
      expect(requests).toContain('/assets/effects-native/rage-deploy-top/graph.json');
    for (const key of ['rage', 'haste', 'heal', 'poison', 'clone', 'invisibility'])
      if (key !== r.key)
        expect(requests).not.toContain(`/assets/field-spells-native/${key}/graph.json`);
    expect(requests).not.toContain('/assets/jump-spell-native/cast/graph.json');
    const visuals = {
        Rage: { bottle: 'rage_bottleDrop', ground: 'rage_glowPurple', upper: 'rage_smokeRing' },
        Haste: {
          bottle: 'speedup_bottleDrop',
          ground: `Speedup_deploy_range_low_lvl${Math.min(level, 5)}`,
          upper: `Speedup_deploy_range_glow_lvl${Math.min(level, 5)}`,
        },
        Healing: { bottle: 'heal_bottleDrop', ground: 'heal_ring', upper: 'heal_ring5' },
        Poison: { bottle: 'toxic_bottleDrop', ground: 'Toxic_glow', upper: 'Toxic_cloud' },
        Clone: {
          bottle: 'clone_bottleDrop',
          ground: 'clone_deploy_range_lvl1',
          upper: 'clone_black_mist_lvl1',
        },
        Invisibility: {
          bottle: 'invisibility_bottleDrop',
          ground: `invisibility_lvl${level}_ring`,
          upper: `invisibility_lvl${level}_ring2`,
        },
      },
      { bottle, ground, upper } = visuals[name];
    await open(page);
    for (const [at, names, stage] of [
      [r.bottle, [bottle], 'bottle'],
      [r.landing, [ground, upper], 'landing'],
      [r.pulsing, [ground], 'pulsing'],
    ] as const) {
      const result = await seek(page, at);
      expect(result.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === at)!.battle));
      expect(result).toMatchObject({ unchanged: true, gl: 0 });
      await visible(page, [...names]);
      if (name === 'Healing' && stage === 'pulsing') {
        await visible(page, ['heal_ring_effect', 'heal_ring_effect2']);
        const pulses = await page.evaluate(async () => {
          const { capturedSpellEffectEvents } = await import('/src/game/native-spell-effects.ts'),
            source = await import('/reference/field-spells/effects.json'),
            { iso } = await import('/src/game/scene.ts'),
            { model, scene } = window.__game,
            layer = scene.fieldSpellPresentations.get('Healing').layer;
          return capturedSpellEffectEvents(
            model.battle,
            'Healing',
            source.default.spells.Healing.levels,
            iso,
            false,
            (e) => layer.duration(e, Infinity),
          )
            .filter((e) => e.effect === 'Heal spell')
            .map((e) => ({ key: e.key, at: e.at, ground: e.ground }));
        });
        expect(pulses.map((e) => [e.key, e.at])).toEqual([
          ['spell:1:hit:0', 1.5],
          ['spell:1:hit:1', 1.8],
        ]);
        expect(pulses[0].ground).not.toEqual(pulses[1].ground);
      }
      await page.screenshot({
        path: `output/playtest/native-${r.key}-${stage}-${level}-${width}.png`,
      });
    }
    const sound = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        before = JSON.stringify(model.battle);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const name = window.__field.name,
        key =
          name === 'Healing'
            ? 'spell:1:hit:1'
            : name === 'Poison'
              ? 'spell:1:deploy2'
              : 'spell:1:deploy';
      const cue = scene.lastCues.find((c) => c.key === key),
        node = audio.samples.active.get(key);
      if (!cue || !node) throw Error('Original field Web Audio missing after direct seek');
      const result = {
        at: cue.at,
        pitch: cue.pitch,
        volume: cue.volume,
        rate: node.source.playbackRate.value,
        gain: node.gain.gain.value,
        unchanged: before === JSON.stringify(model.battle),
        keys: scene.lastCues.filter((c) => c.key.startsWith('spell:1:')).map((c) => c.key),
      };
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return result;
    });
    const volume = {
        Rage: 0.9,
        Haste: 0.7,
        Healing: 0.3,
        Poison: 0.8,
        Clone: 0.95,
        Invisibility: 0.9,
      }[name],
      keys =
        name === 'Healing'
          ? ['spell:1:preDeploy', 'spell:1:deploy', 'spell:1:hit:0', 'spell:1:hit:1']
          : name === 'Poison'
            ? ['spell:1:preDeploy', 'spell:1:deploy2']
            : ['spell:1:preDeploy', 'spell:1:deploy'];
    expect(sound).toMatchObject({
      at: name === 'Healing' ? 1.8 : 0.8,
      volume,
      unchanged: true,
      keys,
    });
    if (name === 'Healing') {
      expect(sound.pitch).toBeGreaterThanOrEqual(0.8);
      expect(sound.pitch).toBeLessThanOrEqual(0.9);
    } else
      expect(sound.pitch).toBe(
        { Rage: 0.75, Haste: 0.97, Poison: 0.97, Clone: 0.97, Invisibility: 1 }[name],
      );
    expect(sound.rate).toBeCloseTo(sound.pitch, 6);
    expect(sound.gain).toBeCloseTo(volume * 0.12, 6);
    const steady = await seek(page, r.steady);
    await visible(page, [ground]);
    await seek(page, r.fieldAfter);
    expect(
      await page.evaluate(
        () => window.__game.scene.fieldSpellPresentations.get(window.__field.name).layer.views.size,
      ),
    ).toBe(0);
    await seek(page, r.bottle);
    expect((await seek(page, r.steady)).battle).toBe(steady.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await seek(page, r.steady)).battle).toBe(steady.battle);
    expect(
      await page.evaluate(
        () => window.__game.scene.fieldSpellPresentations.get(window.__field.name).layer.views.size,
      ),
    ).toBe(0);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    if (name === 'Healing') {
      await open(page, 118);
      await seek(page, r.pulsing);
      await visible(page, [ground]);
      expect(
        await page.evaluate(() => {
          const { model, scene } = window.__game;
          return {
            pulse: model.battle.nativeSpellPulsePresentation,
            meshes: scene.children.list.filter(
              (o) =>
                ['heal_ring_effect', 'heal_ring_effect2'].includes(o.getData?.('nativeEffect')) &&
                o.visible,
            ).length,
          };
        }),
      ).toEqual({ pulse: undefined, meshes: 0 });
    }
    const oldVersion =
      name === 'Clone' || name === 'Invisibility'
        ? 119
        : name === 'Healing' || name === 'Poison'
          ? 117
          : 116;
    await open(page, oldVersion);
    await seek(page, r.steady);
    expect(
      await page.evaluate(() => {
        const { model, scene } = window.__game,
          view = scene.fieldSpellPresentations.get(window.__field.name);
        return {
          ready: view.hasArt(model.battle, false),
          views: view.layer.views.size,
          names: model.battle.nativeSpellArt,
          history: model.battle.nativeSpellCastHistory,
        };
      }),
    ).toEqual({
      ready: false,
      views: 0,
      names:
        oldVersion === 119
          ? ['Jump', 'Rage', 'Haste', 'Healing', 'Poison']
          : oldVersion === 117
            ? ['Jump', 'Rage', 'Haste']
            : ['Jump'],
      history: undefined,
    });
    expect(errors).toEqual([]);
  });
for (const { name, path, heldEffect, otherEffect } of [
  {
    name: 'Rage',
    path: 'field-spells-native/rage',
    heldEffect: 'Rage deploy',
    otherEffect: 'Rage deploy top',
  },
  {
    name: 'Rage',
    path: 'effects-native/rage-deploy-top',
    heldEffect: 'Rage deploy top',
    otherEffect: 'Rage deploy',
  },
  {
    name: 'Haste',
    path: 'field-spells-native/haste',
    heldEffect: 'Speedup_deploy_lvl1',
    otherEffect: undefined,
  },
  {
    name: 'Healing',
    path: 'field-spells-native/heal',
    heldEffect: 'Heal area',
    otherEffect: undefined,
  },
  {
    name: 'Poison',
    path: 'field-spells-native/poison',
    heldEffect: 'Toxic deploy ground halloween',
    otherEffect: undefined,
  },
  {
    name: 'Clone',
    path: 'field-spells-native/clone',
    heldEffect: 'Clone deploy',
    otherEffect: undefined,
  },
  {
    name: 'Invisibility',
    path: 'field-spells-native/invisibility',
    heldEffect: 'Invisibility area lvl1',
    otherEffect: undefined,
  },
] as const)
  test(`${name} keeps an atomic fallback while ${path} loads, fails and reconnects`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 960 });
    let release!: () => void,
      rejecting = true,
      requested = 0;
    const held = new Promise<void>((resolve) => (release = resolve)),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(`**/assets/${path}/graph.json`, async (route) => {
      requested++;
      await held;
      if (rejecting) await route.fulfill({ status: 503, body: 'Temporary field art failure' });
      else await route.continue();
    });
    const r = nativeFieldSpellRecording(name);
    await boot(page, r);
    await expect.poll(() => requested).toBeGreaterThan(0);
    await open(page);
    const recoveryAt = name === 'Healing' ? r.pulsing : r.landing,
      before = await seek(page, recoveryAt);
    if (otherEffect)
      await page.waitForFunction(
        (effect) =>
          window.__game.scene.fieldSpellPresentations
            .get(window.__field.name)
            .layer.status(effect) === 'ready',
        otherEffect,
      );
    expect(
      await page.evaluate(() => {
        const { model, scene } = window.__game,
          { name, key } = window.__field,
          view = scene.fieldSpellPresentations.get(name);
        scene.effect({ type: 'spell', spell: key, x: 11.5, y: 11.5, radius: 5 });
        scene.drainEffects();
        return {
          ready: view.hasArt(model.battle, false),
          views: view.layer.views.size,
          rings: scene.children.list.filter(
            (o) => o.active && o.getData?.('nativeSpellFallback') === name,
          ).length,
        };
      }),
    ).toEqual({ ready: false, views: 0, rings: 1 });
    // Exercise the real frame cache while the replay is paused; no forced draw after recovery.
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.replay.paused = true;
      scene.paused = false;
      model.changed();
    });
    release();
    await page.waitForFunction(
      (effect) =>
        window.__game.scene.fieldSpellPresentations
          .get(window.__field.name)
          .layer.status(effect) === 'none',
      heldEffect,
    );
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      before.battle,
    );
    rejecting = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => {
      const { model, scene } = window.__game;
      return scene.fieldSpellPresentations.get(window.__field.name).hasArt(model.battle, false);
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__game.scene.children.list.filter(
              (o) => o.active && o.getData?.('nativeSpellFallback') === window.__field.name,
            ).length,
        ),
      )
      .toBe(0);
    expect(
      await page.evaluate(() => {
        const { scene } = window.__game,
          name = window.__field.name;
        return {
          ready: scene.spellArtReady(name),
          rings: scene.children.list.filter(
            (o) => o.active && o.getData?.('nativeSpellFallback') === name,
          ).length,
        };
      }),
    ).toEqual({ ready: true, rings: 0 });
    expect((await seek(page, recoveryAt)).battle).toBe(before.battle);
    await visible(page, [
      {
        Rage: 'rage_glowPurple',
        Haste: 'Speedup_deploy_range_low_lvl1',
        Healing: 'heal_ring',
        Poison: 'Toxic_glow',
        Clone: 'clone_deploy_range_lvl1',
        Invisibility: 'invisibility_lvl1_ring',
      }[name],
    ]);
    if (name === 'Healing') await visible(page, ['heal_ring_effect', 'heal_ring_effect2']);
    expect(errors).toEqual([]);
  });
