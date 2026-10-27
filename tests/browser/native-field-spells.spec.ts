import { expect, test, type Page } from '@playwright/test';
import { nativeFieldSpellRecording } from '../fixtures/native-field-spells';
import { nativeReviveCastRecording } from '../fixtures/native-revive-cast';
async function boot(
  page: Page,
  r: ReturnType<typeof nativeFieldSpellRecording>,
  late = false,
  version?: number,
) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(
    async ({ r, late, version }) => {
      window.__field = r;
      const { model, scene, audio } = window.__game,
        { replayBattle } = await import('/src/game/replay.ts');
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      model.battle = late
        ? structuredClone(
            r.snapshots.find(
              (s) =>
                s.at ===
                (r.name === 'Earthquake' || r.name === 'AngrySpell' || r.name === 'Ice Block'
                  ? r.steady
                  : r.afterLive),
            ).battle,
          )
        : replayBattle(r.data.initial, version);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    },
    { r, late, version },
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
      p = iso(window.__field.anchor.x, window.__field.anchor.y);
    if (window.__field.name === 'Revive') scene.cameras.main.useBounds = false;
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
  { name: 'Recall', level: 1, width: 390 },
  { name: 'Recall', level: 7, width: 1440 },
  { name: 'Lightning', level: 1, width: 390 },
  { name: 'Lightning', level: 13, width: 1440 },
  { name: 'Earthquake', level: 1, width: 390 },
  { name: 'Earthquake', level: 8, width: 1440 },
  { name: 'Skeleton Spell', level: 1, width: 390 },
  { name: 'Skeleton Spell', level: 8, width: 1440 },
  { name: 'Bat Spell', level: 1, width: 1440 },
  { name: 'Bat Spell', level: 8, width: 390 },
  { name: 'Totem Spell', level: 1, width: 1440 },
  { name: 'Totem Spell', level: 4, width: 390 },
  { name: 'AngrySpell', level: 1, width: 390 },
  { name: 'AngrySpell', level: 4, width: 1440 },
  { name: 'Ice Block', level: 1, width: 1440 },
  { name: 'Ice Block', level: 6, width: 390 },
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
    for (const key of [
      'rage',
      'haste',
      'heal',
      'poison',
      'clone',
      'invisibility',
      'recall',
      'lightning',
      'earthquake',
      'skeleton',
      'bat',
      'totem',
      'angry',
      'iceblock',
      'revive',
    ])
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
        'Ice Block': {
          bottle: 'IceBlock_bottleDrop',
          ground: 'e_spells_iceblock_Surface',
          upper: 'e_spells_iceblock_FloatingRocks',
        },
        'Totem Spell': {
          bottle: 'e_spells_meteortotem_bottledrop',
          ground: 'e_spells_meteortotem_ring',
          upper: 'e_spells_meteortotem_shockwave',
        },
        AngrySpell: {
          bottle: 'e_spell_angryspell_predeploy',
          ground: 'e_spell_angryspell_centre_splat_next',
          upper: 'e_spell_angryspell_startspat_next',
        },
        'Skeleton Spell': {
          bottle: 'Skeleton_bottleDrop',
          ground: `skele_summon_area_edge${level}`,
          upper: `skele_summon_red_glow${level}`,
        },
        'Bat Spell': {
          bottle: 'bat_bottleDrop',
          ground: `bat_summon_area_edge${level}`,
          upper: `bat_summon_purple_glow${level}`,
        },
        Earthquake: {
          bottle: 'Earthquake_bottleDrop',
          ground: 'Earthquake_crackCenter',
          upper: 'Earthquake_debris',
        },
        Lightning: {
          bottle: 'lightning_bottleDrop',
          ground: 'Lightning_area_ring_small',
          upper: 'LightningSky',
        },
        Recall: {
          bottle: 'recall_bottleDrop',
          ground: 'RecallCircleGround',
          upper: 'RecallCircleTwirl',
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
          name === 'Lightning'
            ? 'spell:1:charging'
            : name === 'AngrySpell'
              ? 'spell:1:deploy2'
              : name === 'Healing'
                ? 'spell:1:hit:1'
                : name === 'Poison' || name === 'Recall' || name === 'Earthquake'
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
        ...(name === 'Lightning'
          ? {
              impact: {
                at: scene.lastCues.find((c) => c.key === 'spell:1:hit:0')?.at,
                gain: audio.samples.active.get('spell:1:hit:0')?.gain.gain.value,
                rate: audio.samples.active.get('spell:1:hit:0')?.source.playbackRate.value,
              },
            }
          : {}),
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
        Recall: 1,
        Lightning: 0.8,
        Earthquake: 0.8,
        'Skeleton Spell': 0.5,
        'Bat Spell': 0.6,
        'Totem Spell': 1,
        AngrySpell: 0.8,
        'Ice Block': 1,
      }[name],
      keys =
        name === 'AngrySpell'
          ? ['spell:1:preDeploy', 'spell:1:deploy', 'spell:1:deploy2']
          : name === 'Lightning'
            ? ['spell:1:preDeploy', 'spell:1:deploy', 'spell:1:charging', 'spell:1:hit:0']
            : name === 'Healing'
              ? ['spell:1:preDeploy', 'spell:1:deploy', 'spell:1:hit:0', 'spell:1:hit:1']
              : name === 'Poison' || name === 'Recall' || name === 'Earthquake'
                ? ['spell:1:preDeploy', 'spell:1:deploy2']
                : ['spell:1:preDeploy', 'spell:1:deploy'];
    expect(sound).toMatchObject({
      at: name === 'Healing' ? 1.8 : name === 'AngrySpell' ? 1.1 : 0.8,
      volume,
      unchanged: true,
      keys,
    });
    if (name === 'Lightning') {
      expect(sound.pitch).toBeGreaterThanOrEqual(1);
      expect(sound.pitch).toBeLessThanOrEqual(1.2);
      expect(sound.impact.at).toBe(0.9);
      expect(sound.impact.gain).toBeCloseTo(0.7 * 0.12, 6);
      expect(sound.impact.rate).toBeGreaterThanOrEqual(0.95);
      expect(sound.impact.rate).toBeLessThanOrEqual(1.05);
    } else if (name === 'Totem Spell') {
      expect(sound.pitch).toBeGreaterThanOrEqual(0.9);
      expect(sound.pitch).toBeLessThanOrEqual(1.1);
    } else if (name === 'Skeleton Spell') {
      expect(sound.pitch).toBeGreaterThanOrEqual(0.95);
      expect(sound.pitch).toBeLessThanOrEqual(1.05);
    } else if (name === 'Healing') {
      expect(sound.pitch).toBeGreaterThanOrEqual(0.8);
      expect(sound.pitch).toBeLessThanOrEqual(0.9);
    } else
      expect(sound.pitch).toBe(
        {
          Rage: 0.75,
          Haste: 0.97,
          Poison: 0.97,
          Clone: 0.97,
          Invisibility: 1,
          Recall: 1,
          Earthquake: 0.97,
          'Bat Spell': 1,
          AngrySpell: 1,
          'Ice Block': 1,
        }[name],
      );
    expect(sound.rate).toBeCloseTo(sound.pitch, 6);
    expect(sound.gain).toBeCloseTo(volume * 0.12, 6);
    if (name === 'Totem Spell') {
      await seek(page, 1.45);
      expect(
        await page.evaluate(() => {
          const { model, scene } = window.__game,
            before = JSON.stringify(model.battle);
          scene.effect({ type: 'spell-native', text: 'TotemSummon', x: 11.5, y: 11.5, radius: 5 });
          scene.drainEffects();
          return {
            chainReady: scene.spellArtReady('TotemSummon'),
            born: model.battle.units.find((u) => u.kind === 'totem')?.spawnedAt,
            fallback: scene.children.list.filter(
              (o) => o.active && o.getData?.('nativeSpellFallback') === 'Totem Spell',
            ).length,
            unchanged: before === JSON.stringify(model.battle),
          };
        }),
      ).toEqual({ chainReady: true, born: 1.4, fallback: 0, unchanged: true });
    }
    if (name === 'Ice Block') {
      const melt = await seek(page, r.nearEnd);
      expect(melt).toMatchObject({ unchanged: true, gl: 0 });
      await visible(page, ['e_spells_iceblock_Melt']);
      await page.screenshot({
        path: `output/playtest/native-iceblock-melting-${level}-${width}.png`,
      });
    }
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
      name === 'Ice Block'
        ? 127
        : name === 'Totem Spell' || name === 'AngrySpell'
          ? 126
          : name === 'Skeleton Spell' || name === 'Bat Spell'
            ? 125
            : name === 'Earthquake'
              ? 124
              : name === 'Lightning'
                ? 123
                : name === 'Recall'
                  ? 120
                  : name === 'Clone' || name === 'Invisibility'
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
        oldVersion === 127
          ? [
              'Jump',
              'Rage',
              'Haste',
              'Healing',
              'Poison',
              'Clone',
              'Invisibility',
              'Recall',
              'Lightning',
              'Earthquake',
              'Skeleton Spell',
              'Bat Spell',
              'Totem Spell',
              'AngrySpell',
            ]
          : oldVersion === 126
            ? [
                'Jump',
                'Rage',
                'Haste',
                'Healing',
                'Poison',
                'Clone',
                'Invisibility',
                'Recall',
                'Lightning',
                'Earthquake',
                'Skeleton Spell',
                'Bat Spell',
              ]
            : oldVersion === 125
              ? [
                  'Jump',
                  'Rage',
                  'Haste',
                  'Healing',
                  'Poison',
                  'Clone',
                  'Invisibility',
                  'Recall',
                  'Lightning',
                  'Earthquake',
                ]
              : oldVersion === 124
                ? [
                    'Jump',
                    'Rage',
                    'Haste',
                    'Healing',
                    'Poison',
                    'Clone',
                    'Invisibility',
                    'Recall',
                    'Lightning',
                  ]
                : oldVersion === 123
                  ? [
                      'Jump',
                      'Rage',
                      'Haste',
                      'Healing',
                      'Poison',
                      'Clone',
                      'Invisibility',
                      'Recall',
                    ]
                  : oldVersion === 120
                    ? ['Jump', 'Rage', 'Haste', 'Healing', 'Poison', 'Clone', 'Invisibility']
                    : oldVersion === 119
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
    name: 'Ice Block',
    path: 'field-spells-native/iceblock',
    heldEffect: 'ps_spells_iceblock_Despawn',
    otherEffect: undefined,
  },
  {
    name: 'Totem Spell',
    path: 'field-spells-native/totem',
    heldEffect: 'ps_spells_meteortotem_Impact',
    otherEffect: undefined,
  },
  {
    name: 'AngrySpell',
    path: 'field-spells-native/angry',
    heldEffect: 'AngrySpell_area_top',
    otherEffect: undefined,
  },
  {
    name: 'Skeleton Spell',
    path: 'field-spells-native/skeleton',
    heldEffect: 'SkeleSpell Summon1',
    otherEffect: undefined,
  },
  {
    name: 'Bat Spell',
    path: 'field-spells-native/bat',
    heldEffect: 'BatSpell Summon1',
    otherEffect: undefined,
  },
  {
    name: 'Earthquake',
    path: 'field-spells-native/earthquake',
    heldEffect: 'EarthQuake_deploy_ground_0',
    otherEffect: undefined,
  },
  {
    name: 'Lightning',
    path: 'field-spells-native/lightning',
    heldEffect: 'Lightning Spell',
    otherEffect: undefined,
  },
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
  {
    name: 'Recall',
    path: 'field-spells-native/recall',
    heldEffect: 'RecallDeployAuraGround',
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
        if (name === 'Totem Spell') {
          scene.effect({ type: 'spell-native', text: 'TotemSummon', x: 11.5, y: 11.5, radius: 5 });
          scene.drainEffects();
        }
        return {
          ready: view.hasArt(model.battle, false),
          views: view.layer.views.size,
          rings: scene.children.list.filter(
            (o) => o.active && o.getData?.('nativeSpellFallback') === name,
          ).length,
        };
      }),
    ).toEqual({
      ready: false,
      views: 0,
      rings: name === 'Lightning' || name === 'Totem Spell' ? 2 : 1,
    });
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
        Recall: 'RecallCircleGround',
        Lightning: 'LightningSky',
        Earthquake: 'Earthquake_crackCenter',
        'Skeleton Spell': 'skele_summon_area_edge1',
        'Bat Spell': 'bat_summon_area_edge1',
        'Totem Spell': 'e_spells_meteortotem_ring',
        AngrySpell: 'e_spell_angryspell_centre_splat_next',
        'Ice Block': 'e_spells_iceblock_Surface',
      }[name],
    ]);
    if (name === 'Healing') await visible(page, ['heal_ring_effect', 'heal_ring_effect2']);
    expect(errors).toEqual([]);
  });

