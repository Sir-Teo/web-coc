import { expect, test, type Page } from '@playwright/test';
import { nativeFrostFlakeRecording } from '../fixtures/native-frost-flake';

async function open(page: Page, level = 1, recall = false, version?: number, audioEnabled = false) {
  const r = nativeFrostFlakeRecording(level, recall, version);
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(
    async ({ r, audioEnabled }) => {
      window.__frostFlake = r;
      const { model, scene, audio } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (audioEnabled) {
        audio.enabled = true;
        audio.unlock();
        await audio.context.resume();
      }
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Frost Flake portable replay rejected');
      scene.sync();
    },
    { r, audioEnabled },
  );
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
    const point = iso(11, 11.5);
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setZoom(innerWidth < 500 ? 0.9 : 1.35).centerOn(point.x, point.y - 50);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return { battle: before, unchanged: before === JSON.stringify(model.battle) };
  }, at);
}

async function ready(page: Page) {
  return page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.drawOverlay(0);
    const cast = model.battle.nativeFrostFlakeCasts?.[0];
    return (
      !!cast &&
      scene.nativeProjectiles.coversFrostActivation(false) &&
      cast.shots.every((shot) =>
        scene.nativeProjectiles.views
          .get(shot.id)
          ?.view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING'),
      ) &&
      scene.children.list.some(
        (o) =>
          o.getData?.('nativeEffect') === 'rc_gear_frostblast_trail' && o.visible && o.alpha > 0,
      )
    );
  });
}

