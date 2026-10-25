import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const recording = window.__queenVial;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((u) => u.id === recording.unitId);
    const shot = model.battle.projectiles?.find((p) => p.sourceId === recording.unitId);
    const { iso } = await import('/src/game/scene.ts');
    const { heroExtraDamage } = await import('/src/game/native-hero-abilities.ts');
    const point = unit ? iso(unit.x, unit.y) : iso(13.5, 11.5);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.3 : 1.8).centerOn(point.x, point.y - 25);
    scene.drawOverlay(0);
    return {
      queen: !!unit,
      extra: unit ? heroExtraDamage(unit, model.battle.elapsed) : 0,
      damage: model.battle.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0),
      shotDamage: shot?.damage,
      shotNative: shot?.native?.name,
    };
  }, at);
}

for (const { width, level, recall } of [
  { width: 1440, level: 1, recall: false },
  { width: 390, level: 18, recall: true },
]) {
  test(`Queen Vial ${level} damage survives ${recall ? 'Recall' : 'expiry'} at ${width}px`, async ({
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
    const expected = await page.evaluate(
      async ({ level, recall }) => {
        const { queenVialRecording } = await import('/tests/fixtures/queen-vial.ts');
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        const recording = queenVialRecording(level, recall);
        window.__queenVial = recording;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
          throw Error('Queen Vial replay rejected');
        scene.sync();
        return {
          active: recording.active,
          final: recording.final,
          recalled: recording.snapshots[1].at,
          base: recording.baseDamage,
          extra: level === 1 ? 340 : 1740,
        };
      },
      { level, recall },
    );
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const active = await seek(page, expected.active);
    expect(active.extra).toBe(expected.extra);
    expect(active.shotDamage).toBe(expected.base + expected.extra);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.children.list.find(
            (o) => o.visible && o.getData?.('nativeHero') === window.__queenVial.unitId,
          )?.alpha;
        }),
      )
      .toBe(0.35);
    if (width === 1440) {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const shot = model.battle.projectiles.find(
              (p) => p.sourceId === window.__queenVial.unitId,
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
    }
    await page.screenshot({ path: `output/playtest/queen-vial-${level}-${width}.png` });
    if (recall) {
      const recalled = await seek(page, expected.recalled);
      expect(recalled.queen).toBe(false);
      expect(recalled.shotDamage).toBe(expected.base + expected.extra);
    }
    const final = await seek(page, expected.final);
    expect(final.extra).toBe(0);
    expect(final.queen).toBe(!recall);
    expect(await seek(page, expected.active)).toEqual(active);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__queenVial.data, version: 79 }))
        throw Error('Version 79 Queen Vial replay rejected');
      scene.sync();
    });
    expect((await seek(page, expected.active)).shotDamage).toBe(expected.base);
    expect((await seek(page, expected.final)).damage).toBeLessThan(final.damage);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