test('version-123 Lightning playback stays read-only and never requests the new source pack', async ({
  page,
}) => {
  const r = nativeFieldSpellRecording('Lightning'),
    requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await boot(page, r, false, 123);
  await open(page, 123);
  await seek(page, r.pulsing);
  expect(
    await page.evaluate(() => ({
      ready: window.__game.scene.fieldSpellPresentations
        .get('Lightning')
        .hasArt(window.__game.model.battle, false),
      views: window.__game.scene.fieldSpellPresentations.get('Lightning').layer.views.size,
      cast: window.__game.model.castSpell(11.5, 11.5),
    })),
  ).toEqual({ ready: false, views: 0, cast: false });
  expect(requests).not.toContain('/assets/field-spells-native/lightning/graph.json');
});

test('version-124 Earthquake playback stays read-only and never requests the durable field pack', async ({
  page,
}) => {
  const r = nativeFieldSpellRecording('Earthquake'),
    requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await boot(page, r, false, 124);
  await open(page, 124);
  await seek(page, r.steady);
  expect(
    await page.evaluate(() => ({
      ready: window.__game.scene.fieldSpellPresentations
        .get('Earthquake')
        .hasArt(window.__game.model.battle, false),
      views: window.__game.scene.fieldSpellPresentations.get('Earthquake').layer.views.size,
      cast: window.__game.model.castSpell(11.5, 11.5),
    })),
  ).toEqual({ ready: false, views: 0, cast: false });
  expect(requests).not.toContain('/assets/field-spells-native/earthquake/graph.json');
});

