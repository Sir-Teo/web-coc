import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const recording = window.__rocketSpear;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((u) => u.id === recording.unitId);
    const shot = model.battle.projectiles?.find((p) => p.sourceId === recording.unitId);
    const { iso } = await import('/src/game/scene.ts');
    const point =
      shot && innerWidth !== 390
        ? iso((shot.fromX + shot.x) / 2, (shot.fromY + shot.y) / 2)
        : iso(unit.x + 1, unit.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.1 : 1.6).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    return {
      x: unit.x,
      remaining: unit.native.effects?.extraDamage?.hits,
      projectile: shot?.native?.name,
      damage: shot?.damage,
      splash: shot?.splash ?? 0,
      totalDamage: model.battle.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0),
    };
  }, at);
}

for (const { width, level } of [
  { width: 1440, level: 1 },
  { width: 390, level: 27 },
]) {
  test(`Rocket Spear ${level} spends its charged throws and restores native spears at ${width}px`, async ({
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
      const { rocketSpearRecording } = await import('/tests/fixtures/rocket-spear.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const recording = rocketSpearRecording(level);
      window.__rocketSpear = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
        throw Error('Rocket Spear replay rejected');
      scene.sync();
      return {
        flight: recording.flight,
        last: recording.last,
        ordinary: recording.ordinary,
        count: recording.count,
        bonus: recording.bonus,
        base: recording.baseDamage,
      };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const nativeShotDrawn = () =>
      page.evaluate(() => {
        const { model, scene } = window.__game;
        scene.drawOverlay(0);
        const shot = model.battle.projectiles.find(
          (p) => p.sourceId === window.__rocketSpear.unitId,
        );
        return (
          !!shot &&
          (scene.nativeProjectiles.views
            .get(shot.id)
            ?.view.objects.some(
              (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
            ) ??
            false)
        );
      });
    const flight = await seek(page, expected.flight);
    expect(flight.x).toBe(5);
    expect(flight.remaining).toBe(expected.count - 1);
    expect(flight.projectile).toBe('RocketSpearProjectile');
    expect(flight.damage).toBe(expected.base + expected.bonus);
    expect(flight.splash).toBe(0.9);
    await expect.poll(nativeShotDrawn).toBe(true);
    await page.screenshot({ path: `output/playtest/rocket-spear-${level}-${width}.png` });
    const last = await seek(page, expected.last);
    expect(last.remaining).toBeUndefined();
    expect(last.projectile).toBe('RocketSpearProjectile');
    expect(last.damage).toBe(expected.base + expected.bonus);
    const ordinary = await seek(page, expected.ordinary);
    expect(ordinary.projectile).toBe('AmazonQueen_javelin');
    expect(ordinary.damage).toBe(expected.base);
    expect(ordinary.splash).toBe(0);
    await expect.poll(nativeShotDrawn).toBe(true);
    expect(await seek(page, expected.flight)).toEqual(flight);
    expect(await seek(page, expected.last)).toEqual(last);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__rocketSpear.data, version: 80 }))
        throw Error('Version 80 Rocket Spear replay rejected');
      scene.sync();
    });
    const oldFlight = await seek(page, expected.flight);
    expect(oldFlight.remaining).toBe(expected.count);
    expect(oldFlight.x).toBeGreaterThan(flight.x);
    const oldOrdinary = await seek(page, expected.ordinary);
    expect(oldOrdinary.remaining).toBe(expected.count);
    expect(oldOrdinary.totalDamage).toBeLessThan(ordinary.totalDamage);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
