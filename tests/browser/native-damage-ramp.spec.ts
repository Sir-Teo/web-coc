import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__damageRamp;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const b = model.battle;
    const unit = b.units.find((u) => u.id === r.unitId);
    const targets = r.defenders ? b.defenders : b.buildings;
    const { iso } = await import('/src/game/scene.ts');
    const p = iso(unit.x + 1.5, unit.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 0.85 : 1.6).centerOn(p.x, p.y - 40);
    scene.drawOverlay(0);
    return {
      ramp: unit.native?.damageRamp,
      target: r.defenders ? unit.defenderTarget : unit.target,
      hp: targets.find((t) => t.id === r.firstTargetId).hp,
      shots: (b.projectiles ?? []).filter((p) => p.sourceId === r.unitId).length,
      alive: unit.hp > 0,
    };
  }, at);
}

for (const { kind, defenders, width } of [
  { kind: 'infernodragon' as const, defenders: false, width: 1440 },
  { kind: 'infernodragon' as const, defenders: true, width: 390 },
  { kind: 'superminer' as const, defenders: false, width: 390 },
  { kind: 'superminer' as const, defenders: true, width: 1440 },
]) {
  test(`${kind} ramps and retargets defenders=${defenders} at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(
      async ({ kind, defenders }) => {
        const { nativeDamageRampRecording } = await import('/tests/fixtures/native-damage-ramp.ts');
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        const r = nativeDamageRampRecording(kind, defenders);
        window.__damageRamp = r;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
          throw Error('Native ramp replay rejected');
        scene.sync();
        return {
          initial: r.initial,
          middle: r.middle,
          maximum: r.maximum,
          retargeted: r.retargeted,
        };
      },
      { kind, defenders },
    );
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const initial = await seek(page, r.initial);
    expect(initial.alive).toBe(true);
    expect(initial.shots).toBe(0);
    expect(initial.ramp.startedAt).toBeCloseTo(r.initial, 12);
    const maximum = await seek(page, r.maximum);
    expect(maximum.hp).toBeLessThan(initial.hp);
    expect(maximum.ramp).toEqual(initial.ramp);
    expect(maximum.shots).toBe(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          const id = window.__damageRamp.unitId;
          const entry = scene.troopNativePresentation.views.get(id);
          return (
            scene.troopNativePresentation.drewUnit(id) &&
            entry?.view.objects.some((o) => o.visible && o.alpha > 0)
          );
        }),
      )
      .toBe(true);
    if (kind === 'infernodragon')
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            const id = window.__damageRamp.unitId;
            const mouth = scene.troopNativePresentation.attachment(id, 'attack_pivot');
            const objects = scene.infernoPresentation.troopBeams.get(id)?.objects ?? [];
            return (
              !!mouth &&
              Number.isFinite(mouth.x) &&
              Number.isFinite(mouth.y) &&
              objects.some((o) => o.visible && o.alpha > 0 && o.getData('nativeBeamStage') === 2)
            );
          }),
        )
        .toBe(true);
    await page.screenshot({
      path: `output/playtest/native-ramp-${kind}-${defenders}-${width}.png`,
    });
    const retargeted = await seek(page, r.retargeted);
    expect(retargeted.hp).toBeLessThanOrEqual(0);
    expect(retargeted.target).not.toBe(initial.target);
    expect(retargeted.ramp.startedAt).toBeCloseTo(r.retargeted, 12);
    expect(retargeted.shots).toBe(0);
    expect(await seek(page, r.initial)).toEqual(initial);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, r.maximum)).toEqual(maximum);
    if (kind === 'infernodragon')
      expect(
        await page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.infernoPresentation.troopBeams
            .get(window.__damageRamp.unitId)
            ?.objects.some((o) => o.visible && o.alpha > 0 && o.getData('nativeBeamStage') === 2);
        }),
      ).toBe(true);
    expect(await seek(page, r.retargeted)).toEqual(retargeted);
    if (defenders) {
      await page.evaluate(() => {
        const { model } = window.__game;
        model.returnHome();
        if (!model.openReplay({ ...window.__damageRamp.data, version: 93 }))
          throw Error('Historical ramp replay rejected');
      });
      const old = await seek(page, r.maximum);
      expect(old.ramp).toBeUndefined();
      expect(old.hp).toBeGreaterThan(maximum.hp);
    }
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      scene.sync();
      scene.drawOverlay(0);
    });
    expect(await page.evaluate(() => window.__game.scene.infernoPresentation.troopBeams.size)).toBe(
      0,
    );
  });
}
