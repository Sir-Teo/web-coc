import { expect, test, type Page } from '@playwright/test';
import { nativeDarkOrbRecording } from '../fixtures/native-dark-orb';

async function open(page: Page, level = 1, recall = false, version?: number) {
  const r = nativeDarkOrbRecording(level, recall, version);
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (r) => {
    window.__darkOrb = r;
    const { model, scene } = window.__game;
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
      throw Error('Dark Orb replay rejected');
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
    const shot = model.battle.nativeDarkOrbs?.[0];
    const along = shot ? Math.min(shot.length, Math.max(0, at - shot.launched) * shot.speed) : 8;
    const point = shot
      ? iso(shot.fromX + shot.dirX * along, shot.fromY + shot.dirY * along)
      : iso(15, 11.5);
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setZoom(innerWidth < 500 ? 0.8 : 1.15).centerOn(point.x, point.y - 105);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return { battle: before, unchanged: before === JSON.stringify(model.battle) };
  }, at);
}

async function body(page: Page, redraw = true) {
  return page.evaluate((redraw) => {
    const { model, scene } = window.__game;
    if (redraw) scene.drawOverlay(0);
    const shot = model.battle.nativeDarkOrbs?.[0];
    return (
      !!shot &&
      !!scene.nativeProjectiles.views
        .get(shot.id)
        ?.view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING')
    );
  }, redraw);
}

async function effect(page: Page, name: string) {
  return page.evaluate((name) => {
    const scene = window.__game.scene;
    scene.drawOverlay(0);
    return scene.children.list.some(
      (o) => o.getData?.('nativeEffect') === name && o.visible && o.alpha > 0,
    );
  }, name);
}

for (const { level, width } of [
  { level: 1, width: 1440 },
  { level: 18, width: 390 },
])
  test(`original masked Dark Orb ${level} portal, corridor and impact at ${width}px`, async ({
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
          '/assets/dark-orb-native/projectile/graph.json',
          '/assets/dark-orb-native/contact/graph.json',
          '/assets/effects-native/ps-chr-darkorb-projectilespawn/graph.json',
          '/assets/effects-native/ps-chr-darkorb-impact/graph.json',
        ]),
      );
    const portal = await seek(page, r.portal);
    expect(portal).toEqual({
      battle: JSON.stringify(r.snapshots.find((s) => s.at === r.portal)!.battle),
      unchanged: true,
    });
    await expect.poll(() => body(page), { timeout: 30000 }).toBe(true);
    await expect.poll(() => effect(page, 'e_chr_DarkOrb_Portal'), { timeout: 30000 }).toBe(true);
    await page.screenshot({ path: `output/playtest/dark-orb-portal-${level}-${width}.png` });
    const contact = await seek(page, r.contact);
    expect(contact.battle).toBe(
      JSON.stringify(r.snapshots.find((s) => s.at === r.contact)!.battle),
    );
    await expect
      .poll(() => effect(page, 'e_chr_DarkOrb_IceShardBurstSmall'), { timeout: 30000 })
      .toBe(true);
    await page.screenshot({ path: `output/playtest/dark-orb-contact-${level}-${width}.png` });
    const impact = await seek(page, r.impact);
    expect(impact.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.impact)!.battle));
    await expect
      .poll(() => effect(page, 'e_chr_DarkOrb_IceShardBurst'), { timeout: 30000 })
      .toBe(true);
    expect(await body(page)).toBe(false);
    await page.screenshot({ path: `output/playtest/dark-orb-impact-${level}-${width}.png` });
    const slow = await seek(page, r.slow);
    expect(slow.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.slow)!.battle));
    expect(
      await page.evaluate(() => window.__game.model.battle.buildingEffects[2].frost.percent),
    ).toBe(level === 1 ? 0.2 : 0.5);
    expect(await seek(page, r.portal)).toEqual(portal);
    await expect.poll(() => body(page)).toBe(true);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await body(page)).toBe(false);
    expect(await effect(page, 'e_chr_DarkOrb_Portal')).toBe(false);
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      portal.battle,
    );
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await expect.poll(() => body(page)).toBe(true);
    await seek(page, r.after);
    expect(await body(page)).toBe(false);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('the source corridor and slow survive recorded Prince Recall', async ({ page }) => {
  const r = await open(page, 18, true);
  const contact = await seek(page, r.contact);
  expect(contact.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.contact)!.battle));
  expect(
    await page.evaluate(
      (id) => window.__game.model.battle.units.some((u) => u.id === id),
      r.princeId,
    ),
  ).toBe(false);
  await expect.poll(() => body(page), { timeout: 30000 }).toBe(true);
  const impact = await seek(page, r.impact);
  expect(impact.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.impact)!.battle));
  expect(
    await page.evaluate(() =>
      window.__game.model.battle.nativeDarkOrbs[0].hit.some((hit) => hit.at > 1),
    ),
  ).toBe(true);
});

