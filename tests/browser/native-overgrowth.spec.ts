import { expect, test, type Page } from '@playwright/test';
import { nativeOvergrowthRecording } from '../fixtures/native-overgrowth';
async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__overgrowth;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts'),
      point = iso(r.anchor.x, r.anchor.y);
    scene.cameras.main
      .setZoom(window.innerWidth < 500 ? 0.75 : 1.1)
      .centerOn(point.x, point.y - 125);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return {
      battle: before,
      covered: [2, 3, 4].map((id) => scene.overgrowthPresentation.covers(id)),
      fallback: scene.detail.commandBuffer.includes(0x3f9f45),
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}
async function boot(page: Page, r: ReturnType<typeof nativeOvergrowthRecording>) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (r) => {
    window.__overgrowth = r;
    const { model, scene, audio } = window.__game,
      { replayBattle } = await import('/src/game/replay.ts');
    scene.paused = true;
    audio.enabled = true;
    audio.unlock();
    await audio.context.resume();
    model.battle = replayBattle(r.data.initial);
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
  }, r);
}
async function open(page: Page) {
  await page.evaluate(async () => {
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
      { model, scene } = window.__game;
    model.returnHome();
    if (
      !model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(window.__overgrowth.data))))
    )
      throw Error('Overgrowth replay rejected');
    scene.sync();
  });
}
async function visible(page: Page, stage: string) {
  await page.waitForFunction((stage) => {
    const { scene } = window.__game;
    scene.drawOverlay(0);
    return [2, 3, 4].every((size) =>
      scene.children.list.some(
        (o) =>
          o.getData?.('nativeEffect') === `entangle_root_${stage}${size}x${size}` &&
          o.visible &&
          o.alpha > 0,
      ),
    );
  }, stage);
}
for (const { level, width } of [
  { level: 1, width: 390 },
  { level: 5, width: 1440 },
])
  test(`original level-${level} Overgrowth roots grow, persist and retract at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = nativeOvergrowthRecording(level),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await page.setViewportSize({ width, height: 960 });
    await boot(page, r);
    for (const size of [2, 3, 4])
      await expect
        .poll(() => requests.includes(`/assets/overgrowth-native/${size}x${size}/graph.json`))
        .toBe(true);
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const { model, scene, audio } = window.__game,
              { spellSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
            return (
              model.battle.units.length === 0 &&
              !scene.battleArtPending() &&
              spellSoundFiles('Overgrowth').every((f) => audio.samples.has(troopSample(f))) &&
              scene.overgrowthPresentation.hasCastArt(model.battle, false) &&
              [2, 3, 4].every(
                (s) =>
                  scene.overgrowthPresentation.layer.status(`entangle_spell_start_${s}x${s}`) ===
                  'ready',
              )
            );
          }),
        { timeout: 30_000 },
      )
      .toBe(true);
    await open(page);
    expect((await seek(page, r.bottle)).battle).toBe(
      JSON.stringify(r.snapshots.find((s) => s.at === r.bottle)!.battle),
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__game.scene.children.list.some(
            (o) => o.getData?.('nativeEffect') === 'jump_bottleDrop' && o.visible && o.alpha > 0,
          ),
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/native-overgrowth-bottle-${level}-${width}.png`,
    });
    await seek(page, r.landing);
    await expect
      .poll(() =>
        page.evaluate((level) => {
          const objects = window.__game.scene.children.list;
          return ['entangle_deploy_circle', `entangle_ground_circle_radius_lvl${level}`].every(
            (name) =>
              objects.some((o) => o.getData?.('nativeEffect') === name && o.visible && o.alpha > 0),
          );
        }, level),
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/native-overgrowth-landing-${level}-${width}.png`,
    });
    expect(await seek(page, r.falling)).toMatchObject({
      covered: [false, false, false],
      unchanged: true,
      gl: 0,
    });
    const growing = await seek(page, r.growing);
    expect(growing).toMatchObject({
      covered: [true, true, true],
      fallback: false,
      unchanged: true,
      gl: 0,
    });
    await visible(page, '');
    const castSound = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        before = JSON.stringify(model.battle);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const cue = scene.lastCues.find((c) => c.key === 'spell:1:deploy2'),
        node = audio.samples.active.get('spell:1:deploy2');
      if (!cue || !node) throw Error('Original field sound missing after direct seek beyond pulse');
      const result = {
        at: cue.at,
        pitch: cue.pitch,
        volume: cue.volume,
        rate: node.source.playbackRate.value,
        gain: node.gain.gain.value,
        live: model.battle.nativeSpells.length,
        unchanged: before === JSON.stringify(model.battle),
        keys: scene.lastCues.filter((c) => c.key.startsWith('spell:1:')).map((c) => c.key),
      };
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return result;
    });
    expect(castSound).toMatchObject({
      at: 0.8,
      volume: 0.8,
      live: 0,
      unchanged: true,
      keys: ['spell:1:preDeploy', 'spell:1:deploy2'],
    });
    expect(castSound.rate).toBeCloseTo(castSound.pitch, 6);
    expect(castSound.gain).toBeCloseTo(0.096, 6);
    await page.screenshot({
      path: `output/playtest/native-overgrowth-growing-${level}-${width}.png`,
    });
    const steady = await seek(page, r.steady);
    expect(steady.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.steady)!.battle));
    expect(steady).toMatchObject({
      covered: [true, true, true],
      fallback: false,
      unchanged: true,
      gl: 0,
    });
    await visible(page, 'deployed_');
    await page.screenshot({
      path: `output/playtest/native-overgrowth-deployed-${level}-${width}.png`,
    });
    expect(await seek(page, r.expiring)).toMatchObject({
      covered: [false, false, false],
      fallback: false,
      unchanged: true,
      gl: 0,
    });
    await visible(page, 'stop_');
    const sound = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        before = JSON.stringify(model.battle);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const nodes = window.__overgrowth.roots.map((root) => {
        const key = `${root.key}:stop`,
          cue = scene.lastCues.find((c) => c.key === key),
          node = audio.samples.active.get(key);
        if (!cue || !node) throw Error('Original retract Web Audio missing');
        return {
          at: cue.at,
          pitch: cue.pitch,
          rate: node.source.playbackRate.value,
          volume: cue.volume,
          gain: node.gain.gain.value,
        };
      });
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return { nodes, unchanged: before === JSON.stringify(model.battle) };
    });
    expect(sound.unchanged).toBe(true);
    for (const node of sound.nodes) {
      expect(node.at).toBe(r.until);
      expect(node.volume).toBe(0.8);
      expect(node.rate).toBeCloseTo(node.pitch, 6);
      expect(node.gain).toBeCloseTo(0.096, 6);
    }
    const retracting = await seek(page, r.retracting);
    expect(retracting).toMatchObject({
      covered: [false, false, false],
      fallback: false,
      unchanged: true,
      gl: 0,
    });
    await visible(page, 'stop_');
    await page.screenshot({
      path: `output/playtest/native-overgrowth-retracting-${level}-${width}.png`,
    });
    expect(await seek(page, r.after)).toMatchObject({
      covered: [false, false, false],
      fallback: false,
      unchanged: true,
      gl: 0,
    });
    await seek(page, r.fieldAfter);
    expect(
      await page.evaluate(() =>
        window.__game.scene.children.list.some(
          (o) =>
            /^entangle_ground_(smoke|circle)_radius_/.test(String(o.getData?.('nativeEffect'))) &&
            o.visible &&
            o.alpha > 0,
        ),
      ),
    ).toBe(false);
    await seek(page, r.growing);
    expect((await seek(page, r.steady)).battle).toBe(steady.battle);
    expect((await seek(page, r.retracting)).battle).toBe(retracting.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await seek(page, r.growing)).battle).toBe(growing.battle);
    await visible(page, 'deployed_');
    expect(
      await page.evaluate(() =>
        window.__game.scene.children.list.some(
          (o) =>
            /^entangle_ground_(smoke|circle)_radius_/.test(String(o.getData?.('nativeEffect'))) &&
            o.visible &&
            o.alpha > 0,
        ),
      ),
    ).toBe(false);
    await page.evaluate(async () => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
        { model, scene } = window.__game,
        data = structuredClone(window.__overgrowth.data);
      data.version = 112;
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Old root replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.steady)).toMatchObject({
      covered: [false, false, false],
      fallback: true,
      unchanged: true,
      gl: 0,
    });
    expect(errors).toEqual([]);
  });
test('root loading keeps the status fallback and hands off to original meshes without changing combat', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 960 });
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/overgrowth-native/**/graph.json', async (route) => {
    await held;
    await route.continue();
  });
  const r = nativeOvergrowthRecording();
  await boot(page, r);
  await open(page);
  const fallback = await seek(page, r.steady);
  expect(fallback).toMatchObject({
    covered: [false, false, false],
    fallback: true,
    unchanged: true,
    gl: 0,
  });
  release();
  await page.waitForFunction(() => {
    const { scene } = window.__game;
    scene.drawOverlay(0);
    return [2, 3, 4].every((id) => scene.overgrowthPresentation.covers(id));
  });
  await visible(page, 'deployed_');
  const loaded = await seek(page, r.steady);
  expect(loaded.battle).toBe(fallback.battle);
  expect(loaded).toMatchObject({
    covered: [true, true, true],
    fallback: false,
    unchanged: true,
    gl: 0,
  });
});
test('a failed root pack preserves its fallback and recovers after reconnecting', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 960 });
  let rejecting = true,
    rejected = 0;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/assets/overgrowth-native/3x3/graph.json', async (route) => {
    if (rejecting) {
      rejected++;
      await route.fulfill({ status: 503, body: 'Temporary root art failure' });
    } else await route.continue();
  });
  const r = nativeOvergrowthRecording();
  await boot(page, r);
  await expect.poll(() => rejected).toBeGreaterThan(0);
  await open(page);
  await seek(page, r.steady);
  await page.waitForFunction(() => {
    const { scene } = window.__game;
    scene.drawOverlay(0);
    return scene.overgrowthPresentation.covers(2) && scene.overgrowthPresentation.covers(4);
  });
  const fallback = await seek(page, r.steady);
  expect(fallback).toMatchObject({
    covered: [true, false, true],
    fallback: true,
    unchanged: true,
    gl: 0,
  });
  rejecting = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => {
    const { scene } = window.__game;
    scene.drawOverlay(0);
    return [2, 3, 4].every((id) => scene.overgrowthPresentation.covers(id));
  });
  const recovered = await seek(page, r.steady);
  expect(recovered.battle).toBe(fallback.battle);
  expect(recovered).toMatchObject({
    covered: [true, true, true],
    fallback: false,
    unchanged: true,
    gl: 0,
  });
  expect(errors).toEqual([]);
});

test('cast art keeps a fallback during loading and failure, then recovers at the same replay time', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 960 });
  let release!: () => void,
    rejecting = true,
    requested = 0;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/overgrowth-native/cast/graph.json', async (route) => {
    requested++;
    await held;
    if (rejecting) await route.fulfill({ status: 503, body: 'Temporary cast art failure' });
    else await route.continue();
  });
  const r = nativeOvergrowthRecording(5),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page, r);
  await expect.poll(() => requested).toBeGreaterThan(0);
  await open(page);
  const before = await seek(page, r.bottle);
  const fallback = await page.evaluate(() => {
    const { scene, model } = window.__game;
    scene.effect({ type: 'spell', spell: 'overgrowth', x: 16, y: 11, radius: 6 });
    scene.drainEffects();
    return {
      ready: scene.overgrowthPresentation.hasCastArt(model.battle, false),
      rings: scene.children.list.filter((o) => o.active && o.getData?.('overgrowthFallback'))
        .length,
    };
  });
  expect(fallback).toEqual({ ready: false, rings: 1 });
  release();
  await page.waitForFunction(
    () => window.__game.scene.overgrowthPresentation.layer.status('Entangle_predeploy') === 'none',
  );
  expect((await seek(page, r.bottle)).battle).toBe(before.battle);
  rejecting = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => {
    const { model, scene } = window.__game;
    scene.drawOverlay(0);
    return scene.overgrowthPresentation.hasCastArt(model.battle, false);
  });
  expect((await seek(page, r.bottle)).battle).toBe(before.battle);
  expect(
    await page.evaluate(
      () =>
        window.__game.scene.children.list.filter(
          (o) => o.active && o.getData?.('overgrowthFallback'),
        ).length,
    ),
  ).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__game.scene.children.list.some(
          (o) => o.getData?.('nativeEffect') === 'jump_bottleDrop' && o.visible && o.alpha > 0,
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
      { model, scene } = window.__game,
      data = structuredClone(window.__overgrowth.data);
    data.version = 113;
    model.returnHome();
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('113 replay rejected');
    scene.sync();
  });
  expect(await seek(page, r.growing)).toMatchObject({
    covered: [true, true, true],
    unchanged: true,
    gl: 0,
  });
  expect(
    await page.evaluate(() => {
      const { scene, model } = window.__game;
      return {
        cast: scene.overgrowthPresentation.hasCastArt(model.battle, false),
        field: scene.children.list.some(
          (o) =>
            /^entangle_ground_(smoke|circle)_radius_/.test(String(o.getData?.('nativeEffect'))) &&
            o.visible &&
            o.alpha > 0,
        ),
      };
    }),
  ).toEqual({ cast: false, field: false });
  expect(errors).toEqual([]);
});
