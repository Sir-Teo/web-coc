import { expect, test } from '@playwright/test';
import { deploymentLifecycleRecording } from '../fixtures/deployment-lifecycle';

for (const c of [
  { version: 182, level: 1, pekka: 1, wizard: 1, width: 390 },
  { version: 182, level: 2, pekka: 8, wizard: 9, width: 1440 },
  { version: 182, level: 6, pekka: 13, wizard: 14, width: 390 },
  { version: 181, level: 1, pekka: 1, wizard: 1, width: 1440 },
  { version: 181, level: 2, pekka: 8, wizard: 9, width: 390 },
  { version: 181, level: 6, pekka: 13, wizard: 14, width: 1440 },
] as const)
  test(`Siege Barracks ${c.level} roster and source tiers, version ${c.version} at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = deploymentLifecycleRecording('siegebarracks', c.version, c.level, {
        pekka: c.pekka,
        wizard: c.wizard,
      }),
      hasPekka = c.version === 182 || c.level === 1,
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
    });
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
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
    }, r.data);
    await page.waitForFunction(
      async ({ level, pekka, wizard, hasPekka }) => {
        const { scene, audio } = window.__game,
          { nativeUnitStats } = await import('/src/game/native-units.ts'),
          { nativeProjectilePack } = await import('/src/game/native-projectile-poses.ts'),
          { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts'),
          tiers = [
            ['siegebarracks', level],
            ['wizard', wizard],
            ...(hasPekka ? [['pekka', pekka]] : []),
          ],
          shot = nativeUnitStats('wizard', wizard).projectile;
        return (
          tiers.every(([kind, level]) =>
            scene.troopNativePresentation.levelsReady.get(kind)?.has(level),
          ) &&
          scene.nativeProjectiles.packs.packs.has(nativeProjectilePack(shot)) &&
          (hasPekka ? ['pekka', 'wizard'] : ['wizard']).every((kind) =>
            troopSoundFiles(kind).every((file) => audio.samples.has(troopSample(file))),
          )
        );
      },
      { ...c, hasPekka },
    );
    expect(await page.evaluate(() => window.__game.model.battle.units)).toEqual([]);
    if (!hasPekka)
      expect(
        await page.evaluate(() => window.__game.scene.troopNativePresentation.packs.has('pekka')),
      ).toBe(false);
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Barracks replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    await page.waitForFunction(
      ({ pekka, wizard, hasPekka }) => {
        const levels = window.__game.scene.troopNativePresentation.levelsReady;
        return levels.get('wizard')?.has(wizard) && (!hasPekka || levels.get('pekka')?.has(pekka));
      },
      { ...c, hasPekka },
    );
    const seek = (at: number) =>
      page.evaluate(
        async ({ at, id }) => {
          const { model, scene } = window.__game,
            { iso } = await import('/src/game/scene.ts');
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          model.changed();
          scene.sync();
          const unit = model.battle.units.find((u) => u.id === id),
            p = iso(unit.x, unit.y),
            before = JSON.stringify(model.battle);
          scene.cameras.main.useBounds = false;
          scene.cameras.main.setZoom(innerWidth < 500 ? 1.3 : 1.6).centerOn(p.x, p.y - 40);
          scene.cameras.main.preRender();
          scene.drawOverlay(0);
          return { battle: before, readOnly: before === JSON.stringify(model.battle) };
        },
        { at, id: r.id },
      );
    for (const s of r.snapshots) {
      const result = await seek(s.at);
      expect(JSON.parse(result.battle)).toEqual(s.battle);
      expect(result.readOnly).toBe(true);
    }
    const born = await seek(r.children);
    const bodies = await page.evaluate((id) => {
      const { model, scene } = window.__game,
        units = model.battle.units.filter((u) => u.native?.owner === id);
      return {
        kinds: units.map((u) => u.kind),
        tiers: units.map((u) => u.level),
        visible: units.every((u) =>
          scene.troopNativePresentation.views
            .get(u.id)
            ?.view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING'),
        ),
      };
    }, r.id);
    expect(bodies.kinds).toEqual(Array(c.level >= 5 ? 2 : 1).fill(hasPekka ? 'pekka' : 'wizard'));
    expect(bodies.tiers).toEqual(
      bodies.kinds.map((kind) => (kind === 'pekka' ? c.pekka : c.wizard)),
    );
    expect(bodies.visible).toBe(true);
    await page.screenshot({
      path: `output/playtest/siege-barracks-roster-${c.level}-${c.version}-${c.width}.png`,
    });
    await seek(r.entered);
    expect(await seek(r.children)).toEqual(born);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(born.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
