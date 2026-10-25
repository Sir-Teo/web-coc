import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const recording = window.__attackerHitPoison;
    const defender = model.battle.defenders.find(
      (defender) => defender.id === recording.defenderId,
    );
    const actor = model.battle.units.find((unit) => unit.id === recording.actorId);
    const shot = model.battle.projectiles?.find((shot) => shot.sourceId === recording.actorId);
    const { iso } = await import('/src/game/scene.ts');
    const point = actor
      ? iso((actor.x + defender.x) / 2, (actor.y + defender.y) / 2)
      : iso(defender.x, defender.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.3 : 1.8).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    return {
      hp: defender.hp,
      maxHp: defender.maxHp,
      poison: defender.hitPoison,
      actor: !!actor,
      projectile: shot?.native?.name,
      toAir: shot?.toAir,
    };
  }, at);
}

for (const kind of ['headhunter', 'lizard'] as const)
  for (const width of [1440, 390]) {
    test(`${kind} poisons a defending ${width === 390 ? 'air' : 'ground'} Hero after Recall at ${width}px`, async ({
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
      const times = await page.evaluate(
        async ({ kind, air }) => {
          const { attackerHitPoisonRecording } =
            await import('/tests/fixtures/attacker-hit-poison.ts');
          const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
          const recording = attackerHitPoisonRecording(kind, air);
          window.__attackerHitPoison = recording;
          const { model, scene } = window.__game;
          scene.paused = true;
          if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
            throw Error('Attacker on-hit poison replay rejected');
          scene.sync();
          return {
            flight: recording.flight,
            hit: recording.hit,
            recalled: recording.recalled,
            green: recording.green,
            expired: recording.expired,
            deadline: recording.deadline,
            dps: recording.dps,
            direct: recording.direct,
            total: recording.total,
          };
        },
        { kind, air: width === 390 },
      );
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      const flight = await seek(page, times.flight);
      expect(flight.poison).toBeUndefined();
      expect(flight.projectile).toBe(
        kind === 'headhunter' ? 'Headhunter_Card_lvl1' : 'fireIguanaProto',
      );
      expect(flight.toAir).toBe(width === 390);
      const hit = await seek(page, times.hit);
      expect(hit.poison?.dps).toBe(times.dps);
      const recalled = await seek(page, times.recalled);
      expect(recalled.actor).toBe(false);
      expect(recalled.poison?.until).toBeCloseTo(times.deadline, 12);
      const green = await seek(page, times.green);
      expect(green.hp).toBeLessThan(recalled.hp);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            const id = window.__attackerHitPoison.defenderId;
            return scene.children.list.some(
              (object) =>
                object.visible &&
                object.alpha > 0 &&
                object.getData?.('nativeHero') === id &&
                object.tintTopLeft === 0xa6e57a,
            );
          }),
        )
        .toBe(true);
      await page.screenshot({ path: `output/playtest/attacker-hit-poison-${kind}-${width}.png` });
      const expired = await seek(page, times.expired);
      expect(expired.poison).toBeUndefined();
      expect(expired.maxHp - expired.hp).toBeCloseTo(times.total, 6);
      expect(await seek(page, times.hit)).toEqual(hit);
      expect(await seek(page, times.green)).toEqual(green);
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.returnHome();
        if (!model.openReplay({ ...window.__attackerHitPoison.data, version: 75 }))
          throw Error('Version 75 attacker poison replay rejected');
        scene.sync();
      });
      const old = await seek(page, times.expired);
      expect(old.poison).toBeUndefined();
      expect(old.maxHp - old.hp).toBeCloseTo(kind === 'headhunter' ? times.direct : 0, 6);
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
      expect(errors).toEqual([]);
    });
  }
