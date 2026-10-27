import { expect, test, type Page } from '@playwright/test';
import {
  automaticSeekingShieldRecording,
  nativeSeekingShieldRecording,
} from '../fixtures/native-seeking-shield';

async function open(page: Page, level = 1, recall = false, version?: number) {
  const r = nativeSeekingShieldRecording(level, recall, version);
  return boot(page, r);
}

async function boot<T extends { data: unknown }>(page: Page, r: T) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (r) => {
    window.__seekingShield = r;
    const { model, scene } = window.__game;
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
      throw Error('Seeking Shield replay rejected');
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
    const cast = model.battle.nativeSeekingShieldCasts?.[0];
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
    const cast = model.battle.nativeSeekingShieldCasts?.[0];
    return !!cast?.shots.some((shot) =>
      scene.nativeProjectiles.views
        .get(shot.id)
        ?.view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING'),
    );
  }, redraw);
}

for (const { level, count, width } of [
  { level: 1, count: 4, width: 1440 },
  { level: 18, count: 4, width: 390 },
])
  test(`original Seeking Shield ${level} hits ${count} distinct targets at ${width}px`, async ({
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
          '/assets/projectiles-native/amazonqueen-shield/graph.json',
          '/assets/effects-native/trollboulder-destroyed/graph.json',
          '/assets/effects-native/emitter-javelin-trail-glow/graph.json',
        ]),
      );
    const pending = await seek(page, r.pending);
    expect(pending.battle).toBe(
      JSON.stringify(r.snapshots.find((s) => s.at === r.pending)!.battle),
    );
    expect(await body(page)).toBe(false);
    const flight = await seek(page, r.flight);
    expect(flight).toEqual({
      battle: JSON.stringify(r.snapshots.find((s) => s.at === r.flight)!.battle),
      unchanged: true,
    });
    await expect.poll(() => body(page), { timeout: 30000 }).toBe(true);
    await page.screenshot({ path: `output/playtest/seeking-shield-flight-${level}-${width}.png` });
    const bounce = await seek(page, r.bounce);
    expect(bounce.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.bounce)!.battle));
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const shots = model.battle.nativeSeekingShieldCasts[0].shots;
            const keys = [...scene.nativeProjectiles.layer.views.keys()];
            return (
              shots.length > 1 &&
              !keys.some((key) => key.includes(`${shots[1].id}:bounce:`)) &&
              !keys.some((key) => key.includes(`${shots[0].id}:hit:`)) &&
              scene.nativeProjectiles.history.get(shots[1].id)?.animationAt ===
                model.battle.nativeSeekingShieldCasts[0].launchAt
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
            (o) => o.getData?.('nativeEffect') === 'shield_trail_glow' && o.visible && o.alpha > 0,
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/seeking-shield-bounce-${level}-${width}.png` });
    const final = r.shots.at(-1)!;
    await seek(page, Math.ceil((final.impact + 0.05) * 20) / 20);
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return [...scene.nativeProjectiles.layer.views.keys()].some((key) =>
            key.includes(`${id}:hit:`),
          );
        }, final.id),
      )
      .toBe(true);
    const landed = await seek(page, r.landed);
    expect(landed.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.landed)!.battle));
    expect(
      await page.evaluate(
        () => window.__game.model.battle.nativeSeekingShieldCasts[0].shots.length,
      ),
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

test('the original shield finishes its pending throw after the recorded Champion is Recalled', async ({
  page,
}) => {
  const r = await open(page, 18, true);
  const before = await seek(page, r.beforeLaunch);
  expect(before.battle).toBe(
    JSON.stringify(r.snapshots.find((s) => s.at === r.beforeLaunch)!.battle),
  );
  expect(await page.evaluate(() => window.__game.model.battle.nativeHeroes[0].unitId)).toBeNull();
  expect(await body(page)).toBe(false);
  const later = await seek(page, r.flight);
  expect(later.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.flight)!.battle));
  expect(
    await page.evaluate(
      (id) => window.__game.model.battle.units.some((unit) => unit.id === id),
      r.championId,
    ),
  ).toBe(false);
  await expect.poll(() => body(page), { timeout: 30000 }).toBe(true);
  await seek(page, r.landed);
  expect(
    await page.evaluate(() => window.__game.model.battle.nativeSeekingShieldCasts[0].shots.length),
  ).toBe(4);
});

test('version 135 keeps its previous Seeking Shield activation without ricochets', async ({
  page,
}) => {
  const r = await open(page, 18, false, 135);
  await seek(page, r.bounce);
  expect(
    await page.evaluate(() => ({
      enabled: !!window.__game.model.battle.nativeSeekingShield,
      casts: window.__game.model.battle.nativeSeekingShieldCasts?.length ?? 0,
    })),
  ).toEqual({ enabled: false, casts: 0 });
  expect(await body(page)).toBe(false);
});

test('a failed original shield pack recovers while playback remains paused', async ({ page }) => {
  test.setTimeout(120000);
  let blocked = true,
    attempts = 0;
  await page.route('**/assets/projectiles-native/amazonqueen-shield/graph.json*', async (route) => {
    attempts++;
    if (blocked) await route.fulfill({ status: 503, body: 'temporarily missing shield' });
    else await route.continue();
  });
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

test('Seeking Shield plays its original final landing sample without borrowing the ordinary Champion hit', async ({
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
  const last = r.shots.at(-1)!;
  const state = await seek(page, Math.ceil((last.impact + 0.05) * 20) / 20);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { audio, scene } = window.__game;
          const { effectSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
          scene.drawOverlay(0);
          return effectSoundFiles('trollBoulder_destroyed').every((name) =>
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
    const shot = model.battle.nativeSeekingShieldCasts[0].shots.at(-1),
      key = `${shot.id}:shield:sound`;
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
  expect(result.at).toBe(last.impact);
  expect(result.pitch).toBeGreaterThanOrEqual(0.98);
  expect(result.pitch).toBeLessThanOrEqual(1.02);
  expect(result.rate).toBeCloseTo(result.pitch, 6);
  expect(result.gain).toBeCloseTo(0.048, 6);
  expect(result.attacks).toBe(0);
  expect(result.battle).toBe(state.battle);
});

test('Monolith fire automatically releases the original shield without a manual ability input', async ({
  page,
}) => {
  const r = await boot(page, automaticSeekingShieldRecording());
  expect(r.launchAt).toBe(r.castAt);
  expect(r.data.actions.some((action) => action.type === 'ability')).toBe(false);
  const flight = await seek(page, r.flight);
  expect(flight.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.flight)!.battle));
  await expect.poll(() => body(page), { timeout: 30000 }).toBe(true);
  const later = await seek(page, r.later);
  expect(later.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.later)!.battle));
  expect(await seek(page, r.flight)).toEqual(flight);
});
