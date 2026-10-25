import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(11, 11.5);
    scene.cameras.main.setZoom(innerWidth === 390 ? 0.95 : 2).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    const shot = model.battle.projectiles?.find(
      (shot) => shot.sourceId === window.__monolithHousing.queenId,
    );
    return {
      housing: model.battle.nativeMonolithHousing,
      name: shot?.native?.name,
      damage: shot?.damage,
      recalled: model.battle.recalledHp?.giant?.length ?? 0,
    };
  }, at);
}

for (const width of [1440, 390]) {
  test(`Monolith Arrow housing tiers and Recall at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const times = await page.evaluate(async () => {
      const { monolithHousingRecording } =
        await import('/tests/fixtures/monolith-arrow-housing.ts');
      const recording = monolithHousingRecording();
      window.__monolithHousing = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(recording.data)) throw Error('Monolith housing replay rejected');
      scene.sync();
      return {
        at180: recording.at180,
        at181: recording.at181,
        at250: recording.at250,
        at251: recording.at251,
        recalled: recording.recalled,
        redeployed: recording.redeployed,
      };
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const states = [];
    for (const [at, housing, tier] of [
      [times.at180, 180, 3],
      [times.at181, 181, 2],
      [times.at250, 250, 2],
      [times.at251, 251, 1],
    ]) {
      const state = await seek(page, at);
      expect(state.housing).toBe(housing);
      expect(state.name).toBe(`ArcherQueenMonolithProjectile${tier}`);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const shot = model.battle.projectiles.find(
              (shot) => shot.sourceId === window.__monolithHousing.queenId,
            );
            const entry = scene.nativeProjectiles.views.get(shot.id);
            return (
              !!entry &&
              entry.view.objects.some(
                (object) =>
                  object.visible && object.alpha > 0 && object.texture?.key !== '__MISSING',
              )
            );
          }),
        )
        .toBe(true);
      states.push(state);
    }
    await page.screenshot({ path: `output/playtest/monolith-housing-${width}.png` });
    const recalled = await seek(page, times.recalled);
    const redeployed = await seek(page, times.redeployed);
    expect(recalled.housing).toBe(251);
    expect(recalled.recalled).toBeGreaterThan(0);
    expect(redeployed.housing).toBe(251);
    expect(redeployed.recalled).toBe(recalled.recalled - 3);
    expect(await seek(page, times.at181)).toEqual(states[1]);
    expect(await seek(page, times.at251)).toEqual(states[3]);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__monolithHousing.data, version: 71 }))
        throw Error('Version 71 Monolith housing replay rejected');
      scene.sync();
    });
    const older = await seek(page, times.at181);
    expect(older.housing).toBeUndefined();
    expect(older.name).toBe('ArcherQueenMonolithProjectile3');
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
