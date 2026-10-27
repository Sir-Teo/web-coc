import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const recording = window.__defenderFrost;
    const defender = model.battle.defenders.find((d) => d.id === recording.defenderId);
    const queen = model.battle.units.find((u) => u.id === recording.queenId);
    const shot = model.battle.projectiles?.find((p) => p.sourceId === recording.queenId);
    const { iso } = await import('/src/game/scene.ts');
    const point = queen
      ? iso((queen.x + defender.x) / 2, (queen.y + defender.y) / 2)
      : iso(defender.x, defender.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.3 : 1.8).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    const { defenderFrostScales } = await import('/src/game/defender-frost.ts');
    return {
      frost: defender.frost,
      scales: defenderFrostScales(defender, model.battle.elapsed),
      queen: !!queen,
      hp: defender.hp,
      maxHp: defender.maxHp,
      projectile: shot?.native?.name,
      captured: shot?.native?.frost,
      toAir: shot?.toAir,
    };
  }, at);
}

for (const width of [1440, 390]) {
  test(`Frozen Arrow slows a defending ${width === 390 ? 'air' : 'ground'} Hero after Recall at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    if (width === 390) await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const times = await page.evaluate(async (air) => {
      const { defenderFrostRecording } = await import('/tests/fixtures/defender-frost.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const recording = defenderFrostRecording(air);
      window.__defenderFrost = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
        throw Error('Defender frost replay rejected');
      scene.sync();
      return {
        flight: recording.flight,
        hit: recording.hit,
        recalled: recording.recalled,
        finalHit: recording.finalHit,
        expired: recording.expired,
        deadline: recording.deadline,
        direct: recording.shots.reduce((sum, shot) => sum + shot.damage, 0),
      };
    }, width === 390);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const flight = await seek(page, times.flight);
    expect(flight.projectile).toBe('QueenFrostyProjectile');
    expect(flight.captured).toEqual({ seconds: 0.75, percent: 0.25 });
    expect(flight.toAir).toBe(width === 390);
    expect(flight.frost).toBeUndefined();
    if (width === 1440) {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const shot = model.battle.projectiles.find(
              (p) => p.sourceId === window.__defenderFrost.queenId,
            );
            return (
              scene.nativeProjectiles.views
                .get(shot.id)
                ?.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                ) ?? false
            );
          }),
        )
        .toBe(true);
      await page.screenshot({ path: `output/playtest/defender-frost-flight-${width}.png` });
    }
    const hit = await seek(page, times.hit);
    expect(hit.scales).toEqual({ move: 0.75, attack: 0.75 });
    expect((await seek(page, times.recalled)).queen).toBe(false);
    const finalHit = await seek(page, times.finalHit);
    expect(finalHit.frost).toEqual({ until: times.deadline, percent: 0.25 });
    expect(finalHit.maxHp - finalHit.hp).toBeCloseTo(times.direct, 9);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.children.list.some(
            (o) =>
              o.visible &&
              o.alpha > 0 &&
              o.getData?.('nativeHero') === window.__defenderFrost.defenderId &&
              o.tintTopLeft === 0xa8e6ff,
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/defender-frost-hit-${width}.png` });
    expect((await seek(page, times.expired)).scales).toEqual({ move: 1, attack: 1 });
    expect(await seek(page, times.hit)).toEqual(hit);
    expect(await seek(page, times.finalHit)).toEqual(finalHit);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__defenderFrost.data, version: 76 }))
        throw Error('Version 76 defender frost replay rejected');
      scene.sync();
    });
    const old = await seek(page, times.hit);
    expect(old.frost).toBeUndefined();
    expect(old.scales).toEqual({ move: 1, attack: 1 });
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
