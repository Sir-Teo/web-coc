import { expect, test, type Page } from '@playwright/test';
import { nativeMeteorStaffRecording } from '../fixtures/native-meteor-staff';

async function boot(page: Page, data: unknown, live = false) {
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
        model.state.king = undefined;
        for (const key of ['buildings', 'army', 'spells', 'troopLevels', 'spellLevels', 'nextId'])
          model.state[key] = data.initial[key];
        model.startBattle(0, true);
        model.recording.initial = data.initial;
        model.recording.version = data.version;
        model.battle = replayBattle(data.initial, data.version);
      } else {
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
          throw Error('Meteor Staff source replay rejected');
      }
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    },
    { data, live },
  );
}
async function seek(page: Page, at: number, focus = 'owner') {
  return page.evaluate(
    async ({ at, focus }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const b = model.battle,
        cast = b.nativeSpellCastHistory?.find((c) => c.name === 'MPMeteorStaffSpell'),
        unit = b.units.find((u) => u.hero === 'prince' && !u.native?.recalled);
      const point =
        focus === 'target'
          ? (cast ?? { x: 38, y: 38 })
          : (unit ?? cast?.activationOrigin ?? { x: 8.55, y: 11.5 });
      const { iso } = await import('/src/game/scene.ts'),
        p = iso(point.x, point.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main
        .setZoom(innerWidth < 500 ? 0.95 : 1.25)
        .centerOn(p.x, p.y - (focus === 'target' ? 120 : 70));
      const before = JSON.stringify(b);
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(b) };
    },
    { at, focus },
  );
}
async function visible(page: Page, id: number, phase: string) {
  return page.evaluate(
    ({ id, phase }) => {
      const scene = window.__game.scene;
      scene.drawOverlay(0);
      return [...scene.fieldSpellPresentations.get('MPMeteorStaffSpell').layer.views].some(
        ([key, view]) =>
          key.includes(`spell:${id}:${phase}:`) &&
          view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING'),
      );
    },
    { id, phase },
  );
}

