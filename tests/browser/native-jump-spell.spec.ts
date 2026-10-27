import { expect, test, type Page } from '@playwright/test';
import { nativeJumpRecording } from '../fixtures/native-jump-spell';
async function boot(page: Page, r: ReturnType<typeof nativeJumpRecording>, at?: number) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(
    async ({ r, at }) => {
      window.__jump = r;
      const { model, scene, audio } = window.__game,
        { replayBattle } = await import('/src/game/replay.ts');
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      // A cold seek beyond the last live pulse must warm samples from retained casts alone.
      model.battle =
        at === undefined
          ? replayBattle(r.data.initial)
          : structuredClone(r.snapshots.find((s) => s.at === at).battle);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    },
    { r, at },
  );
}
async function open(page: Page, version?: number) {
  await page.evaluate(async (version) => {
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
      { model, scene } = window.__game,
      data = structuredClone(window.__jump.data);
    if (version) data.version = version;
    model.returnHome();
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Jump replay rejected');
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
      point = iso(11.5, 11.5);
    scene.cameras.main
      .setZoom(window.innerWidth < 500 ? 0.9 : 1.35)
      .centerOn(point.x, point.y - 125);
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
            { spellSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
          scene.drawOverlay(0);
          return (
            scene.jumpSpellPresentation.hasArt(model.battle, false) &&
            spellSoundFiles('Jump').every((f) => audio.samples.has(troopSample(f)))
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
for (const { level, width } of [
  { level: 1, width: 390 },
  { level: 5, width: 1440 },
])
  test(`original level-${level} Jump bottle and field survive portable seeks at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const r = nativeJumpRecording(level),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await boot(page, r, r.afterLive);
    await expect
      .poll(() => requests.includes('/assets/jump-spell-native/cast/graph.json'))
      .toBe(true);
    await ready(page);
    await open(page);
    for (const [at, names, stage] of [
      [r.bottle, ['jump_bottleDrop'], 'bottle'],
      [r.landing, [`jump_glowGreen_lvl${level}`, `jump_deploy_range_anim_lvl${level}`], 'landing'],
      [r.pulsing, [`jump_glowGreen_lvl${level}`], 'pulsing'],
    ] as const) {
      const result = await seek(page, at);
      expect(result.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === at)!.battle));
      expect(result).toMatchObject({ unchanged: true, gl: 0 });
      await visible(page, [...names]);
      await page.screenshot({
        path: `output/playtest/native-jump-${stage}-${level}-${width}.png`,
      });
    }
    const sound = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        before = JSON.stringify(model.battle);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const cue = scene.lastCues.find((c) => c.key === 'spell:1:deploy'),
        node = audio.samples.active.get('spell:1:deploy');
      if (!cue || !node) throw Error('Original Jump Web Audio missing after direct seek');
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
    expect(sound).toMatchObject({
      at: 0.8,
      pitch: 0.97,
      volume: 0.95,
      live: 1,
      unchanged: true,
      keys: ['spell:1:preDeploy', 'spell:1:deploy'],
    });
    expect(sound.rate).toBeCloseTo(0.97, 6);
    expect(sound.gain).toBeCloseTo(0.114, 6);
    const steady = await seek(page, r.steady);
    await visible(page, [`jump_glowGreen_lvl${level}`]);
    await seek(page, r.afterLive);
    expect(
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        return {
          live: model.battle.nativeSpells.length,
          captured: model.battle.nativeSpellCastHistory.length,
          views: scene.jumpSpellPresentation.layer.views.size,
        };
      }),
    ).toMatchObject({ live: 0, captured: 1 });
    expect(
      await page.evaluate(() => window.__game.scene.jumpSpellPresentation.layer.views.size),
    ).toBeGreaterThan(0);
    await page.screenshot({
      path: `output/playtest/native-jump-final-particles-${level}-${width}.png`,
    });
    await seek(page, r.fieldAfter);
    expect(
      await page.evaluate(() => window.__game.scene.jumpSpellPresentation.layer.views.size),
    ).toBe(0);
    await seek(page, r.bottle);
    expect((await seek(page, r.steady)).battle).toBe(steady.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await seek(page, r.steady)).battle).toBe(steady.battle);
    expect(
      await page.evaluate(() => window.__game.scene.jumpSpellPresentation.layer.views.size),
    ).toBe(0);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await open(page, 115);
    await seek(page, r.pulsing);
    expect(
      await page.evaluate(() => {
        const { scene, model } = window.__game;
        return {
          ready: scene.jumpSpellPresentation.hasArt(model.battle, false),
          views: scene.jumpSpellPresentation.layer.views.size,
          captured: model.battle.nativeSpellCastHistory,
        };
      }),
    ).toEqual({ ready: false, views: 0, captured: undefined });
    expect(errors).toEqual([]);
  });
test('Jump cast fallback survives held and failed downloads and hands off after reconnect', async ({
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
  await page.route('**/assets/jump-spell-native/cast/graph.json', async (route) => {
    requested++;
    await held;
    if (rejecting) await route.fulfill({ status: 503, body: 'Temporary Jump art failure' });
    else await route.continue();
  });
  const r = nativeJumpRecording(5);
  await boot(page, r);
  await expect.poll(() => requested).toBeGreaterThan(0);
  await open(page);
  const before = await seek(page, r.bottle);
  expect(
    await page.evaluate(() => {
      const { scene } = window.__game;
      scene.effect({ type: 'spell', spell: 'jump', x: 11.5, y: 11.5, radius: 3.5 });
      scene.drainEffects();
      return scene.children.list.filter(
        (o) => o.active && o.getData?.('nativeSpellFallback') === 'Jump',
      ).length;
    }),
  ).toBe(1);
  release();
  await page.waitForFunction(
    () => window.__game.scene.jumpSpellPresentation.layer.status('Jump predeploy') === 'none',
  );
  expect((await seek(page, r.bottle)).battle).toBe(before.battle);
  rejecting = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await ready(page);
  expect((await seek(page, r.bottle)).battle).toBe(before.battle);
  await visible(page, ['jump_bottleDrop']);
  expect(
    await page.evaluate(
      () =>
        window.__game.scene.children.list.filter(
          (o) => o.active && o.getData?.('nativeSpellFallback') === 'Jump',
        ).length,
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
});