test('version 134 retains its previous Dark Orb activation without a corridor or frost', async ({
  page,
}) => {
  const r = await open(page, 18, false, 134);
  await seek(page, r.contact);
  expect(
    await page.evaluate(() => ({
      enabled: !!window.__game.model.battle.nativeDarkOrb,
      shots: window.__game.model.battle.nativeDarkOrbs?.length ?? 0,
      frost: window.__game.model.battle.buildingEffects?.[2]?.frost,
    })),
  ).toEqual({ enabled: false, shots: 0, frost: undefined });
  expect(await body(page)).toBe(false);
});

test('a delayed original masked body recovers during paused playback', async ({ page }) => {
  test.setTimeout(120000);
  let blocked = true,
    attempts = 0;
  await page.route('**/assets/dark-orb-native/projectile/graph.json*', async (route) => {
    attempts++;
    if (blocked) await route.fulfill({ status: 503, body: 'temporarily missing crystal' });
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

test('Dark Orb plays its original activation sample and replaces generic ability feedback', async ({
  page,
}) => {
  test.setTimeout(120000);
  const r = await open(page);
  await page.evaluate(async () => {
    const { audio } = window.__game;
    audio.enabled = true;
    audio.unlock();
    await audio.context.resume();
  });
  const state = await seek(page, r.portal);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { audio, scene } = window.__game;
          const { effectSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
          scene.drawOverlay(0);
          return (
            effectSoundFiles('ps_chr_DarkOrb_ProjectileSfx').every((name) =>
              audio.samples.has(troopSample(name)),
            ) && scene.nativeProjectiles.layer.status('ps_chr_DarkOrb_ProjectileSpawn') === 'ready'
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  const result = await page.evaluate(async () => {
    const { model, scene, audio } = window.__game;
    const { iso } = await import('/src/game/scene.ts');
    scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
    const shot = model.battle.nativeDarkOrbs[0],
      key = `${shot.id}:sound`,
      cue = scene.lastCues.find((c) => c.key === key),
      node = audio.samples.active.get(key);
    const tones = [],
      sparks = [],
      play = audio.play,
      makeSparks = scene.sparks;
    audio.play = (name) => tones.push(name);
    scene.sparks = (...args) => sparks.push(args[3]);
    try {
      scene.renderEffect({
        type: 'trap',
        x: shot.fromX,
        y: shot.fromY,
        at: shot.launched,
        abilityCastId: shot.id,
        text: 'DARK ORB',
      });
      return {
        at: cue.at,
        pitch: cue.pitch,
        rate: node.source.playbackRate.value,
        gain: node.gain.gain.value,
        tones,
        sparks,
        battle: JSON.stringify(model.battle),
      };
    } finally {
      audio.play = play;
      scene.sparks = makeSparks;
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
    }
  });
  expect(result.at).toBe(r.launched);
  expect(result.pitch).toBeGreaterThanOrEqual(0.9);
  expect(result.pitch).toBeLessThanOrEqual(1);
  expect(result.rate).toBeCloseTo(result.pitch, 6);
  expect(result.gain).toBeCloseTo(0.096, 6);
  expect(result.tones).toEqual([]);
  expect(result.sparks).toEqual([]);
  expect(result.battle).toBe(state.battle);
});