for (const { level, count, width } of [
  { level: 1, count: 4, width: 1440 },
  { level: 9, count: 5, width: 390 },
  { level: 18, count: 6, width: 1440 },
  { level: 27, count: 7, width: 390 },
])
  test(`Frost Flake ${level} freezes ${count} targets with original flight at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    const r = await open(page, level);
    await expect
      .poll(() => requests)
      .toEqual(
        expect.arrayContaining([
          '/assets/frost-flake-native/activation/graph.json',
          '/assets/projectiles-native/rc-gear-frostblast-projectile/graph.json',
          '/assets/effects-native/emitter-rc-gear-frostblast-trail/graph.json',
        ]),
      );
    const fan = await seek(page, r.fan);
    expect(fan).toEqual({
      battle: JSON.stringify(r.snapshots.find((s) => s.at === r.fan)!.battle),
      unchanged: true,
    });
    await expect.poll(() => ready(page), { timeout: 30000 }).toBe(true);
    expect(
      await page.evaluate(() => window.__game.model.battle.nativeFrostFlakeCasts[0].shots.length),
    ).toBe(count);
    await page.screenshot({ path: `output/playtest/frost-flake-fan-${level}-${width}.png` });
    const frozen = await seek(page, r.mid);
    expect(frozen.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.mid)!.battle));
    expect(
      await page.evaluate(() => {
        const b = window.__game.model.battle;
        return b.nativeFrostFlakeCasts[0].shots.every(
          (p) => b.defenseStuns[p.targetId] > b.elapsed,
        );
      }),
    ).toBe(true);
    await page.screenshot({ path: `output/playtest/frost-flake-frozen-${level}-${width}.png` });
    expect(await seek(page, r.fan)).toEqual(fan);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        scene.drawOverlay(0);
        return model.battle.nativeFrostFlakeCasts[0].shots.some((shot) =>
          scene.nativeProjectiles.views.get(shot.id)?.view.objects.some((o) => o.visible),
        );
      }),
    ).toBe(false);
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(fan.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await expect.poll(() => ready(page)).toBe(true);
    const thaw = await seek(page, r.afterThaw);
    expect(thaw.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.afterThaw)!.battle));
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('Frost Flake arrivals and full freezes survive recorded Champion Recall', async ({ page }) => {
  const r = await open(page, 27, true);
  const state = await seek(page, r.allHit);
  expect(state.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.allHit)!.battle));
  expect(
    await page.evaluate(() => {
      const b = window.__game.model.battle,
        r = window.__frostFlake;
      return {
        caster: b.units.some((u) => u.id === r.championId),
        frozen: b.nativeFrostFlakeCasts[0].shots.filter(
          (p) => b.defenseStuns[p.targetId] > b.elapsed,
        ).length,
      };
    }),
  ).toEqual({ caster: false, frozen: 7 });
});

test('version 132 retains its previous Frost Charm activation without freeze projectiles', async ({
  page,
}) => {
  const r = await open(page, 27, false, 132);
  await seek(page, r.firstHit);
  expect(
    await page.evaluate(() => {
      const b = window.__game.model.battle;
      return {
        enabled: !!b.nativeFrostFlake,
        casts: b.nativeFrostFlakeCasts?.length ?? 0,
        frozen: (b.defenseStuns[2] ?? 0) > b.elapsed,
      };
    }),
  ).toEqual({ enabled: false, casts: 0, frozen: false });
});

test('a delayed original activation recovers while Frost Flake playback stays paused', async ({
  page,
}) => {
  test.setTimeout(120000);
  let blocked = true,
    attempts = 0;
  await page.route('**/assets/frost-flake-native/activation/graph.json*', async (route) => {
    attempts++;
    if (blocked) await route.fulfill({ status: 503, body: 'delayed Frost Flake activation' });
    else await route.continue();
  });
  const r = await open(page);
  await seek(page, r.activation);
  await expect.poll(() => attempts).toBeGreaterThan(0);
  const before = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.replay.paused = true;
    scene.paused = false;
    return JSON.stringify(model.battle);
  });
  blocked = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__game.scene.children.list.some(
            (o) =>
              o.getData?.('nativeEffect') === 'rc_gear_frostblast_snowflack' &&
              o.visible &&
              o.alpha > 0,
          ),
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before);
});

test('Frost Flake plays original activation and impact samples without the generic activation tone', async ({
  page,
}) => {
  test.setTimeout(120000);
  const r = await open(page, 1, false, undefined, true);
  for (const phase of ['activation', 'firstHit'] as const) {
    const state = await seek(page, r[phase]);
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const { scene, audio } = window.__game;
            const { frostFlakeSoundEffects } = await import('/src/game/frost-flake-effects.ts');
            const { effectSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
            scene.drawOverlay(0);
            return frostFlakeSoundEffects
              .flatMap(effectSoundFiles)
              .every((f) => audio.samples.has(troopSample(f)));
          }),
        { timeout: 30000 },
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(async (phase) => {
          const { model, scene, audio } = window.__game;
          const { iso } = await import('/src/game/scene.ts');
          scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
          const cast = model.battle.nativeFrostFlakeCasts[0];
          return audio.samples.active.has(
            `${phase === 'activation' ? cast.id : cast.shots[0].id}:sound`,
          );
        }, phase),
      )
      .toBe(true);
    const result = await page.evaluate(async (phase) => {
      const { model, scene, audio } = window.__game;
      const { iso } = await import('/src/game/scene.ts');
      const cast = model.battle.nativeFrostFlakeCasts[0],
        key = `${phase === 'activation' ? cast.id : cast.shots[0].id}:sound`;
      const cue = scene.lastCues.find((c) => c.key === key),
        node = audio.samples.active.get(key);
      let generated = [];
      if (phase === 'activation') {
        const play = audio.play;
        audio.play = (name, ...args) => {
          generated.push(name);
          return play.apply(audio, [name, ...args]);
        };
        scene.renderEffect({
          type: 'trap',
          x: cast.x,
          y: cast.y,
          text: 'FROST FLAKE',
          abilityCastId: cast.id,
          at: cast.at,
        });
        audio.play = play;
      }
      const result = {
        at: cue.at,
        gain: node.gain.gain.value,
        rate: node.source.playbackRate.value,
        pitch: cue.pitch,
        generated,
        battle: JSON.stringify(model.battle),
      };
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return result;
    }, phase);
    expect(result.at).toBe(phase === 'activation' ? r.launched : r.firstImpact);
    expect(result.gain).toBeCloseTo(phase === 'activation' ? 0.12 : 0.06, 6);
    expect(result.rate).toBeCloseTo(result.pitch, 6);
    expect(result.pitch).toBeGreaterThanOrEqual(phase === 'activation' ? 1 : 0.9);
    expect(result.pitch).toBeLessThanOrEqual(phase === 'activation' ? 1 : 1.1);
    expect(result.generated).toEqual([]);
    expect(result.battle).toBe(state.battle);
  }
});
