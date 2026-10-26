import { expect, test, type Page } from '@playwright/test';
import { nativeFireballRecording } from '../fixtures/native-fireball';

async function boot(page: Page, level = 1, version?: number) {
  const recording = nativeFireballRecording(level, version);
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (r) => {
    window.__fireball = r;
    const { model, scene } = window.__game;
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
      throw Error('Fireball portable replay rejected');
    scene.sync();
  }, recording);
  return recording;
}

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts');
    const afterImpact = at >= window.__fireball.impact;
    const p = afterImpact ? iso(21.5, 11.5) : iso(16, 11.5);
    scene.cameras.main.useBounds = false;
    scene.cameras.main
      .setZoom(innerWidth < 500 ? 0.75 : 1.2)
      .centerOn(p.x, p.y + (afterImpact ? 180 : -130));
    scene.drawOverlay(0);
    return JSON.stringify(model.battle);
  }, at);
}

async function flightVisible(page: Page) {
  return page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.drawOverlay(0);
    const shot = model.battle.nativeFireballs?.[0];
    const view = shot && scene.nativeProjectiles.views.get(shot.id)?.view;
    return !!view?.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING');
  });
}

async function explosionVisible(page: Page) {
  return page.evaluate(() => {
    const { scene } = window.__game;
    scene.drawOverlay(0);
    return scene.children.list.some(
      (o) =>
        o.getData?.('nativeEffect') === 'e_chr_gw_fireball_Explosion' && o.visible && o.alpha > 0,
    );
  });
}

for (const width of [1440, 390])
  for (const level of [1, 9, 24])
    test(`original Fireball level ${level} flight and explosion at ${width}px`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const r = await boot(page, level);
      const airborne = await seek(page, r.airborne);
      expect(airborne).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.airborne)!.battle));
      await expect.poll(() => flightVisible(page), { timeout: 30000 }).toBe(true);
      expect(
        await page.evaluate(() => window.__game.model.battle.nativeFireballs[0].native.name),
      ).toBe(`vfx_chr_gw_Fireball_lvl${level === 1 ? 1 : level === 9 ? 2 : 3}`);
      await page.screenshot({
        path: `output/playtest/native-fireball-flight-${level}-${width}.png`,
      });
      const impact = await seek(page, r.explosion);
      expect(impact).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.explosion)!.battle));
      await expect.poll(() => explosionVisible(page), { timeout: 30000 }).toBe(true);
      expect(await flightVisible(page)).toBe(false);
      await page.screenshot({
        path: `output/playtest/native-fireball-explosion-${level}-${width}.png`,
      });
      expect(await seek(page, r.airborne)).toBe(airborne);
      await expect.poll(() => flightVisible(page)).toBe(true);
      expect(await seek(page, r.explosion)).toBe(impact);
      await page.evaluate(() => window.__game.model.toggleReducedMotion());
      expect(await explosionVisible(page)).toBe(false);
      expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(impact);
      await page.evaluate(() => window.__game.model.toggleReducedMotion());
      await expect.poll(() => explosionVisible(page)).toBe(true);
      await seek(page, r.after);
      expect(await explosionVisible(page)).toBe(false);
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
      expect(errors).toEqual([]);
    });

test('version 129 retains the previous Fireball activation without a shot or blast', async ({
  page,
}) => {
  const r = await boot(page, 27, 129);
  await seek(page, r.explosion);
  expect(
    await page.evaluate(() => {
      const b = window.__game.model.battle;
      return {
        enabled: !!b.nativeWardenFireball,
        shots: b.nativeFireballs?.length ?? 0,
        cannon: b.buildings.find((b) => b.id === 2).hp,
      };
    }),
  ).toEqual({ enabled: false, shots: 0, cannon: 2250 });
  expect(await explosionVisible(page)).toBe(false);
});

test('Fireball plays its original activation sample with source gain and pitch', async ({
  page,
}) => {
  test.setTimeout(120000);
  const r = await boot(page);
  await page.evaluate(async () => {
    const { audio } = window.__game;
    audio.enabled = true;
    audio.unlock();
    await audio.context.resume();
  });
  const before = await seek(page, r.launch);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { audio, scene } = window.__game;
          const { effectSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
          scene.drawOverlay(0);
          return effectSoundFiles('FireballActivationEffect').every((name) =>
            audio.samples.has(troopSample(name)),
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { model, scene, audio } = window.__game;
        const { iso } = await import('/src/game/scene.ts');
        scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
        const shot = model.battle.nativeFireballs[0];
        return audio.samples.active.has(`${shot.id}:fireball:sound`);
      }),
    )
    .toBe(true);
  const result = await page.evaluate(async () => {
    const { model, scene, audio } = window.__game;
    const { iso } = await import('/src/game/scene.ts');
    const key = `${model.battle.nativeFireballs[0].id}:fireball:sound`;
    const cue = scene.lastCues.find((c) => c.key === key),
      node = audio.samples.active.get(key);
    const result = {
      at: cue.at,
      pitch: cue.pitch,
      rate: node.source.playbackRate.value,
      gain: node.gain.gain.value,
      battle: JSON.stringify(model.battle),
    };
    scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
    return result;
  });
  expect(result.at).toBe(r.launched);
  expect(result.rate).toBeCloseTo(result.pitch, 6);
  expect(result.pitch).toBeGreaterThanOrEqual(0.7);
  expect(result.pitch).toBeLessThanOrEqual(0.8);
  expect(result.gain).toBeCloseTo(0.144, 6);
  expect(result.battle).toBe(before);
});

test('a delayed original Fireball explosion recovers while its replay stays paused', async ({
  page,
}) => {
  test.setTimeout(120000);
  let blocked = true;
  let attempts = 0;
  await page.route('**/assets/fireball-native/effects/graph.json*', async (route) => {
    attempts++;
    if (blocked) await route.fulfill({ status: 503, body: 'delayed original Fireball art' });
    else await route.continue();
  });
  const r = await boot(page);
  await seek(page, r.explosion);
  await expect.poll(() => attempts).toBeGreaterThan(0);
  expect(await explosionVisible(page)).toBe(false);
  const before = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.replay.paused = true;
    scene.paused = false;
    return JSON.stringify(model.battle);
  });
  blocked = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  // The normal scene loop must repaint a newly loaded pack without a seek or forced overlay.
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__game.scene.children.list.some(
            (o) =>
              o.getData?.('nativeEffect') === 'e_chr_gw_fireball_Explosion' &&
              o.visible &&
              o.alpha > 0,
          ),
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before);
});
