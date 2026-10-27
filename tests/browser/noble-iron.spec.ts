import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
}

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__nobleIron;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const hero = model.battle.nativeHeroes[0];
    const unit = model.battle.units.find((u) => u.id === hero.unitId);
    const shot = model.battle.projectiles?.find((p) => p.sourceId === hero.unitId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso((unit?.x ?? 5) + 1, unit?.y ?? 6.5);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.1 : 1.6).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    return {
      id: hero.unitId,
      remaining: unit?.native.effects?.extraDamage?.hits,
      stored: hero.recalledAttackExtra?.hits,
      abilityUsed: !!hero.abilityUsed,
      projectile: shot?.native?.name,
      damage: shot?.damage,
      fromAir: shot?.fromAir,
      totalDamage: model.battle.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0),
    };
  }, at);
}

async function nativeShot(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { model, scene } = window.__game;
        scene.drawOverlay(0);
        const id = model.battle.nativeHeroes[0].unitId;
        return scene.children.list.some(
          (o) =>
            o.visible &&
            o.alpha > 0 &&
            o.getData?.('nativeHero') === id &&
            o.texture?.key !== '__MISSING',
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { model, scene } = window.__game;
        scene.drawOverlay(0);
        const id = model.battle.nativeHeroes[0].unitId;
        const shot = model.battle.projectiles.find((p) => p.sourceId === id);
        return (
          !!shot &&
          (scene.nativeProjectiles.views
            .get(shot.id)
            ?.view.objects.some(
              (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
            ) ??
            false)
        );
      }),
    )
    .toBe(true);
}

for (const { width, level } of [
  { width: 1440, level: 1 },
  { width: 390, level: 18 },
]) {
  test(`Noble Iron ${level} grants deployment shots and depletes at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await boot(page, width);
    const expected = await page.evaluate(async (level) => {
      const { nobleIronRecording } = await import('/tests/fixtures/noble-iron.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = nobleIronRecording(level);
      window.__nobleIron = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Noble Iron replay rejected');
      scene.sync();
      return {
        flight: r.flight,
        last: r.last,
        ordinary: r.ordinary,
        count: r.count,
        bonus: r.bonus,
        base: r.baseDamage,
      };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const flight = await seek(page, expected.flight);
    expect(flight.remaining).toBe(expected.count - 1);
    expect(flight.abilityUsed).toBe(false);
    expect(flight.projectile).toBe('TurboStartProjectile');
    expect(flight.damage).toBe(expected.base + expected.bonus);
    expect(flight.fromAir).toBe(true);
    await nativeShot(page);
    await page.screenshot({ path: `output/playtest/noble-iron-${level}-${width}.png` });
    const last = await seek(page, expected.last);
    expect(last.remaining).toBeUndefined();
    expect(last.projectile).toBe('TurboStartProjectile');
    expect(last.damage).toBe(expected.base + expected.bonus);
    const ordinary = await seek(page, expected.ordinary);
    expect(ordinary.projectile).toBe('MinionHeroAttackProjectile');
    expect(ordinary.damage).toBe(expected.base);
    await nativeShot(page);
    expect(await seek(page, expected.flight)).toEqual(flight);
    expect(await seek(page, expected.last)).toEqual(last);
    if (width === 390) {
      await page.evaluate(() => window.__game.model.toggleReducedMotion());
      expect(await seek(page, expected.flight)).toEqual(flight);
      expect(await seek(page, expected.ordinary)).toEqual(ordinary);
    }
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__nobleIron.data, version: 81 }))
        throw Error('Legacy replay rejected');
    });
    expect((await seek(page, expected.ordinary)).totalDamage).toBeLessThan(ordinary.totalDamage);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}

for (const kind of ['prince', 'champion'] as const) {
  test(`Recall preserves remaining ${kind} charged shots in the game view`, async ({ page }) => {
    test.setTimeout(120000);
    await boot(page, 1440);
    const expected = await page.evaluate(async (kind) => {
      const { chargedHeroRecallRecording } = await import('/tests/fixtures/noble-iron.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = chargedHeroRecallRecording(kind);
      window.__nobleIron = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Recall replay rejected');
      scene.sync();
      return {
        recalled: r.recalled,
        redeployed: r.redeployed,
        fired: r.fired,
        remaining: r.remaining,
        bonus: r.bonus,
        base: r.baseDamage,
        newId: r.newId,
      };
    }, kind);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const recalled = await seek(page, expected.recalled);
    expect(recalled.id).toBeNull();
    expect(recalled.stored).toBe(expected.remaining);
    const redeployed = await seek(page, expected.redeployed);
    expect(redeployed.id).toBe(expected.newId);
    expect(redeployed.remaining).toBe(expected.remaining);
    const fired = await seek(page, expected.fired);
    expect(fired.remaining).toBe(expected.remaining - 1);
    expect(fired.damage).toBe(expected.base + expected.bonus);
    expect(fired.projectile).toBe(
      kind === 'prince' ? 'TurboStartProjectile' : 'RocketSpearProjectile',
    );
    await nativeShot(page);
    await page.screenshot({ path: `output/playtest/charged-recall-${kind}.png` });
    expect(await seek(page, expected.recalled)).toEqual(recalled);
    expect(await seek(page, expected.fired)).toEqual(fired);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__nobleIron.data, version: 81 }))
        throw Error('Legacy Recall rejected');
    });
    expect((await seek(page, expected.fired)).remaining).toBeUndefined();
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  });
}