for (const name of ['Skeleton Spell', 'Bat Spell'] as const)
  test(`version-125 ${name} playback never requests its new source field pack`, async ({
    page,
  }) => {
    const r = nativeFieldSpellRecording(name),
      requests: string[] = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await boot(page, r, false, 125);
    await open(page, 125);
    await seek(page, r.afterLive);
    expect(
      await page.evaluate(() => ({
        ready: window.__game.scene.fieldSpellPresentations
          .get(window.__field.name)
          .hasArt(window.__game.model.battle, false),
        views: window.__game.scene.fieldSpellPresentations.get(window.__field.name).layer.views
          .size,
        cast: window.__game.model.castSpell(11.5, 11.5),
      })),
    ).toEqual({ ready: false, views: 0, cast: false });
    expect(requests).not.toContain(`/assets/field-spells-native/${r.key}/graph.json`);
  });

for (const name of ['Totem Spell', 'AngrySpell'] as const)
  test(`version-126 ${name} playback keeps its original fallback and never requests new source art`, async ({
    page,
  }) => {
    const r = nativeFieldSpellRecording(name),
      requests: string[] = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await boot(page, r, false, 126);
    await open(page, 126);
    await seek(page, r.landing);
    expect(
      await page.evaluate(() => ({
        ready: window.__game.scene.fieldSpellPresentations
          .get(window.__field.name)
          .hasArt(window.__game.model.battle, false),
        views: window.__game.scene.fieldSpellPresentations.get(window.__field.name).layer.views
          .size,
        chainReady: window.__game.scene.spellArtReady('TotemSummon'),
        cast: window.__game.model.castSpell(11.5, 11.5),
      })),
    ).toEqual({ ready: false, views: 0, chainReady: false, cast: false });
    expect(requests).not.toContain(`/assets/field-spells-native/${r.key}/graph.json`);
  });

