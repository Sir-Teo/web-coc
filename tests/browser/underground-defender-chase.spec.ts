import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__undergroundChase;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((u) => u.id === r.subjectId);
    const enemy = model.battle.defenders.find((d) => d.id === r.enemyId);
    const { targetableUnit } = await import('/src/game/native-troops.ts');
    const { unitHidden, unitTriggersTraps } = await import('/src/game/native-status.ts');
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(9.5, 6.5);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.1 : 1.5).centerOn(point.x, point.y - 50);
    scene.drawOverlay(0);
    return {
      x: unit.x,
      hp: unit.hp,
      maxHp: unit.maxHp,
      surfaced: !!unit.native.surfaced,
      burrowed: !!unit.native.burrowed,
      targetable: targetableUnit(model.battle, unit),
      hidden: unitHidden(unit, model.battle.elapsed),
      traps: unitTriggersTraps(unit),
      enemyTarget: enemy.target,
    };
  }, at);
}

for (const { kind, width } of [
  { kind: 'miner' as const, width: 1440 },
  { kind: 'diggy' as const, width: 390 },
]) {
  test(`${kind} surfaces to hit a defender and becomes vulnerable at ${width}px`, async ({
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
    const expected = await page.evaluate(async (kind) => {
      const { undergroundChaseRecording } =
        await import('/tests/fixtures/underground-defender-chase.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = undergroundChaseRecording(kind);
      window.__undergroundChase = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Underground chase replay rejected');
      scene.sync();
      return { moving: r.moving, surfaced: r.surfaced, hit: r.hit, subjectId: r.subjectId };
    }, kind);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const moving = await seek(page, expected.moving);
    expect(moving.burrowed).toBe(true);
    expect(moving.hidden).toBe(true);
    expect(moving.targetable).toBe(false);
    expect(moving.traps).toBe(false);
    const surfaced = await seek(page, expected.surfaced);
    expect(surfaced.x).toBeGreaterThan(9);
    expect(surfaced.surfaced).toBe(true);
    expect(surfaced.burrowed).toBe(false);
    expect(surfaced.hidden).toBe(false);
    expect(surfaced.targetable).toBe(true);
    expect(surfaced.traps).toBe(true);
    await expect
      .poll(() =>
        page.evaluate((kind) => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          const id = window.__undergroundChase.subjectId;
          if (kind === 'diggy')
            return scene.children.list.some(
              (o) =>
                o.visible &&
                o.alpha > 0 &&
                o.getData?.('nativeHero') === id &&
                o.texture?.key.startsWith('baked:heroes-native/diggy/'),
            );
          return (
            scene.troopNativePresentation.views
              .get(id)
              ?.view.objects.some(
                (o) =>
                  o.visible &&
                  o.alpha > 0 &&
                  typeof o.texture?.key === 'string' &&
                  !['__MISSING', '__DEFAULT'].includes(o.texture.key),
              ) ?? false
          );
        }, kind),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/underground-chase-${kind}-${width}.png` });
    const hit = await seek(page, expected.hit);
    expect(hit.hp).toBeLessThan(hit.maxHp);
    expect(hit.enemyTarget).toBe(expected.subjectId);
    expect(await seek(page, expected.moving)).toEqual(moving);
    expect(await seek(page, expected.surfaced)).toEqual(surfaced);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, expected.hit)).toEqual(hit);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__undergroundChase.data, version: 86 }))
        throw Error('Legacy underground chase replay rejected');
    });
    const old = await seek(page, expected.hit);
    expect(old.x).toBeLessThan(8);
    expect(old.burrowed).toBe(true);
    expect(old.hp).toBe(old.maxHp);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
