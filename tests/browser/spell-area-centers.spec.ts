import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts');
    const center = window.__spellAreaCenters.center;
    const point = iso(center.x, center.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 0.65 : 1.2).centerOn(point.x, point.y - 50);
    scene.drawOverlay(0);
    const unit = model.battle.units.find((unit) => unit.id === window.__spellAreaCenters.giantId);
    const dx = unit.x - center.x,
      dy = unit.y - center.y;
    return {
      boost: unit.native?.effects?.boost,
      distance: Math.sqrt(dx * dx + dy * dy),
      x: unit.x,
      y: unit.y,
    };
  }, at);
}

for (const width of [1440, 390]) {
  test(`Rage applies at the aimed ring boundary and preserves older playback at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    if (width === 390) await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const times = await page.evaluate(async () => {
      const { spellAreaCenterRecording } = await import('/tests/fixtures/spell-area-centers.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const recording = spellAreaCenterRecording();
      window.__spellAreaCenters = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
        throw Error('Spell area-center replay rejected');
      scene.sync();
      return { before: recording.before, hit: recording.hit, later: recording.later };
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const before = await seek(page, times.before);
    expect(before.distance).toBeCloseTo(4.9, 6);
    expect(before.boost).toBeUndefined();
    const hit = await seek(page, times.hit);
    expect(hit.distance).toBeCloseTo(4.9, 6);
    expect(hit.boost?.damage).toBeCloseTo(1.3, 12);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.troopNativePresentation.drewUnit(window.__spellAreaCenters.giantId);
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/spell-area-center-${width}.png` });
    expect((await seek(page, times.later)).boost?.damage).toBeCloseTo(1.3, 12);
    expect(await seek(page, times.before)).toEqual(before);
    expect(await seek(page, times.hit)).toEqual(hit);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__spellAreaCenters.data, version: 74 }))
        throw Error('Version 74 area-center replay rejected');
      scene.sync();
    });
    expect((await seek(page, times.hit)).boost).toBeUndefined();
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
