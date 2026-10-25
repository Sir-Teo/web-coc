import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(10.25, 11.5);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.4 : 2).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    const { buildingAttackIntervalScale } = await import('/src/game/native-status.ts');
    const shot = model.battle.projectiles?.find(
      (projectile) => projectile.sourceId === window.__frozenArrowRecording.queenId,
    );
    return {
      queen: model.battle.nativeHeroes[0].unitId,
      frost: model.battle.buildingEffects?.[2]?.frost,
      scale: buildingAttackIntervalScale(model.battle, { id: 2 }, model.battle.elapsed),
      projectile: shot?.native?.name,
      captured: shot?.native?.frost,
    };
  }, at);
}

for (const { width, reduced } of [
  { width: 1440, reduced: false },
  { width: 390, reduced: false },
  { width: 390, reduced: true },
]) {
  test(`Frozen Arrow impact after Recall at ${width}px${reduced ? ' reduced motion' : ''}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const times = await page.evaluate(async () => {
      const { frozenArrowRecording } = await import('/tests/fixtures/frozen-arrow-impact.ts');
      const recording = frozenArrowRecording();
      window.__frozenArrowRecording = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(recording.data)) throw Error('Frozen Arrow replay rejected');
      scene.sync();
      return {
        flight: recording.flight,
        recalled: recording.recalled,
        hit: recording.hit,
        expired: recording.expired,
        impact: recording.impact,
      };
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const flight = await seek(page, times.flight);
    expect(flight.projectile).toBe('QueenFrostyProjectile');
    expect(flight.captured).toEqual({ seconds: 0.75, percent: 0.25 });
    expect(flight.frost).toBeUndefined();
    const recalled = await seek(page, times.recalled);
    expect(recalled.queen).toBeNull();
    expect(recalled.projectile).toBe('QueenFrostyProjectile');
    if (!reduced) {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const shot = model.battle.projectiles.find(
              (projectile) => projectile.sourceId === window.__frozenArrowRecording.queenId,
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
      await page.screenshot({ path: `output/playtest/frozen-arrow-flight-${width}.png` });
    }
    const hit = await seek(page, times.hit);
    expect(hit.frost).toEqual({ until: times.impact + 0.75, percent: 0.25 });
    expect(hit.scale).toBeCloseTo(1 / 0.75, 9);
    expect((await seek(page, times.expired)).scale).toBe(1);
    expect(await seek(page, times.recalled)).toEqual(recalled);
    expect(await seek(page, times.hit)).toEqual(hit);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__frozenArrowRecording.data, version: 70 }))
        throw Error('Version 70 Frozen Arrow replay rejected');
      scene.sync();
    });
    expect((await seek(page, times.hit)).frost).toBeUndefined();
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
