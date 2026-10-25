import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const u = model.battle.units.find((u) => u.id === window.__vampstache.unitId);
    const defender = model.battle.defenders.find((d) => d.kind === 'hero');
    const { iso } = await import('/src/game/scene.ts');
    const point = iso((u.x + defender.x) / 2, (u.y + defender.y) / 2);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.4 : 2).centerOn(point.x, point.y - 25);
    scene.drawOverlay(0);
    return { hp: u.hp, maxHp: u.maxHp, defenderHp: defender.hp, cooldown: u.cooldown };
  }, at);
}

for (const { width, level } of [
  { width: 1440, level: 1 },
  { width: 390, level: 18 },
]) {
  test(`Vampstache ${level} heals actual King swings at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    if (width === 390) await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const expected = await page.evaluate(async (level) => {
      const { vampstacheRecording } = await import('/tests/fixtures/vampstache.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const recording = vampstacheRecording(level);
      window.__vampstache = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
        throw Error('Vampstache replay rejected');
      scene.sync();
      return {
        first: recording.snapshots[0].at,
        final: recording.final,
        heal: recording.heal,
        total: recording.strikes.length * recording.heal,
      };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const first = await seek(page, expected.first);
    const final = await seek(page, expected.final);
    expect(final.hp).toBeGreaterThan(0);
    expect(final.hp).toBeLessThanOrEqual(final.maxHp);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          scene.drawOverlay(0);
          const defender = model.battle.defenders.find((d) => d.kind === 'hero');
          return [window.__vampstache.unitId, defender.id].every((id) =>
            scene.children.list.some(
              (o) =>
                o.visible &&
                o.alpha > 0 &&
                o.getData?.('nativeHero') === id &&
                o.texture?.key.startsWith('baked:heroes-native/king/'),
            ),
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/vampstache-${level}-${width}.png` });
    expect(await seek(page, expected.first)).toEqual(first);
    expect(await seek(page, expected.final)).toEqual(final);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__vampstache.data, version: 78 }))
        throw Error('Version 78 Vampstache replay rejected');
      scene.sync();
    });
    const oldFirst = await seek(page, expected.first);
    expect(first.hp - oldFirst.hp).toBe(expected.heal);
    const oldFinal = await seek(page, expected.final);
    expect(final.hp - oldFinal.hp).toBe(expected.total);
    expect(oldFinal.defenderHp).toBe(final.defenderHp);
    expect(oldFinal.cooldown).toBe(final.cooldown);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
