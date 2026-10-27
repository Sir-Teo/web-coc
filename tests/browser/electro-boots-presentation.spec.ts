import { expect, test, type Page } from '@playwright/test';
import { heroRegenerationRecallRecording } from '../fixtures/hero-regeneration';
import { heroAuraRevivalRecording } from '../fixtures/hero-aura-revival';

const graph = '/assets/electro-boots-native/activation/graph.json';

async function open(page: Page, data: unknown, live = false) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(
    async ({ data, live }) => {
      const { model, scene, audio } = window.__game;
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      if (live) {
        const { replayBattle } = await import('/src/game/replay.ts');
        model.state.obstacles = [];
        for (const key of ['buildings', 'army', 'spells', 'troopLevels', 'spellLevels', 'nextId'])
          model.state[key] = data.initial[key];
        model.state.king = undefined;
        model.startBattle(0, true);
        model.recording.initial = data.initial;
        model.recording.version = data.version;
        model.battle = replayBattle(data.initial, data.version);
      } else {
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
          throw Error('Electro Boots replay rejected');
      }
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    },
    { data, live },
  );
}

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const b = model.battle,
      e = b.nativeElectroBootsActivations?.at(-1),
      u = b.units.find((u) => u.hero === 'champion');
    const { iso } = await import('/src/game/scene.ts');
    const p = iso(e?.x ?? u?.x ?? 6.9, e?.y ?? u?.y ?? 11.5);
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setZoom(innerWidth < 500 ? 1.1 : 1.6).centerOn(p.x, p.y - 35);
    const before = JSON.stringify(b);
    scene.drawOverlay(0);
    return { battle: before, readOnly: before === JSON.stringify(b) };
  }, at);
}

async function ready(page: Page) {
  return page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.drawOverlay(0);
    const b = model.battle,
      e = b.nativeElectroBootsActivations?.at(-1);
    return (
      !!e &&
      scene.nativeProjectiles.coversAbilityActivation(b, e.id, false) &&
      [...scene.nativeProjectiles.layer.views].some(
        ([key, view]) =>
          key.includes(`${e.id}:activation:`) &&
          view.objects.some(
            (o) =>
              o.visible &&
              o.alpha > 0 &&
              o.getData('nativeEffect') === 'Deploy' &&
              o.texture?.key !== '__MISSING',
          ),
      )
    );
  });
}

