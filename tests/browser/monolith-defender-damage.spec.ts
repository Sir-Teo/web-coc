import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__monolithDefender;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const enemy = model.battle.defenders.find((d) => d.id === r.enemyId);
    const queen = model.battle.units.find((u) => u.id === r.unitId);
    const p = model.battle.projectiles?.find((p) => p.sourceId === r.unitId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(queen ? (queen.x + enemy.x) / 2 : enemy.x, enemy.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.1 : 1.8).centerOn(point.x, point.y - 40);
    scene.drawOverlay(0);
    return {
      present: !!queen,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      frost: enemy.frost,
      shot: p
        ? { damage: p.damage, name: p.native?.name, frost: p.native?.frost, toAir: p.toAir }
        : null,
    };
  }, at);
}

for (const width of [1440, 390]) {
  test(`Monolith Arrow captures a ${width === 390 ? 'flying' : 'ground'} Hero HP bonus after Recall at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const expected = await page.evaluate(async (air) => {
      const { heroDefenderRecording } = await import('/tests/fixtures/hero-defender-attacks.ts');
      const { statsFor } = await import('/src/game/native-troops.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = heroDefenderRecording(
        'queen',
        true,
        [
          { slug: 'monolith-arrow', level: 1 },
          { slug: 'frozen-arrow', level: 1 },
        ],
        air,
      );
      window.__monolithDefender = r;
      const initial = r.snapshots[0].battle;
      const base = statsFor(
        initial,
        initial.units.find((u) => u.id === r.unitId),
      ).damage;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Monolith defender replay rejected');
      scene.sync();
      return { active: r.active, recalled: r.recalled, hit: r.hit, base };
    }, width === 390);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const flight = await seek(page, expected.active);
    expect(flight.shot?.name).toBe('ArcherQueenMonolithProjectile3');
    expect(flight.shot?.damage).toBeCloseTo(expected.base + flight.maxHp * 0.095, 9);
    expect(flight.shot?.toAir).toBe(width === 390);
    expect(flight.shot?.frost).toEqual({ seconds: 0.75, percent: 0.25 });
    expect(flight.hp).toBe(flight.maxHp);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          scene.drawOverlay(0);
          const shot = model.battle.projectiles.find(
            (p) => p.sourceId === window.__monolithDefender.unitId,
          );
          return (
            scene.nativeProjectiles.views
              .get(shot.id)
              ?.view.objects.some(
                (o) =>
                  o.visible && o.alpha > 0 && !['__MISSING', '__DEFAULT'].includes(o.texture?.key),
              ) ?? false
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/monolith-defender-flight-${width}.png` });
    const recalled = await seek(page, expected.recalled);
    expect(recalled.present).toBe(false);
    expect(recalled.shot?.damage).toBe(flight.shot?.damage);
    const hit = await seek(page, expected.hit);
    expect(recalled.hp - hit.hp).toBeCloseTo(recalled.shot!.damage, 8);
    expect(hit.frost?.percent).toBe(0.25);
    expect(await seek(page, expected.active)).toEqual(flight);
    expect(await seek(page, expected.recalled)).toEqual(recalled);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, expected.hit)).toEqual(hit);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__monolithDefender.data, version: 88 }))
        throw Error('Legacy Monolith defender replay rejected');
    });
    const oldFlight = await seek(page, expected.active);
    expect(oldFlight.shot?.name).toBe(flight.shot?.name);
    expect(oldFlight.shot?.damage).toBe(expected.base);
    expect((await seek(page, expected.hit)).hp).toBeGreaterThan(hit.hp);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