for (const { level, recall, width, version } of [
  { level: 1, recall: false, width: 1440 },
  { level: 27, recall: true, width: 390 },
  { level: 1, recall: false, width: 1440, version: 141 },
] as const)
  test(`original Meteor Staff ${level}, Recall=${recall}, version=${version ?? 'current'}, ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = nativeMeteorStaffRecording(level, recall, version),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await boot(page, r.data);
    for (const s of r.snapshots) {
      const actual = await seek(page, s.at);
      expect(actual).toEqual({ battle: JSON.stringify(s.battle), readOnly: true });
    }
    const activation = await seek(page, r.activation);
    if (version === 141) {
      expect(await visible(page, r.castId, 'activation')).toBe(false);
      expect(
        requests.some(
          (path) =>
            path.includes('meteor-staff-native') || path.includes('Ability_MP_MeteorStaff_'),
        ),
      ).toBe(false);
    } else {
      await expect.poll(() => visible(page, r.castId, 'activation'), { timeout: 30000 }).toBe(true);
      await expect
        .poll(
          () =>
            page.evaluate((id) => {
              const scene = window.__game.scene;
              scene.drawOverlay(0);
              return scene.children.list.some(
                (o) =>
                  o.visible &&
                  o.alpha > 0 &&
                  o.getData?.('nativeHero') === id &&
                  o.texture?.key.startsWith('baked:heroes-native/'),
              );
            }, r.unitId),
          { timeout: 30000 },
        )
        .toBe(true);
      await seek(page, r.attached);
      await expect.poll(() => visible(page, r.castId, 'activation')).toBe(true);
      await page.screenshot({ path: `output/playtest/meteor-staff-aura-${level}-${width}.png` });
      await seek(page, r.fall, 'target');
      await expect.poll(() => visible(page, r.castId, 'preDeploy')).toBe(true);
      await page.screenshot({ path: `output/playtest/meteor-staff-fall-${level}-${width}.png` });
      const impact = await seek(page, r.impact, 'target');
      await expect.poll(() => visible(page, r.castId, 'deploy')).toBe(true);
      expect(await visible(page, r.castId, 'spawn')).toBe(true);
      await page.screenshot({ path: `output/playtest/meteor-staff-impact-${level}-${width}.png` });
      await page.evaluate(() => window.__game.model.toggleReducedMotion());
      expect(await visible(page, r.castId, 'spawn')).toBe(false);
      expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
        impact.battle,
      );
      await page.evaluate(() => window.__game.model.toggleReducedMotion());
      await expect.poll(() => visible(page, r.castId, 'spawn')).toBe(true);
      await seek(page, r.tail, 'target');
      expect(await visible(page, r.castId, 'spawn')).toBe(true);
      await seek(page, r.after, 'target');
      expect(
        await page.evaluate(
          () =>
            window.__game.scene.fieldSpellPresentations.get('MPMeteorStaffSpell').layer.views.size,
        ),
      ).toBe(0);
    }
    await seek(page, r.before);
    expect(await seek(page, r.activation)).toEqual(activation);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('Meteor Staff source camera and actual fall/impact audio remain separate from the later damage pulse', async ({
  page,
}) => {
  test.setTimeout(120000);
  const r = nativeMeteorStaffRecording();
  await boot(page, r.data, true);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { model, scene, audio } = window.__game;
          const { spellSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
          scene.drawOverlay(0);
          return (
            scene.fieldSpellPresentations.get('MPMeteorStaffSpell').hasArt(model.battle, false) &&
            spellSoundFiles('MPMeteorStaffSpell').every((file) =>
              audio.samples.has(troopSample(file)),
            )
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  const live = await page.evaluate(async (r) => {
    const { model, scene } = window.__game;
    if (!model.deployNativeHero('prince', 6.9, 11.5))
      throw Error('Live Meteor Staff Prince failed');
    while (model.battle.elapsed < 8.25 - 1e-9) model.step(0.05);
    model.activeSpell = 'invisibility';
    if (!model.castSpell(14.5, 11.5)) throw Error('Live Meteor Staff cover failed');
    while (model.battle.elapsed < r.impact - 1e-9) model.step(0.05);
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
    const before = JSON.stringify(model.battle);
    scene.cameraShake.clear();
    const p = scene.screenFor(38, 38);
    model.state.settings.reducedMotion = true;
    const still = scene.screenFor(38, 38);
    model.state.settings.reducedMotion = false;
    return {
      battle: before,
      delta: [p.x - still.x, p.y - still.y],
      readOnly: before === JSON.stringify(model.battle),
    };
  }, r);
  expect(live.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.impact)!.battle));
  expect(Math.hypot(...live.delta)).toBeGreaterThan(0.01);
  expect(live.readOnly).toBe(true);
  await page.evaluate(async (data) => {
    const { model } = window.__game,
      { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    model.finishBattle();
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Meteor Staff audio replay rejected');
  }, r.data);
  for (const phase of ['activation', 'impact'] as const) {
    const state = await seek(page, r[phase], phase === 'activation' ? 'owner' : 'target');
    const result = await page.evaluate(
      async ({ r, phase }) => {
        const { model, scene, audio } = window.__game,
          { iso } = await import('/src/game/scene.ts');
        scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
        const key = `spell:${r.castId}:${phase === 'activation' ? 'preDeploy' : 'deploy'}`,
          cue = scene.lastCues.find((c) => c.key === key),
          node = audio.samples.active.get(key);
        const generated: string[] = [],
          impacts: unknown[] = [],
          play = audio.play,
          impact = scene.combatEffects.impact;
        audio.play = (name) => {
          generated.push(name);
        };
        scene.combatEffects.impact = (...args) => {
          impacts.push(args);
        };
        try {
          if (phase === 'activation')
            scene.renderEffect({
              type: 'hit',
              x: 8.55,
              y: 11.5,
              toX: 38,
              toY: 38,
              sourceId: r.unitId,
              abilityCastId: `meteor-staff:${r.castId}`,
            });
        } finally {
          audio.play = play;
          scene.combatEffects.impact = impact;
        }
        scene.cameraShake.clear();
        const p = scene.screenFor(38, 38);
        model.state.settings.reducedMotion = true;
        const still = scene.screenFor(38, 38);
        model.state.settings.reducedMotion = false;
        const result = {
          gain: node.gain.gain.value,
          rate: node.source.playbackRate.value,
          pitch: cue.pitch,
          at: cue.at,
          generated,
          impacts,
          delta: [p.x - still.x, p.y - still.y],
          battle: JSON.stringify(model.battle),
        };
        scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
        return result;
      },
      { r, phase },
    );
    expect(result.gain).toBeCloseTo(phase === 'activation' ? 0.084 : 0.12, 6);
    expect(result.rate).toBeCloseTo(result.pitch, 6);
    expect(result.pitch).toBeGreaterThanOrEqual(0.95);
    expect(result.pitch).toBeLessThanOrEqual(1.05);
    expect(result.at).toBe(phase === 'activation' ? r.castAt : r.visualImpact);
    expect(result.generated).toEqual([]);
    expect(result.impacts).toEqual([]);
    expect(result.delta).toEqual([0, 0]);
    expect(result.battle).toBe(state.battle);
  }
});

test('a delayed Meteor Staff pack and fall sample recover during paused playback without altering the captured cast', async ({
  page,
}) => {
  test.setTimeout(120000);
  let blocked = true,
    attempts = 0;
  for (const path of [
    '**/assets/meteor-staff-native/effects/graph.json*',
    '**/assets/audio/troops-native/Ability_MP_MeteorStaff_Fall_*.ogg*',
  ])
    await page.route(path, async (route) => {
      attempts++;
      if (blocked) await route.fulfill({ status: 503, body: 'delayed Meteor Staff source' });
      else await route.continue();
    });
  const r = nativeMeteorStaffRecording();
  await boot(page, r.data);
  const state = await seek(page, r.activation);
  await expect.poll(() => attempts).toBeGreaterThan(1);
  await page.evaluate(() => {
    window.__game.model.replay.paused = true;
    window.__game.scene.paused = false;
  });
  blocked = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { model, scene, audio } = window.__game,
            { spellSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
          return (
            scene.fieldSpellPresentations.get('MPMeteorStaffSpell').hasArt(model.battle, false) &&
            spellSoundFiles('MPMeteorStaffSpell').every((file) =>
              audio.samples.has(troopSample(file)),
            ) &&
            [...scene.fieldSpellPresentations.get('MPMeteorStaffSpell').layer.views.values()].some(
              (view) => view.objects.some((o) => o.visible && o.alpha > 0),
            )
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(state.battle);
  expect(
    await page.evaluate(
      (id) =>
        [...window.__game.audio.samples.active.keys()].some((key) =>
          key.startsWith(`spell:${id}:`),
        ),
      r.castId,
    ),
  ).toBe(false);
});
