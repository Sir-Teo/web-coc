import { expect, test, type Page } from '@playwright/test';
import { nativeSpikyBallRecording } from '../fixtures/native-spiky-ball';

async function open(page: Page, level = 1, recall = false, version?: number) {
  const r = nativeSpikyBallRecording(level, recall, version);
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (r) => {
    window.__spikyBall = r;
    const { model, scene } = window.__game;
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
      throw Error('Spiky Ball replay rejected');
    scene.sync();
  }, r);
  return r;
}

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts');
    const cast = model.battle.nativeSpikyBallCasts?.[0];
    const shot =
      cast?.shots.find((shot) => shot.impact > model.battle.elapsed) ?? cast?.shots.at(-1);
    const t = shot
      ? Math.max(0, Math.min(1, (at - shot.launched) / (shot.impact - shot.launched)))
      : 0;
    const point = shot
      ? iso(shot.fromX + (shot.x - shot.fromX) * t, shot.fromY + (shot.y - shot.fromY) * t)
      : iso(15, 12);
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setZoom(innerWidth < 500 ? 1 : 1.35).centerOn(point.x, point.y - 50);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return { battle: before, unchanged: before === JSON.stringify(model.battle) };
  }, at);
}

async function body(page: Page, redraw = true) {
  return page.evaluate((redraw) => {
    const { model, scene } = window.__game;
    if (redraw) scene.drawOverlay(0);
    const cast = model.battle.nativeSpikyBallCasts?.[0];
    return !!cast?.shots.some((shot) =>
      scene.nativeProjectiles.views
        .get(shot.id)
        ?.view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING'),
    );
  }, redraw);
}

for (const { level, count, width } of [
  { level: 1, count: 2, width: 1440 },
  { level: 27, count: 8, width: 390 },
])
  test(`original Spiky Ball ${level} hits ${count} distinct targets at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const requests: string[] = [],
      errors: string[] = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    page.on('pageerror', (error) => errors.push(error.message));
    const r = await open(page, level);
    await expect
      .poll(() => requests)
      .toEqual(
        expect.arrayContaining([
          '/assets/projectiles-native/barbariankinggearfootball/graph.json',
          '/assets/effects-native/air-defense-barrel-hit/graph.json',
          '/assets/effects-native/emitter-thrower-projectile-trail/graph.json',
        ]),
      );
    const flight = await seek(page, r.flight);
    expect(flight).toEqual({
      battle: JSON.stringify(r.snapshots.find((s) => s.at === r.flight)!.battle),
      unchanged: true,
    });
    await expect.poll(() => body(page), { timeout: 30000 }).toBe(true);
    await page.screenshot({ path: `output/playtest/spiky-ball-flight-${level}-${width}.png` });
    const bounce = await seek(page, r.bounce);
    expect(bounce.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.bounce)!.battle));
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const shots = model.battle.nativeSpikyBallCasts[0].shots;
            const keys = [...scene.nativeProjectiles.layer.views.keys()];
            return (
              keys.some((key) => key.includes(`${shots[1].id}:bounce:`)) &&
              !keys.some((key) => key.includes(`${shots[0].id}:hit:`))
            );
          }),
        { timeout: 30000 },
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const scene = window.__game.scene;
          return scene.children.list.some(
            (o) =>
              o.getData?.('nativeEffect') === 'football_shoot_trail' && o.visible && o.alpha > 0,
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/spiky-ball-bounce-${level}-${width}.png` });
    const landed = await seek(page, r.landed);
    expect(landed.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.landed)!.battle));
    expect(
      await page.evaluate(() => window.__game.model.battle.nativeSpikyBallCasts[0].shots.length),
    ).toBe(count);
    expect(await seek(page, r.flight)).toEqual(flight);
    await expect.poll(() => body(page)).toBe(true);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await body(page)).toBe(false);
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      flight.battle,
    );
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await expect.poll(() => body(page)).toBe(true);
    await seek(page, r.after);
    expect(await body(page)).toBe(false);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('the original ball keeps ricocheting after the recorded King is Recalled', async ({
  page,
}) => {
  const r = await open(page, 27, true);
  const later = await seek(page, r.later);
  expect(later.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.later)!.battle));
  expect(
    await page.evaluate(
      (id) => window.__game.model.battle.units.some((unit) => unit.id === id),
      r.kingId,
    ),
  ).toBe(false);
  await expect.poll(() => body(page), { timeout: 30000 }).toBe(true);
  await seek(page, r.landed);
  expect(
    await page.evaluate(() => window.__game.model.battle.nativeSpikyBallCasts[0].shots.length),
  ).toBe(8);
});

