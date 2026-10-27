import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const recording = window.__championHaste;
    const u = model.battle.units.find((u) => u.id === recording.unitId);
    const { iso } = await import('/src/game/scene.ts');
    const { heroAttackInterval } = await import('/src/game/native-hero-abilities.ts');
    const point = iso(u.x, u.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.2 : 1.8).centerOn(point.x, point.y - 25);
    scene.drawOverlay(0);
    return {
      cooldown: u.cooldown,
      rate: heroAttackInterval(u, model.battle.elapsed, recording.baseInterval),
      attacking: u.attacking,
      damage: model.battle.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0),
    };
  }, at);
}

for (const { width, level } of [
  { width: 1440, level: 1 },
  { width: 390, level: 18 },
]) {
  test(`Haste Vial ${level} changes actual Champion attacks at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const expected = await page.evaluate(async (level) => {
      const { championHasteRecording } = await import('/tests/fixtures/champion-haste.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const { heroArtDirectory } = await import('/src/game/hero-native-scene.ts');
      const recording = championHasteRecording(level);
      window.__championHaste = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
        throw Error('Haste Champion replay rejected');
      scene.sync();
      const atlas = await (
        await fetch(`${heroArtDirectory('heroes-native/champion')}/atlas.json`)
      ).json();
      const frame = atlas.states.attack.frames[1][1];
      return {
        active: recording.active,
        expired: recording.expired,
        normal: recording.normal,
        interval: recording.interval,
        base: recording.baseInterval,
        frame: `${frame.x}:${frame.y}:${frame.w}:${frame.h}`,
      };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const active = await seek(page, expected.active);
    expect(active.attacking).toBe(true);
    expect(active.rate).toBeCloseTo(level === 1 ? 0.75 / 1.05 : 0.6 / 1.16, 12);
    expect(active.cooldown).toBeCloseTo(expected.interval - 0.15, 9);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.children.list.find(
            (o) =>
              o.visible &&
              o.alpha > 0 &&
              o.getData?.('nativeHero') === window.__championHaste.unitId,
          )?.frame?.name;
        }),
      )
      .toBe(expected.frame);
    await page.screenshot({ path: `output/playtest/champion-haste-${level}-${width}.png` });
    expect((await seek(page, expected.expired)).rate).toBe(expected.base);
    const normal = await seek(page, expected.normal);
    expect(await seek(page, expected.active)).toEqual(active);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__championHaste.data, version: 77 }))
        throw Error('Version 77 Haste replay rejected');
      scene.sync();
    });
    const oldActive = await seek(page, expected.active);
    expect(oldActive.rate).toBe(level === 1 ? 0.75 : 0.6);
    expect(oldActive.cooldown).toBeGreaterThan(active.cooldown);
    expect((await seek(page, expected.normal)).damage).toBeLessThan(normal.damage);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
