import { expect, test, type Page } from '@playwright/test';
import { attackingWitchRecording } from '../fixtures/attacking-witch';

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
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.25 : 1.7).centerOn(p.x, p.y - 40);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle, readOnly: battle === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}
for (const c of [
  { version: 166, width: 390, superTroop: false, level: 1, x: 17.6, garrison: false },
  { version: 166, width: 1440, superTroop: false, level: 8, x: 23.1, garrison: 'ground' },
  { version: 166, width: 390, superTroop: true, level: 8, x: 23.1, garrison: 'air' },
  { version: 166, width: 1440, superTroop: true, level: 1, x: 17.6, garrison: false },
  { version: 165, width: 1440, superTroop: false, level: 1, x: 17.6, garrison: false },
  { version: 165, width: 390, superTroop: false, level: 8, x: 23.1, garrison: 'ground' },
  { version: 165, width: 1440, superTroop: true, level: 8, x: 23.1, garrison: 'air' },
  { version: 165, width: 390, superTroop: true, level: 1, x: 17.6, garrison: false },
])
  test(`${c.superTroop ? 'Super Witch' : 'Witch'} ${c.level} original windup at ${c.width}px, version=${c.version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    const r = attackingWitchRecording(
        c.version,
        c.x,
        c.level,
        c.superTroop,
        c.garrison as false | 'ground' | 'air',
      ),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Witch replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    const flightAt = r.defenderReleased ?? r.first,
      flightId = r.defenderShotId ?? r.shotId;
    await seek(page, flightAt, r.id);
    if (c.version === 166 || !c.garrison) {
      await expect
        .poll(
          () =>
            page.evaluate((shotId) => {
              const scene = window.__game.scene;
              scene.drawOverlay(0);
              return (
                scene.nativeProjectiles.views
                  .get(shotId)
                  ?.view.objects.some(
                    (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                  ) ?? false
              );
            }, flightId),
          { timeout: 30000 },
        )
        .toBe(true);
    } else {
      expect(
        await page.evaluate(
          (shotId) => window.__game.model.battle.projectiles.find((p) => p.id === shotId)?.weapon,
          flightId,
        ),
      ).toBe('arrow');
    }
    const at = r.charged ?? r.first,
      windup = await seek(page, at, r.id);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const scene = window.__game.scene;
            scene.drawOverlay(0);
            return (
              scene.troopNativePresentation.views
                .get(id)
                ?.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                ) ?? false
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    if (c.version === 166)
      expect(
        await page.evaluate(
          (id) =>
            window.__game.model.battle.units.find((u) => u.id === id).native.attackWindup
              .animationOffset,
          r.id,
        ),
      ).toBeLessThan(0);
    else
      expect(
        await page.evaluate(
          (id) => window.__game.model.battle.units.find((u) => u.id === id).native?.attackWindup,
          r.id,
        ),
      ).toBeUndefined();
    await page.screenshot({
      path: `output/playtest/attacking-witch-windup-${c.superTroop ? 'super' : 'regular'}-${c.level}-${c.version}-${c.width}.png`,
    });
    await seek(page, r.engaged, r.id);
    expect(await seek(page, at, r.id)).toEqual(windup);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      windup.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    if (c.version === 166) {
      await page.evaluate(async () => {
        const { audio } = window.__game;
        audio.enabled = true;
        audio.unlock();
        await audio.context.resume();
      });
      await seek(page, r.charged!, r.id);
      const played = await page.evaluate(
        async ({ id, first }) => {
          const { model, scene, audio } = window.__game;
          const { troopCue } = await import('/src/game/troop-sounds.ts');
          scene.battleSounds.cues(null);
          model.replay.paused = false;
          for (let i = 0; model.battle.elapsed < first - 1e-9 && i < 100; i++) model.step(0.05);
          model.replay.paused = true;
          model.changed();
          scene.sync();
          scene.drawOverlay(0);
          audio.samples.decode();
          await Promise.all([...audio.samples.decoding.values()]);
          const battle = model.battle,
            unit = battle.units.find((u) => u.id === id),
            prefix = `troop:${id}:`,
            cues = scene.battleSounds.cues(battle).filter((c) => c.key.startsWith(prefix));
          audio.samples.stop();
          audio.samples.sync(cues, battle.elapsed, 2, true);
          const voices = cues.map((c) => {
            const node = audio.samples.active.get(c.key),
              event = c.key.includes(':attack:') ? 'attack' : 'hit';
            return {
              cue: c,
              expected: troopCue(battle, unit, event, c.key, first),
              decoded: audio.samples.has(c.sample),
              gain: node?.gain.gain.value,
              rate: node?.source.playbackRate.value,
            };
          });
          audio.samples.sync(cues, battle.elapsed, 2, false);
          return { at: battle.elapsed, voices, stopped: audio.samples.active.size === 0 };
        },
        { id: r.id, first: r.first },
      );
      expect(played.at).toBeCloseTo(r.first, 8);
      expect(played.voices).toHaveLength(1);
      for (const voice of played.voices) {
        expect(voice.cue).toEqual(voice.expected);
        expect(voice.decoded).toBe(true);
        // AudioParam values are stored as Float32 by Web Audio.
        expect(voice.gain).toBeCloseTo(voice.cue.volume * 0.12, 6);
        expect(voice.rate).toBeCloseTo(voice.cue.pitch * 2, 6);
      }
      expect(played.stopped).toBe(true);
    }
    expect(errors).toEqual([]);
  });
