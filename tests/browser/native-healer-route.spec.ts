import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__healerRoute;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const caster = model.battle.units.find((u) => u.id === r.casterId);
    const { iso } = await import('/src/game/scene.ts');
    const p = iso(caster.x, caster.y);
    scene.cameras.main.setZoom(1.4).centerOn(p.x, p.y - 70);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return {
      x: caster.x,
      y: caster.y,
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
      battle: before,
    };
  }, at);
}

for (const width of [390, 1440]) {
  test(`ground Druid routes around a storage while following an airborne Hound at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(async () => {
      const { nativeHealerRouteRecording } = await import('/tests/fixtures/native-healer-route.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = nativeHealerRouteRecording();
      window.__healerRoute = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Ground healer replay rejected');
      scene.sync();
      scene.drawOverlay(0);
      return { detour: r.detour, passed: r.passed };
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const detour = await seek(page, r.detour);
    expect(Math.abs(detour.y - 6.5)).toBeGreaterThan(0.5);
    expect(detour.unchanged).toBe(true);
    expect(detour.gl).toBe(0);
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.troopNativePresentation.views
        .get(window.__healerRoute.casterId)
        ?.view.objects.some((o) => o.visible && o.alpha > 0);
    });
    await page.screenshot({ path: `output/playtest/native-healer-route-${width}.png` });
    const passed = await seek(page, r.passed);
    expect(passed.x).toBeGreaterThan(13.5);
    expect(await seek(page, r.detour)).toEqual(detour);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, r.passed)).toEqual(passed);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      const data = structuredClone(window.__healerRoute.data);
      data.version = 100;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Old ground healer replay rejected');
      scene.sync();
    });
    const old = await seek(page, r.detour);
    expect(old.y).toBeCloseTo(6.5, 8);
    expect(old.x).toBeGreaterThan(detour.x);
    expect(errors).toEqual([]);
  });
}
