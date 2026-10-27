import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__gauntlet;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((u) => u.id === r.unitId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(innerWidth === 390 ? 8 : 9, 6.5);
    scene.cameras.main.setZoom(innerWidth === 390 ? 0.85 : 1.5).centerOn(point.x, point.y - 20);
    scene.drawOverlay(0);
    return {
      primary: model.battle.buildings[1].maxHp - model.battle.buildings[1].hp,
      secondary: model.battle.buildings[2].maxHp - model.battle.buildings[2].hp,
      far: model.battle.buildings[3].maxHp - model.battle.buildings[3].hp,
      active: (unit.native.effects?.splash?.until ?? 0) > model.battle.elapsed + 1e-9,
      radius: unit.native.effects?.splash?.radius,
      jumping: !!unit.native.equipmentJumping,
      attacking: unit.attacking,
    };
  }, at);
}

for (const { width, level } of [
  { width: 1440, level: 1 },
  { width: 390, level: 27 },
]) {
  test(`Giant Gauntlet ${level} splashes adjacent buildings and expires at ${width}px`, async ({
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
    const expected = await page.evaluate(async (level) => {
      const { gauntletRecording } = await import('/tests/fixtures/giant-gauntlet.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = gauntletRecording(level);
      window.__gauntlet = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Gauntlet replay rejected');
      scene.sync();
      return { active: r.active, expired: r.expired, ordinary: r.ordinary, deadline: r.deadline };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const active = await seek(page, expected.active);
    expect(active.active).toBe(true);
    expect(active.radius).toBe(2.5);
    expect(active.attacking).toBe(true);
    expect(active.jumping).toBe(false);
    expect(active.primary).toBeGreaterThan(0);
    expect(active.secondary).toBeCloseTo(active.primary, 9);
    expect(active.far).toBe(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.children.list.some(
            (o) =>
              o.visible &&
              o.alpha > 0 &&
              o.getData?.('nativeHero') === window.__gauntlet.unitId &&
              o.texture?.key.startsWith('baked:heroes-native/king/'),
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/giant-gauntlet-${level}-${width}.png` });
    const expired = await seek(page, expected.expired);
    expect(expired.active).toBe(false);
    const ordinary = await seek(page, expected.ordinary);
    expect(ordinary.primary).toBeGreaterThan(ordinary.secondary);
    expect(ordinary.secondary).toBeCloseTo(expired.secondary, 9);
    expect(ordinary.far).toBe(0);
    expect(await seek(page, expected.active)).toEqual(active);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, expected.ordinary)).toEqual(ordinary);
    expect(await seek(page, expected.active)).toEqual(active);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__gauntlet.data, version: 84 }))
        throw Error('Legacy Gauntlet replay rejected');
    });
    const oldActive = await seek(page, expected.active);
    expect(oldActive.primary).toBeCloseTo(active.primary, 9);
    expect(oldActive.secondary).toBe(0);
    expect((await seek(page, expected.ordinary)).secondary).toBe(0);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
