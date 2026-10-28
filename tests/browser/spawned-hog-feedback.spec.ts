import { expect, test, type Page } from '@playwright/test';
import { superHogSplitRecording } from '../fixtures/super-hog-split';
import { hogPuppetRecording } from '../fixtures/attacking-hog';

async function scout(page: Page, data: unknown, kinds: string[], width: number, landing = false) {
  const errors: string[] = [],
    requests = new Set<string>();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.add(new URL(r.url()).pathname));
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene, audio } = window.__game,
      { replayBattle } = await import('/src/game/replay.ts');
    scene.paused = true;
    audio.enabled = true;
    audio.unlock();
    await audio.context.resume();
    model.battle = replayBattle(data.initial, data.version);
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
  }, data);
  if (landing)
    await expect
      .poll(() => requests.has('/assets/effects-native/super-hog-rider-land-hit/graph.json'))
      .toBe(true);
  await page.waitForFunction(
    async ({ kinds, landing }) => {
      const { audio, scene } = window.__game,
        { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts');
      return (
        kinds.every((kind) =>
          troopSoundFiles(kind).every((file) => audio.samples.has(troopSample(file))),
        ) &&
        (!landing || scene.nativeProjectiles.layer.status('Super Hog Rider Land Hit') === 'ready')
      );
    },
    { kinds, landing },
  );
  expect(await page.evaluate(() => window.__game.model.battle.units)).toEqual([]);
  return errors;
}

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const { iso } = await import('/src/game/scene.ts'),
        unit = model.battle.units.find((u) => u.id === id),
        p = iso(unit.x, unit.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.45 : 1.8).centerOn(p.x, p.y - 60);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle, readOnly: battle === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

async function voice(page: Page, id: number, event: 'deploy' | 'attack') {
  const result = await page.evaluate(
    async ({ id, event }) => {
      const { model, scene, audio } = window.__game,
        { troopCue } = await import('/src/game/troop-sounds.ts'),
        { iso } = await import('/src/game/scene.ts'),
        unit = model.battle.units.find((u) => u.id === id),
        at = event === 'deploy' ? unit.spawnedAt : unit.native.lastAttackAt,
        key = event === 'deploy' ? `troop:${id}:deploy` : `troop:${id}:attack:${at}`,
        before = JSON.stringify(model.battle),
        cues = scene.lastCues.filter((c) => c.key === key),
        expected = troopCue(model.battle, unit, event, key, at);
      scene.santaPresentation.render(model.battle, false, true, 1, iso, scene.lastCues);
      const node = audio.samples.active.get(key);
      if (!node) throw Error(`${unit.kind} ${event} did not reach Web Audio`);
      const result = {
        cues,
        expected,
        pitch: node.source.playbackRate.value,
        gain: node.gain.gain.value,
        readOnly: before === JSON.stringify(model.battle),
      };
      scene.santaPresentation.render(model.battle, false, false, 1, iso, scene.lastCues);
      return result;
    },
    { id, event },
  );
  expect(result.cues).toEqual([result.expected]);
  expect(result.pitch).toBeCloseTo(result.expected.pitch, 6);
  expect(result.gain).toBeCloseTo(result.expected.volume * 0.12, 6);
  expect(result.readOnly).toBe(true);
}

async function dust(page: Page, shotId: string) {
  await expect
    .poll(
      () =>
        page.evaluate((shotId) => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return [...scene.nativeProjectiles.layer.views.entries()].some(
            ([key, view]) =>
              key.startsWith(`projectile:${shotId}:hit`) &&
              view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING'),
          );
        }, shotId),
      { timeout: 15000 },
    )
    .toBe(true);
}

for (const c of [
  { level: 1, width: 390 },
  { level: 12, width: 1440 },
])
  test(`Super Hog split ${c.level} warms original landing particles and voices at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = superHogSplitRecording(c.level),
      errors = await scout(page, r.data, ['superhog', 'superrider'], c.width, true);
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Split feedback replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    await seek(page, r.died, r.hogId!);
    await voice(page, r.hogId!, 'deploy');
    await seek(page, r.landed!, r.riderId!);
    await voice(page, r.riderId!, 'deploy');
    const landed = await seek(page, r.later!, r.riderId!);
    await dust(page, r.shotId!);
    expect(landed.readOnly).toBe(true);
    await page.screenshot({ path: `output/playtest/super-hog-feedback-${c.level}-${c.width}.png` });
    await seek(page, r.wounded, r.id);
    expect(await seek(page, r.later!, r.riderId!)).toEqual(landed);
    await dust(page, r.shotId!);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('Puppet-only armies warm Hog attack samples before the first wave', async ({ page }) => {
  test.setTimeout(120000);
  const r = hogPuppetRecording(18),
    errors = await scout(page, r.data, ['hogrider'], 390);
  const id = await page.evaluate(() => {
    const { model, scene } = window.__game;
    if (
      !model.deployNativeHero('champion', 11.4, 11.5) ||
      !model.activateNativeHeroAbility('champion')
    )
      throw Error('Puppet feedback activation failed');
    const unit = model.battle.units.find((u) => u.kind === 'hogrider');
    while (!unit.native?.attacks) {
      if (model.battle.elapsed > 5) throw Error('Puppet first attack missing');
      model.step(0.05);
    }
    scene.sync();
    scene.drawOverlay(0);
    return unit.id;
  });
  await voice(page, id, 'attack');
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  expect(errors).toEqual([]);
});
