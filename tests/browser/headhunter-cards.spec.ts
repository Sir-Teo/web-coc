import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((unit) => unit.id === window.__headhunterCards.unitId);
    const hero = model.battle.defenders.find(
      (defender) => defender.id === window.__headhunterCards.defenderId,
    );
    const { iso } = await import('/src/game/scene.ts');
    const point = iso((unit.x + hero.x) / 2, (unit.y + hero.y) / 2);
    scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    const shot = model.battle.projectiles?.find((shot) => shot.sourceId === unit.id);
    return {
      hp: hero.hp,
      maxHp: hero.maxHp,
      weapon: shot?.weapon,
      native: shot?.native?.name,
      damage: shot?.damage,
      launched: shot?.launched,
      impact: shot?.impact,
      toAir: shot?.toAir,
    };
  }, at);
}

for (const air of [false, true])
  for (const width of [1440, 390]) {
    test(`Headhunter native card against ${air ? 'air' : 'ground'} at ${width}px`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const times = await page.evaluate(async (air) => {
        const { headhunterHeroRecording } =
          await import('/tests/fixtures/headhunter-hero-rules.ts');
        const recording = headhunterHeroRecording(air);
        window.__headhunterCards = recording;
        const shot = recording.snapshots[0].battle.projectiles.find(
          (shot) => shot.sourceId === recording.unitId,
        );
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(recording.data))
          throw Error('Native Headhunter card replay rejected');
        scene.sync();
        return { flight: recording.flight, before: shot.launched + 0.15, hit: recording.hit };
      }, air);
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      const flight = await seek(page, times.flight);
      expect(flight.weapon).toBe('native');
      expect(flight.native).toBe('Headhunter_Card_lvl1');
      expect(flight.damage).toBe(252);
      expect(flight.toAir).toBe(air);
      expect(flight.impact! - flight.launched!).toBeCloseTo(2.5 / 14, 12);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const shot = model.battle.projectiles.find(
              (shot) => shot.sourceId === window.__headhunterCards.unitId,
            );
            const entry = scene.nativeProjectiles.views.get(shot.id);
            return (
              !!entry &&
              entry.view.objects.some(
                (object) =>
                  object.visible &&
                  object.alpha > 0 &&
                  object.texture?.key &&
                  object.texture.key !== '__MISSING' &&
                  object.texture.key !== '__DEFAULT',
              )
            );
          }),
        )
        .toBe(true);
      await page.screenshot({
        path: `output/playtest/headhunter-card-${air ? 'air' : 'ground'}-${width}.png`,
      });
      const before = await seek(page, times.before);
      expect(before.hp).toBe(before.maxHp);
      const hit = await seek(page, times.hit);
      expect(hit.maxHp - hit.hp).toBe(252);
      expect(await seek(page, times.flight)).toEqual(flight);
      expect(await seek(page, times.hit)).toEqual(hit);
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.returnHome();
        if (!model.openReplay({ ...window.__headhunterCards.data, version: 73 }))
          throw Error('Version 73 Headhunter arrow replay rejected');
        scene.sync();
      });
      const older = await seek(page, times.flight);
      expect(older.weapon).toBe('arrow');
      expect(older.native).toBeUndefined();
      expect(older.impact! - older.launched!).toBeCloseTo(2.5 / 18, 12);
      const oldBefore = await seek(page, times.before);
      expect(oldBefore.maxHp - oldBefore.hp).toBe(252);
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
      expect(errors).toEqual([]);
    });
  }