for (const { mode, width, version } of [
  { mode: 'recall', width: 1440 },
  { mode: 'revive', width: 390 },
  { mode: 'phoenix', width: 1440 },
  { mode: 'recall', width: 390, version: 139 },
] as const)
  test(`Electro Boots original activation follows ${mode} at ${width}px, version=${version ?? 'current'}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const r =
      mode === 'recall'
        ? heroRegenerationRecallRecording('electro-boots', version)
        : heroAuraRevivalRecording('electro-boots', mode, version);
    await open(page, r.data);
    for (const s of r.snapshots) {
      const actual = await seek(page, s.at);
      expect(actual).toEqual({ battle: JSON.stringify(s.battle), readOnly: true });
    }
    const at =
      mode === 'recall'
        ? (r as ReturnType<typeof heroRegenerationRecallRecording>).afterDeploy
        : (r as ReturnType<typeof heroAuraRevivalRecording>).restored;
    const state = await seek(page, at);
    if (version === 139) {
      expect(await ready(page)).toBe(false);
      expect(
        await page.evaluate(() => window.__game.model.battle.nativeElectroBootsActivations),
      ).toBeUndefined();
    } else {
      await expect.poll(() => ready(page), { timeout: 30000 }).toBe(true);
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const { model, scene } = window.__game;
              scene.drawOverlay(0);
              const id = model.battle.nativeHeroes[0].unitId;
              return scene.children.list.some(
                (o) =>
                  o.visible &&
                  o.alpha > 0 &&
                  o.getData?.('nativeHero') === id &&
                  o.texture?.key.startsWith('baked:heroes-native/'),
              );
            }),
          { timeout: 30000 },
        )
        .toBe(true);
      await page.screenshot({ path: `output/playtest/electro-boots-${mode}-${width}.png` });
      await page.evaluate(() => window.__game.model.toggleReducedMotion());
      expect(await ready(page)).toBe(false);
      expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
        state.battle,
      );
      await page.evaluate(() => window.__game.model.toggleReducedMotion());
      await expect.poll(() => ready(page)).toBe(true);
    }
    await seek(page, r.snapshots[0].at);
    expect(await seek(page, at)).toEqual(state);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('live Electro Boots replaces deployment sparks and tone, plays the original sample and keeps camera picking aligned', async ({
  page,
}) => {
  test.setTimeout(120000);
  const r = heroRegenerationRecallRecording('electro-boots');
  await open(page, r.data, true);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const { scene, audio } = window.__game;
          scene.drawOverlay(0);
          return (
            scene.nativeProjectiles.layer.status('Ability_Electro_Boots') === 'ready' &&
            audio.samples.has('troop-ability_electro_boots.ogg')
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  const result = await page.evaluate(async () => {
    const { model, scene, audio } = window.__game;
    const generated: string[] = [],
      sparks: unknown[] = [],
      effects: unknown[] = [];
    const play = audio.play,
      spark = scene.sparks,
      onEffect = model.onEffect;
    audio.play = (name, ...args) => {
      generated.push(name);
      return play.apply(audio, [name, ...args]);
    };
    scene.sparks = (...args) => {
      sparks.push(args);
    };
    model.onEffect = (fx) => {
      effects.push(fx);
      onEffect(fx);
    };
    try {
      if (!model.deployNativeHero('champion', 6.9, 11.5))
        throw Error('Live Boots deployment failed');
      scene.deployFeedback();
      model.step(0.1);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    } finally {
      audio.play = play;
      scene.sparks = spark;
      model.onEffect = onEffect;
    }
    const b = model.battle,
      e = b.nativeElectroBootsActivations[0];
    const { iso } = await import('/src/game/scene.ts');
    scene.santaPresentation.render(b, false, true, 1, iso, scene.lastCues);
    const cue = scene.lastCues.find((c) => c.key === `${e.id}:sound`),
      node = audio.samples.active.get(cue.key);
    const before = JSON.stringify(b),
      camera = scene.cameras.main;
    scene.cameraShake.clear();
    const p = scene.screenFor(e.x, e.y),
      rect = scene.scale.canvasBounds;
    const picked = camera.getWorldPoint(
      (p.x - rect.left) * scene.scale.displayScale.x,
      (p.y - rect.top) * scene.scale.displayScale.y,
    );
    model.state.settings.reducedMotion = true;
    const still = scene.screenFor(e.x, e.y);
    model.state.settings.reducedMotion = false;
    const result = {
      generated,
      sparks,
      effects,
      activation: e,
      gain: node.gain.gain.value,
      rate: node.source.playbackRate.value,
      delta: [p.x - still.x, p.y - still.y],
      picked: [picked.x, picked.y],
      expected: [iso(e.x, e.y).x, iso(e.x, e.y).y],
      readOnly: before === JSON.stringify(b),
    };
    scene.santaPresentation.render(b, false, false, 1, iso, scene.lastCues);
    return result;
  });
  expect(result.generated).toEqual([]);
  expect(result.sparks).toEqual([]);
  expect(result.effects).toContainEqual(
    expect.objectContaining({ type: 'spawn', abilityCastId: result.activation.id }),
  );
  expect(result.gain).toBeCloseTo(0.12, 6);
  expect(result.rate).toBe(1);
  expect(Math.hypot(...result.delta)).toBeGreaterThan(0.01);
  expect(result.picked[0]).toBeCloseTo(result.expected[0], 4);
  expect(result.picked[1]).toBeCloseTo(result.expected[1], 4);
  expect(result.readOnly).toBe(true);
});

test('unavailable Electro Boots art and audio keep deployment fallback and recover during paused playback', async ({
  page,
}) => {
  test.setTimeout(120000);
  let blocked = true;
  let attempts = 0;
  for (const path of [graph, '/assets/audio/troops-native/ability_electro_boots.ogg'])
    await page.route(`**${path}*`, async (route) => {
      attempts++;
      if (blocked) await route.fulfill({ status: 503, body: 'delayed Electro Boots source' });
      else await route.continue();
    });
  const r = heroRegenerationRecallRecording('electro-boots');
  await open(page, r.data);
  await seek(page, r.afterDeploy);
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(2);
  const fallback = await page.evaluate(() => {
    const { model, scene, audio } = window.__game,
      e = model.battle.nativeElectroBootsActivations.at(-1);
    const generated: string[] = [],
      sparks: unknown[] = [],
      play = audio.play,
      spark = scene.sparks;
    audio.play = (name) => {
      generated.push(name);
    };
    scene.sparks = (...args) => {
      sparks.push(args);
    };
    try {
      scene.renderEffect({ type: 'spawn', x: e.x, y: e.y, abilityCastId: e.id });
      scene.deployFeedback();
    } finally {
      audio.play = play;
      scene.sparks = spark;
    }
    model.replay.paused = true;
    scene.paused = false;
    return { generated, sparks: sparks.length, battle: JSON.stringify(model.battle) };
  });
  expect(fallback.generated).toEqual(['deploy']);
  expect(fallback.sparks).toBe(1);
  blocked = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const { model, scene, audio } = window.__game,
            e = model.battle.nativeElectroBootsActivations.at(-1);
          return (
            scene.nativeProjectiles.coversAbilityActivation(model.battle, e.id, false) &&
            audio.samples.has('troop-ability_electro_boots.ogg') &&
            [...scene.nativeProjectiles.layer.views].some(
              ([key, view]) =>
                key.includes(`${e.id}:activation:`) &&
                view.objects.some((o) => o.visible && o.alpha > 0),
            )
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
    fallback.battle,
  );
  expect(await page.evaluate(() => window.__game.audio.samples.active.size)).toBe(0);
});
