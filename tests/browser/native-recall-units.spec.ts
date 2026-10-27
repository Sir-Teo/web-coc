import { expect, test, type Page } from '@playwright/test';
import { nativeRecallUnitRecording } from '../fixtures/native-recall-unit';
async function boot(
  page: Page,
  r: ReturnType<typeof nativeRecallUnitRecording>,
  late = false,
  version = r.data.version,
) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(
    async ({ r, late, version }) => {
      window.__recall = r;
      const { model, scene, audio } = window.__game,
        { replayBattle } = await import('/src/game/replay.ts');
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      model.battle = late
        ? structuredClone(r.snapshots.find((s) => s.at === r.returning).battle)
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
      data = structuredClone(window.__recall.data);
    if (version) data.version = version;
    model.returnHome();
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Recall replay rejected');
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
      r = window.__recall,
      snapshot = model.battle.nativeRecallEvents?.at(-1),
      p = iso(snapshot?.x ?? 5, snapshot?.y ?? 15);
    scene.cameras.main.setZoom(window.innerWidth < 500 ? 0.9 : 1.35).centerOn(p.x, p.y - 100);
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
            { troopSample } = await import('/src/game/troop-sounds.ts');
          scene.drawOverlay(0);
          return (
            scene.recallPresentation.hasArt(model.battle, false) &&
            audio.samples.has(troopSample('sfx/recall_spell_back_01.ogg'))
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
}
async function visible(page: Page, emitters: string[], draw = true) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ emitters, draw }) => {
          const { scene } = window.__game;
          if (draw) scene.drawOverlay(0);
          return emitters.every((name) =>
            scene.children.list.some(
              (o) => o.getData?.('nativeEffect') === name && o.visible && o.alpha > 0,
            ),
          );
        },
        { emitters, draw },
      ),
    )
    .toBe(true);
}
for (const { width, delay } of [
  { width: 390, delay: 0 },
  { width: 1440, delay: 11 },
])
  test(`Recall unit effects and original return audio survive portable seeks at ${width}px after ${delay}s waiting`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const r = nativeRecallUnitRecording(delay),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => requests.push(new URL(r.url()).pathname));
    await boot(page, r, true);
    await ready(page);
    expect(requests).toContain('/assets/recall-native/units/graph.json');
    expect(requests).toContain('/assets/audio/troops-native/recall_spell_back_01.ogg');
    if (delay)
      expect(await page.evaluate(() => window.__game.model.battle.nativeSpellCastHistory)).toEqual(
        [],
      );
    await open(page);
    for (const [at, names, stage] of [
      [r.wave, ['recall_unit_wave'], 'wave'],
      [
        r.returning,
        ['RecallCircleReverseGround', 'RecallCircleTwirlReverse', 'RecallSpellSparksRedeploy'],
        'returning',
      ],
    ] as const) {
      const result = await seek(page, at);
      expect(result.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === at)!.battle));
      expect(result).toMatchObject({ unchanged: true, gl: 0 });
      await visible(page, [...names]);
      await page.screenshot({ path: `output/playtest/native-recall-unit-${stage}-${width}.png` });
    }
    const sound = await page.evaluate(async () => {
      const { model, scene, audio } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        before = JSON.stringify(model.battle);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const event = model.battle.nativeRecallEvents.find((e) => e.phase === 'redeploy'),
        key = `${event.key}:sound`,
        node = audio.samples.active.get(key),
        cue = scene.lastCues.find((c) => c.key === key);
      if (!node || !cue) throw Error('Original Recall return Web Audio missing');
      const result = {
        volume: cue.volume,
        pitch: cue.pitch,
        gain: node.gain.gain.value,
        rate: node.source.playbackRate.value,
        keys: scene.lastCues.filter((c) => c.key.startsWith('recall:')).map((c) => c.key),
        unchanged: before === JSON.stringify(model.battle),
      };
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return result;
    });
    expect(sound).toMatchObject({ volume: 1, pitch: 1, rate: 1, unchanged: true });
    expect(sound.gain).toBeCloseTo(0.12, 6);
    expect(sound.keys).toHaveLength(1);
    const steady = await seek(page, r.steady);
    await seek(page, r.retired);
    expect(await page.evaluate(() => window.__game.scene.recallPresentation.layer.views.size)).toBe(
      0,
    );
    await seek(page, r.wave);
    expect((await seek(page, r.steady)).battle).toBe(steady.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await seek(page, r.returning);
    expect(await page.evaluate(() => window.__game.scene.recallPresentation.layer.views.size)).toBe(
      0,
    );
    expect(errors).toEqual([]);
  });
test('version-121 Recall keeps its prior presentation and never requests unit effects or return audio', async ({
  page,
}) => {
  const r = nativeRecallUnitRecording(),
    requests: string[] = [];
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await boot(page, r, false, 121);
  await open(page, 121);
  await seek(page, r.returning);
  expect(
    await page.evaluate(() => ({
      flag: window.__game.model.battle.nativeRecallPresentation,
      events: window.__game.model.battle.nativeRecallEvents,
      views: window.__game.scene.recallPresentation.layer.views.size,
    })),
  ).toEqual({ flag: undefined, events: undefined, views: 0 });
  expect(requests).not.toContain('/assets/recall-native/units/graph.json');
  expect(requests).not.toContain('/assets/audio/troops-native/recall_spell_back_01.ogg');
});
test('Recall unit history recovers its original wave while paused after a held and failed pack', async ({
  page,
}) => {
  test.setTimeout(120000);
  let release!: () => void,
    rejecting = true,
    requested = 0;
  const held = new Promise<void>((resolve) => (release = resolve)),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/assets/recall-native/units/graph.json', async (route) => {
    requested++;
    await held;
    if (rejecting) await route.fulfill({ status: 503, body: 'Temporary Recall art failure' });
    else await route.continue();
  });
  const r = nativeRecallUnitRecording();
  await boot(page, r);
  await expect.poll(() => requested).toBeGreaterThan(0);
  await open(page);
  const before = await seek(page, r.wave);
  expect(await page.evaluate(() => window.__game.scene.recallPresentation.layer.views.size)).toBe(
    0,
  );
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.replay.paused = true;
    scene.paused = false;
    model.changed();
  });
  release();
  await page.waitForFunction(
    () => window.__game.scene.recallPresentation.layer.status('Recall Disappear') === 'none',
  );
  rejecting = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() =>
    window.__game.scene.recallPresentation.hasArt(window.__game.model.battle, false),
  );
  await visible(page, ['recall_unit_wave'], false);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before.battle);
  expect(errors).toEqual([]);
});
