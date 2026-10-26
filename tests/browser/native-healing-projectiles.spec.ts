import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__healing;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts');
    const target = model.battle.units.find((u) => u.id === r.targetId);
    const point = iso(target.x, target.y);
    scene.cameras.main.setZoom(1.65).centerOn(point.x, point.y - 70);
    scene.drawOverlay(0);
    return { hp: target.hp, battle: JSON.stringify(model.battle) };
  }, at);
}

for (const kind of ['unicorn', 'druid'] as const) {
  test(`${kind} shows its source healing flight and survives portable reverse seeks`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: kind === 'unicorn' ? 390 : 1440, height: 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(async (kind) => {
      const { nativeHealingRecording } = await import('/tests/fixtures/native-healing.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = nativeHealingRecording(kind);
      window.__healing = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Healing replay rejected');
      scene.sync();
      scene.drawOverlay(0);
      return {
        inFlight: r.inFlight,
        landed: r.landed,
        beforeHp: r.beforeHp,
        shotId: r.shotId,
        hopId: r.hopId,
      };
    }, kind);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const before = await seek(page, r.inFlight);
    expect(before.hp).toBe(r.beforeHp);
    await page.waitForFunction((id) => {
      const scene = window.__game.scene;
      scene.drawOverlay(0);
      return (
        scene.nativeProjectiles.covers(id) &&
        scene.nativeProjectiles.views.get(id)?.view.objects.some((o) => o.visible && o.alpha > 0)
      );
    }, r.shotId);
    const art = await page.evaluate((id) => {
      const { model, scene } = window.__game;
      const before = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return {
        prefix: scene.nativeProjectiles.views.get(id).prefix,
        unchanged: before === JSON.stringify(model.battle),
        gl: window.__game.game.renderer.gl.getError(),
      };
    }, r.shotId);
    expect(art.prefix).toContain(kind === 'unicorn' ? 'healerenergy' : 'battledruidprojectile');
    expect(art.unchanged).toBe(true);
    expect(art.gl).toBe(0);
    await page.screenshot({ path: `output/playtest/native-healing-${kind}.png` });
    const landed = await seek(page, r.landed);
    expect(landed.hp).toBeGreaterThan(before.hp);
    if (kind === 'druid') {
      expect(
        await page.evaluate(
          (id) =>
            window.__game.model.battle.projectiles.some(
              (p) => p.id === id && p.native.bounce === 1,
            ),
          r.hopId,
        ),
      ).toBe(true);
    }
    expect(await seek(page, r.inFlight)).toEqual(before);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, r.landed)).toEqual(landed);
    expect(errors).toEqual([]);
  });
}