test('version 133 keeps its previous Spiky Ball activation without ricochets', async ({ page }) => {
  const r = await open(page, 27, false, 133);
  await seek(page, r.bounce);
  expect(
    await page.evaluate(() => ({
      enabled: !!window.__game.model.battle.nativeSpikyBall,
      casts: window.__game.model.battle.nativeSpikyBallCasts?.length ?? 0,
    })),
  ).toEqual({ enabled: false, casts: 0 });
  expect(await body(page)).toBe(false);
});

test('a failed original ball pack recovers while playback remains paused', async ({ page }) => {
  test.setTimeout(120000);
  let blocked = true,
    attempts = 0;
  await page.route(
    '**/assets/projectiles-native/barbariankinggearfootball/graph.json*',
    async (route) => {
      attempts++;
      if (blocked) await route.fulfill({ status: 503, body: 'temporarily missing ball' });
      else await route.continue();
    },
  );
  const r = await open(page);
  await seek(page, r.flight);
  await expect.poll(() => attempts).toBeGreaterThan(0);
  expect(await body(page)).toBe(false);
  const before = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.replay.paused = true;
    scene.paused = false;
    return JSON.stringify(model.battle);
  });
  blocked = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect.poll(() => body(page, false), { timeout: 30000 }).toBe(true);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before);
});

test('Spiky Ball plays one original contact sample without borrowing the ordinary King hit', async ({
  page,
}) => {
  test.setTimeout(120000);
  const r = await open(page, 3);
  await page.evaluate(async () => {
    const { audio } = window.__game;
    audio.enabled = true;
    audio.unlock();
    await audio.context.resume();
  });
  const state = await seek(page, 0.65);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { audio, scene } = window.__game;
          const { effectSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
          scene.drawOverlay(0);
          return effectSoundFiles('Air Defense Barrel Hit').every((name) =>
            audio.samples.has(troopSample(name)),
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  const result = await page.evaluate(async () => {
    const { model, scene, audio } = window.__game;
    const { iso } = await import('/src/game/scene.ts');
    const { projectileEffect } = await import('/src/game/projectiles.ts');
    scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
    const shot = model.battle.nativeSpikyBallCasts[0].shots[0],
      key = `${shot.id}:spiky:sound`;
    const cue = scene.lastCues.find((cue) => cue.key === key),
      node = audio.samples.active.get(key);
    const attacks = [],
      attack = scene.battleSounds.attack;
    scene.battleSounds.attack = (...args) => attacks.push(args);
    scene.renderEffect(projectileEffect(shot, 'impact'));
    scene.battleSounds.attack = attack;
    const result = {
      at: cue.at,
      pitch: cue.pitch,
      gain: node.gain.gain.value,
      rate: node.source.playbackRate.value,
      attacks: attacks.length,
      battle: JSON.stringify(model.battle),
    };
    scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
    return result;
  });
  expect(result.at).toBe(r.shots[0].impact);
  expect(result.pitch).toBeGreaterThanOrEqual(0.95);
  expect(result.pitch).toBeLessThanOrEqual(1.05);
  expect(result.rate).toBeCloseTo(result.pitch, 6);
  expect(result.gain).toBeCloseTo(0.096, 6);
  expect(result.attacks).toBe(0);
  expect(result.battle).toBe(state.battle);
});