test('version-127 Ice Block playback keeps its previous fields and never requests the new pack', async ({
  page,
}) => {
  const r = nativeFieldSpellRecording('Ice Block'),
    requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await boot(page, r, false, 127);
  await open(page, 127);
  await seek(page, r.steady);
  expect(
    await page.evaluate(() => ({
      ready: window.__game.scene.fieldSpellPresentations
        .get('Ice Block')
        .hasArt(window.__game.model.battle, false),
      views: window.__game.scene.fieldSpellPresentations.get('Ice Block').layer.views.size,
      cast: window.__game.model.castSpell(11.5, 11.5),
    })),
  ).toEqual({ ready: false, views: 0, cast: false });
  expect(requests).not.toContain('/assets/field-spells-native/iceblock/graph.json');
});

for (const { level, width } of [
  { level: 1, width: 390 },
  { level: 5, width: 1440 },
])
  test(`original Revive level ${level} uses the actual restored Hero and success audio at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const r = nativeReviveCastRecording(level),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await boot(page, r, true);
    await ready(page);
    expect(requests).toContain('/assets/field-spells-native/revive/graph.json');
    await open(page);
    for (const [at, emitters, stage] of [
      [r.bottle, ['e_spell_revive_bottledrop'], 'bottle'],
      [r.beforeHit, [], 'waiting'],
      [r.landing, ['e_spell_revive_wings', 'e_spell_revive_ground_symbol'], 'restored'],
      [r.steady, ['e_spell_revive_wings'], 'tail'],
    ] as const) {
      const result = await seek(page, at);
      expect(result).toMatchObject({ unchanged: true, gl: 0 });
      expect(result.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === at)!.battle));
      await visible(page, [...emitters]);
      if (stage === 'waiting') {
        expect(
          await page.evaluate(() =>
            window.__game.scene.children.list.some(
              (o) => o.visible && o.getData?.('nativeEffect') === 'e_spell_revive_wings',
            ),
          ),
        ).toBe(false);
        expect(
          await page.evaluate(() =>
            window.__game.scene.lastCues.some(
              (c) => c.key === `spell:${window.__field.castId}:deploy2`,
            ),
          ),
        ).toBe(false);
      }
      await page.screenshot({
        path: `output/playtest/native-revive-${stage}-${level}-${width}.png`,
      });
    }
    await seek(page, r.pulsing);
    const played = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        { capturedSpellEffectEvents } = await import('/src/game/native-spell-effects.ts'),
        source = await import('/reference/field-spells/effects.json'),
        r = window.__field,
        before = JSON.stringify(model.battle),
        key = `spell:${r.castId}:deploy2`;
      const events = capturedSpellEffectEvents(
        model.battle,
        'Revive',
        source.default.spells.Revive.levels,
        iso,
        false,
        (effect) => scene.fieldSpellPresentations.get('Revive').layer.duration(effect, Infinity),
      );
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const cue = scene.lastCues.find((c) => c.key === key),
        node = audio.samples.active.get(key);
      if (!cue || !node) throw Error('Revive activation sample missing');
      const result = {
        points: events.filter((e) => !e.key.endsWith(':preDeploy')).map((e) => e.ground),
        target: iso(r.anchor.x, r.anchor.y),
        caster: iso(r.caster.x, r.caster.y),
        at: cue.at,
        gain: node.gain.gain.value,
        rate: node.source.playbackRate.value,
        keys: scene.lastCues
          .filter((c) => c.key.startsWith(`spell:${r.castId}:`))
          .map((c) => c.key),
        unchanged: before === JSON.stringify(model.battle),
      };
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return result;
    });
    expect(played.points).toEqual([played.target, played.target]);
    expect(played.target).not.toEqual(played.caster);
    expect(played.at).toBeCloseTo(r.resolvedAt, 9);
    expect(played.gain).toBeCloseTo(0.12, 6);
    expect(played.rate).toBe(1);
    expect(played.keys).toEqual([`spell:${r.castId}:preDeploy`, `spell:${r.castId}:deploy2`]);
    expect(played.unchanged).toBe(true);
    const steady = await seek(page, r.steady);
    await seek(page, r.fieldAfter);
    expect(
      await page.evaluate(
        () => window.__game.scene.fieldSpellPresentations.get('Revive').layer.views.size,
      ),
    ).toBe(0);
    await seek(page, r.bottle);
    expect((await seek(page, r.steady)).battle).toBe(steady.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await seek(page, r.steady)).battle).toBe(steady.battle);
    expect(
      await page.evaluate(
        () => window.__game.scene.fieldSpellPresentations.get('Revive').layer.views.size,
      ),
    ).toBe(0);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(errors).toEqual([]);
  });

test('Revive success art recovers on a paused replay after its optional pack fails', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 960 });
  let release!: () => void,
    rejecting = true,
    requested = 0;
  const held = new Promise<void>((resolve) => (release = resolve)),
    r = nativeReviveCastRecording();
  await page.route('**/assets/field-spells-native/revive/graph.json', async (route) => {
    requested++;
    await held;
    if (rejecting) await route.fulfill({ status: 503, body: 'Temporary Revive field failure' });
    else await route.continue();
  });
  await boot(page, r, true);
  await expect.poll(() => requested).toBeGreaterThan(0);
  await open(page);
  const before = await seek(page, r.landing);
  expect(
    await page.evaluate(() => {
      const { model, scene } = window.__game,
        { anchor } = window.__field;
      scene.effect({ type: 'spell-native', text: 'Revive', x: anchor.x, y: anchor.y, radius: 1 });
      scene.drainEffects();
      return {
        ready: scene.fieldSpellPresentations.get('Revive').hasArt(model.battle, false),
        fallback: scene.children.list.filter(
          (o) => o.active && o.getData?.('nativeSpellFallback') === 'Revive',
        ).length,
      };
    }),
  ).toEqual({ ready: false, fallback: 1 });
  await page.evaluate(() => {
    window.__game.model.replay.paused = true;
    window.__game.scene.paused = false;
    window.__game.model.changed();
  });
  release();
  await page.waitForFunction(
    () =>
      window.__game.scene.fieldSpellPresentations
        .get('Revive')
        .layer.status('hero_revive_top_layer') === 'none',
  );
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before.battle);
  rejecting = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { scene } = window.__game;
        return (
          scene.children.list.some(
            (o) => o.visible && o.getData?.('nativeEffect') === 'e_spell_revive_wings',
          ) &&
          !scene.children.list.some(
            (o) => o.active && o.getData?.('nativeSpellFallback') === 'Revive',
          )
        );
      }),
    )
    .toBe(true);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before.battle);
});

test('version-128 Revive remains read-only and never requests new cast art', async ({ page }) => {
  const r = nativeReviveCastRecording(),
    requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await boot(page, r, false, 128);
  await open(page, 128);
  await seek(page, r.landing);
  expect(
    await page.evaluate(() => ({
      ready: window.__game.scene.fieldSpellPresentations
        .get('Revive')
        .hasArt(window.__game.model.battle, false),
      views: window.__game.scene.fieldSpellPresentations.get('Revive').layer.views.size,
      cast: window.__game.model.castReviveOnHero('queen'),
    })),
  ).toEqual({ ready: false, views: 0, cast: false });
  expect(requests).not.toContain('/assets/field-spells-native/revive/graph.json');
});
