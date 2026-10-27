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

for (const actor of ['giant', 'king'] as const)
  for (const width of [1440, 390]) {
    test(`Defensive Poison on ${actor} survives portable seeks at ${width}px`, async ({ page }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const times = await page.evaluate(async (actor) => {
        const { attackerPoisonRecording } = await import('/tests/fixtures/attacker-poison.ts');
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        const recording = attackerPoisonRecording(actor === 'king' ? 0.05 : 1, actor);
        window.__attackerPoisonRecording = recording;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
          throw Error('Defensive Poison replay rejected');
        scene.sync();
        return recording.snapshots.map((snapshot) => snapshot.at);
      }, actor);
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      const later = await seek(page, times.at(-1)!);
      expect(later.poison.speed).toBe(actor === 'king' ? -0.17 : -0.35);
      const earlier = await seek(page, times[0]);
      expect(earlier.hp).toBeGreaterThan(later.hp);
      expect(await seek(page, times.at(-1)!)).toEqual(later);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const unit = model.battle.units[0];
            const objects = unit.hero
              ? scene.children.list.filter((object) => object.getData?.('nativeHero') === unit.id)
              : (scene.troopNativePresentation.views.get(unit.id)?.view.objects ?? []);
            return objects.some(
              (object) =>
                object.visible &&
                object.alpha > 0 &&
                (object.tint === 0xa6e57a || object.tintTopLeft === 0xa6e57a),
            );
          }),
        )
        .toBe(true);
      await page.screenshot({ path: `output/playtest/attacker-poison-${actor}-${width}.png` });
      await page.evaluate((actor) => {
        const { model, scene } = window.__game;
        model.returnHome();
        if (
          !model.openReplay({
            ...window.__attackerPoisonRecording.data,
            version: actor === 'king' ? 66 : 65,
          })
        )
          throw Error('Legacy Poison replay rejected');
        scene.sync();
      }, actor);
      const old = await seek(page, times.at(-1)!);
      if (actor === 'king') expect(old.poison.speed).toBe(-0.35);
      else expect(old.hp).toBeLessThan(later.hp);
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
      expect(errors).toEqual([]);
    });
  }
