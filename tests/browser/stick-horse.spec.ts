import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const recording = window.__stickHorse;
    const u = model.battle.units.find((u) => u.id === recording.unitId);
    const { iso } = await import('/src/game/scene.ts');
    const { heroAttackInterval } = await import('/src/game/native-hero-abilities.ts');
    const point = iso(u.x, u.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.2 : 1.8).centerOn(point.x, point.y - 25);
    scene.drawOverlay(0);
    return {
      x: u.x,
      wallDamage: model.battle.buildings
        .filter((b) => b.kind === 'wall')
        .reduce((sum, b) => sum + b.maxHp - b.hp, 0),
      cooldown: u.cooldown,
      rate: heroAttackInterval(u, model.battle.elapsed, recording.baseInterval),
      attacking: u.attacking,
      damage: model.battle.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0),
    };
  }, at);
}

for (const { width, level } of [
  { width: 1440, level: 1 },
  { width: 390, level: 27 },
]) {
  test(`Stick Horse ${level} changes King attacks and wall traversal at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const expected = await page.evaluate(async (level) => {
      const { stickHorseRecording } = await import('/tests/fixtures/stick-horse.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const { heroArtDirectory } = await import('/src/game/hero-native-scene.ts');
      const recording = stickHorseRecording(level);
      window.__stickHorse = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
        throw Error('Stick Horse replay rejected');
      scene.sync();
      const atlas = await (
        await fetch(`${heroArtDirectory('heroes-native/king')}/atlas.json`)
      ).json();
      const frame = atlas.states.attack.frames[1][1];
      return {
        active: recording.active,
        expired: recording.expired,
        normal: recording.ordinary,
        interval: recording.interval,
        base: recording.baseInterval,
        frame: `${frame.x}:${frame.y}:${frame.w}:${frame.h}`,
      };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const active = await seek(page, expected.active);
    expect(active.attacking).toBe(true);
    expect(active.rate).toBeCloseTo(level === 1 ? 1.17 : 0.9, 12);
    expect(active.cooldown).toBeCloseTo(expected.interval - 0.2, 9);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.children.list.find(
            (o) =>
              o.visible && o.alpha > 0 && o.getData?.('nativeHero') === window.__stickHorse.unitId,
          )?.frame?.name;
        }),
      )
      .toBe(expected.frame);
    await page.screenshot({ path: `output/playtest/stick-horse-${level}-${width}.png` });
    expect((await seek(page, expected.expired)).rate).toBe(expected.base);
    const normal = await seek(page, expected.normal);
    expect(await seek(page, expected.active)).toEqual(active);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__stickHorse.data, version: 82 }))
        throw Error('Version 82 Stick Horse replay rejected');
      scene.sync();
    });
    const oldActive = await seek(page, expected.active);
    expect(oldActive.rate).toBe(expected.interval);
    expect(oldActive.cooldown).toBeGreaterThan(active.cooldown);
    const oldNormal = await seek(page, expected.normal);
    // At 20 Hz, the 1.17 s and 1.20 s intervals can produce the same hit count here.
    // Their actual cooldown resets are checked above; the larger tier gains whole attacks.
    expect(oldNormal.damage).toBeLessThanOrEqual(normal.damage);
    if (level === 27) expect(oldNormal.damage).toBeLessThan(normal.damage);
    const crossed = await page.evaluate(async (level) => {
      const { stickHorseWallRecording } = await import('/tests/fixtures/stick-horse.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const recording = stickHorseWallRecording(level);
      window.__stickHorse = recording;
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
        throw Error('Stick Horse wall replay rejected');
      scene.sync();
      return recording.crossed;
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const wall = await seek(page, crossed);
    expect(wall.x).toBeGreaterThan(9);
    expect(wall.wallDamage).toBe(0);
    await page.screenshot({ path: `output/playtest/stick-horse-wall-${level}-${width}.png` });
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, crossed)).toEqual(wall);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__stickHorse.data, version: 82 }))
        throw Error('Legacy wall replay rejected');
    });
    const oldWall = await seek(page, crossed);
    expect(oldWall.x).toBeLessThan(8);
    expect(oldWall.wallDamage).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
