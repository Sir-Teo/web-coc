import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((unit) => unit.id === window.__headhunterHero.unitId);
    const hero = model.battle.defenders.find(
      (defender) => defender.id === window.__headhunterHero.defenderId,
    );
    const { iso } = await import('/src/game/scene.ts');
    const point = iso((unit.x + hero.x) / 2, (unit.y + hero.y) / 2);
    scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    const shot = model.battle.projectiles?.find((shot) => shot.sourceId === unit.id);
    return {
      hp: hero.hp,
      maxHp: hero.maxHp,
      target: unit.defenderTarget,
      shotDamage: shot?.damage,
      toAir: shot?.toAir,
    };
  }, at);
}

for (const air of [false, true])
  for (const width of [1440, 390]) {
    test(`Headhunter targets a frozen ${air ? 'air' : 'ground'} Hero at ${width}px`, async ({
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
      const times = await page.evaluate(async (air) => {
        const { headhunterHeroRecording } =
          await import('/tests/fixtures/headhunter-hero-rules.ts');
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        const recording = headhunterHeroRecording(air);
        window.__headhunterHero = recording;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
          throw Error('Headhunter Hero replay rejected');
        scene.sync();
        return { flight: recording.flight, hit: recording.hit, defenderId: recording.defenderId };
      }, air);
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      const flight = await seek(page, times.flight);
      expect(flight.target).toBe(times.defenderId);
      expect(flight.shotDamage).toBe(252);
      expect(flight.toAir).toBe(air);
      expect(flight.hp).toBe(flight.maxHp);
      const hit = await seek(page, times.hit);
      expect(hit.maxHp - hit.hp).toBe(252);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            return (
              scene.troopNativePresentation.drewUnit(window.__headhunterHero.unitId) &&
              scene.children.list.some(
                (object) =>
                  object.visible &&
                  object.alpha > 0 &&
                  object.getData?.('nativeHero') === window.__headhunterHero.defenderId,
              )
            );
          }),
        )
        .toBe(true);
      await page.screenshot({
        path: `output/playtest/headhunter-hero-${air ? 'air' : 'ground'}-${width}.png`,
      });
      expect(await seek(page, times.flight)).toEqual(flight);
      expect(await seek(page, times.hit)).toEqual(hit);
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.returnHome();
        if (!model.openReplay({ ...window.__headhunterHero.data, version: 72 }))
          throw Error('Version 72 Headhunter Hero replay rejected');
        scene.sync();
      });
      const older = await seek(page, times.hit);
      expect(older.hp).toBe(older.maxHp);
      expect(older.target).toBeUndefined();
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
      expect(errors).toEqual([]);
    });
  }
