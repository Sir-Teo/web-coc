import { expect, test, type Page } from '@playwright/test';
import {
  nativeFireballRecording,
  nativeWinningFireballRecording,
} from '../fixtures/native-fireball';
import type { ReplayData } from '../../src/game/replay';

async function bootLive(page: Page, data: ReplayData) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene } = window.__game;
    const { replayBattle } = await import('/src/game/replay.ts');
    scene.paused = true;
    model.state.obstacles = [];
    model.state.buildings = data.initial.buildings;
    model.state.army = data.initial.army;
    model.state.spells = data.initial.spells;
    model.state.troopLevels = data.initial.troopLevels;
    model.state.spellLevels = data.initial.spellLevels;
    model.state.king = undefined;
    model.state.nextId = data.initial.nextId;
    model.startBattle(0, true);
    model.recording.initial = data.initial;
    model.battle = replayBattle(data.initial, data.version);
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
  }, data);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = window.__game.scene;
          scene.drawOverlay(0);
          return scene.nativeProjectiles.layer.status('ps_chr_gw_fireballl_explosion_lvl1');
        }),
      { timeout: 30000 },
    )
    .toBe('ready');
}

async function fire(page: Page, until: number | 'finish') {
  return page.evaluate(async (until) => {
    const { model, scene } = window.__game;
    if (!model.deployNativeHero('warden', 6.9, 11.5)) throw Error('Live Warden failed');
    while (model.battle.elapsed < 0.1 - 1e-9) model.step(0.05);
    if (!model.activateNativeHeroAbility('warden')) throw Error('Live Fireball failed');
    for (
      let n = 0;
      n < 100 &&
      !model.battle.finished &&
      (until === 'finish' || model.battle.elapsed < until - 1e-9);
      n++
    )
      model.step(0.05);
    model.changed();
    scene.sync();
    scene.setZoom(1);
    const { iso } = await import('/src/game/scene.ts');
    const p = iso(21.5, 11.5);
    scene.cameras.main.useBounds = false;
    scene.cameras.main.centerOn(p.x, p.y - 50);
    scene.cameraShake.clear();
    scene.drawOverlay(0);
    return JSON.stringify(model.battle);
  }, until);
}

async function sample(page: Page) {
  return page.evaluate(async () => {
    const { model, scene } = window.__game;
    const { iso } = await import('/src/game/scene.ts');
    scene.cameraShake.clear();
    const before = JSON.stringify(model.battle);
    const camera = scene.cameras.main;
    const p = scene.screenFor(21.5, 11.5);
    const rect = scene.scale.canvasBounds;
    const roundtrip = camera.getWorldPoint(
      (p.x - rect.left) * scene.scale.displayScale.x,
      (p.y - rect.top) * scene.scale.displayScale.y,
    );
    model.state.settings.reducedMotion = true;
    const still = scene.screenFor(21.5, 11.5);
    model.state.settings.reducedMotion = false;
    return {
      delta: [p.x - still.x, p.y - still.y],
      roundtrip: [roundtrip.x, roundtrip.y],
      expected: [iso(21.5, 11.5).x, iso(21.5, 11.5).y],
      zoom: scene.viewZoom,
      unchanged: before === JSON.stringify(model.battle),
      elapsed: model.battle.elapsed,
    };
  });
}

for (const width of [1440, 390])
  test(`Fireball source shake freezes with live pause, keeps picking aligned and stays off in replays at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = nativeFireballRecording();
    await bootLive(page, r.data);
    expect(await fire(page, r.explosion)).toBe(
      JSON.stringify(r.snapshots.find((s) => s.at === r.explosion)!.battle),
    );
    const first = await sample(page);
    expect(Math.hypot(...first.delta)).toBeGreaterThan(0.1);
    expect(first.roundtrip[0]).toBeCloseTo(first.expected[0], 4);
    expect(first.roundtrip[1]).toBeCloseTo(first.expected[1], 4);
    expect(first.unchanged).toBe(true);
    await page.waitForTimeout(200);
    expect(await sample(page)).toEqual(first);
    await page.evaluate(() => {
      const scene = window.__game.scene;
      scene.setZoom(scene.viewZoom * 1.3);
    });
    const zoomed = await sample(page);
    expect(zoomed.delta[0] / first.delta[0]).toBeCloseTo(zoomed.zoom / first.zoom, 3);
    expect(zoomed.delta[1] / first.delta[1]).toBeCloseTo(zoomed.zoom / first.zoom, 3);
    const replay = await page.evaluate(async (r) => {
      const { model, scene } = window.__game;
      model.finishBattle();
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Replay rejected');
      model.seekReplay(r.explosion);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
      return JSON.stringify(model.battle);
    }, r);
    expect(replay).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.explosion)!.battle));
    expect((await sample(page)).delta).toEqual([0, 0]);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  });

test('a finishing Fireball keeps its original explosion and fading shake while the battle stays finished', async ({
  page,
}) => {
  test.setTimeout(120000);
  const r = nativeWinningFireballRecording();
  await bootLive(page, r.data);
  // Software rendering can spend most of the short impulse building its first explosion view.
  // Drive presentation time explicitly so the source's 800 ms window is sampled exactly.
  const start = new Date('2026-10-27T12:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
  expect(await fire(page, 'finish')).toBe(JSON.stringify(r.battle));
  await page.clock.fastForward(100);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__game.scene;
        scene.drawOverlay(0);
        return [...scene.nativeProjectiles.layer.views].some(
          ([key, view]) =>
            key.includes(':fireball:explosion:') &&
            view.objects.some(
              (object) => object.visible && object.alpha > 0 && object.texture?.key !== '__MISSING',
            ),
        );
      }),
    )
    .toBe(true);
  expect(Math.hypot(...(await sample(page)).delta)).toBeGreaterThan(0.01);
  await page.screenshot({ path: 'output/playtest/fireball-winning-explosion.png' });
  await page.clock.fastForward(850);
  expect((await sample(page)).delta).toEqual([0, 0]);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
    JSON.stringify(r.battle),
  );
  const settled = await page.evaluate(async (r) => {
    const { model, scene } = window.__game;
    const { settlePresentation } = await import('/src/game/presentation-clock.ts');
    settlePresentation(model.battle);
    scene.drawOverlay(0);
    const retired = scene.nativeProjectiles.layer.views.size === 0;
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
      throw Error('Winning replay rejected');
    model.seekReplay(9999);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
    return {
      retired,
      cold: scene.nativeProjectiles.layer.views.size,
      battle: JSON.stringify(model.battle),
    };
  }, r);
  expect(settled).toEqual({ retired: true, cold: 0, battle: JSON.stringify(r.battle) });
});
