import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units[0];
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(unit.x, unit.y);
    scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    return { hp: unit.hp, poison: unit.native.effects.poison };
  }, at);
}

for (const width of [1440, 390]) {
  test(`Defensive Poison clocks survive portable seeks at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const times = await page.evaluate(async () => {
      const { attackerPoisonRecording } = await import('/tests/fixtures/attacker-poison.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const recording = attackerPoisonRecording();
      window.__attackerPoisonRecording = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
        throw Error('Defensive Poison replay rejected');
      scene.sync();
      return recording.snapshots.map((snapshot) => snapshot.at);
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const later = await seek(page, times.at(-1)!);
    const earlier = await seek(page, times[0]);
    expect(earlier.hp).toBeGreaterThan(later.hp);
    expect(await seek(page, times.at(-1)!)).toEqual(later);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          scene.drawOverlay(0);
          const objects =
            scene.troopNativePresentation.views.get(model.battle.units[0].id)?.view.objects ?? [];
          return objects.some(
            (object) => object.visible && object.alpha > 0 && object.tint === 0xa6e57a,
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/attacker-poison-clock-${width}.png` });
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__attackerPoisonRecording.data, version: 65 }))
        throw Error('Version 65 replay rejected');
      scene.sync();
    });
    expect((await seek(page, times.at(-1)!)).hp).toBeLessThan(later.hp);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
