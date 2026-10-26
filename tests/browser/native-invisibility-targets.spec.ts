import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__nativeInvisibility;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const hero = model.battle.units.find((u) => u.id === r.unitId);
    const building = r.mode === 'building';
    const subject = building
      ? model.battle.buildings.find((b) => b.id === r.subjectId)
      : model.battle.defenders.find((d) => d.id === r.subjectId);
    const { buildingHidden, unitHidden } = await import('/src/game/native-status.ts');
    const { defenderHidden } = await import('/src/game/defender-visibility.ts');
    const { iso } = await import('/src/game/scene.ts');
    const p = building ? iso(11, 6.5) : iso((hero.x + subject.x) / 2, (hero.y + subject.y) / 2);
    scene.cameras.main.setZoom(innerWidth === 390 ? 0.85 : 1.5).centerOn(p.x, p.y - 40);
    scene.drawOverlay(0);
    return {
      hidden: building
        ? buildingHidden(model.battle, subject)
        : defenderHidden(model.battle, subject),
      hp: subject.hp,
      maxHp: subject.maxHp,
      target: hero.target,
      defenderTarget: hero.defenderTarget,
      heroHidden: unitHidden(hero, model.battle.elapsed),
      heroHp: hero.hp,
      attacking: !building && subject.attacking,
      until: building
        ? model.battle.buildingEffects?.[subject.id]?.invisibleUntil
        : subject.invisibleUntil,
      cannonShots: model.battle.cannons?.[2]?.fired ?? 0,
    };
  }, at);
}

for (const { mode, air, width } of [
  { mode: 'building' as const, air: false, width: 1440 },
  { mode: 'defender' as const, air: false, width: 1440 },
  { mode: 'defender' as const, air: true, width: 390 },
  { mode: 'tower' as const, air: false, width: 390 },
]) {
  test(`native ${mode} Invisibility covers air=${air} at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const expected = await page.evaluate(
      async ({ mode, air }) => {
        const { nativeInvisibilityRecording } =
          await import('/tests/fixtures/native-invisibility.ts');
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        const r = nativeInvisibilityRecording(mode, air);
        window.__nativeInvisibility = r;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
          throw Error('Native Invisibility replay rejected');
        scene.sync();
        return {
          waiting: r.waiting,
          hidden: r.hidden,
          impacted: r.impacted,
          expired: r.expired,
          pendingDamage: r.pendingDamage,
        };
      },
      { mode, air },
    );
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    expect((await seek(page, expected.waiting)).hidden).toBe(false);
    const hidden = await seek(page, expected.hidden);
    expect(hidden.hidden).toBe(true);
    expect(hidden.hp).toBeGreaterThan(0);
    if (mode === 'building') expect(hidden.target).toBe(3);
    else {
      expect(hidden.defenderTarget).toBeUndefined();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            const sprite = scene.heroNativePresentation.sprites.get(
              window.__nativeInvisibility.subjectId,
            );
            return sprite?.visible && sprite.texture?.key.startsWith('baked:') ? sprite.alpha : -1;
          }),
        )
        .toBeCloseTo(0.35, 8);
    }
    if (mode === 'tower') {
      expect(hidden.heroHidden).toBe(false);
      expect(hidden.attacking).toBe(true);
    }
    await page.screenshot({
      path: `output/playtest/native-invisibility-${mode}-${air}-${width}.png`,
    });
    const impacted = await seek(page, expected.impacted);
    if (mode !== 'tower')
      expect(impacted.hp).toBeCloseTo(Math.max(0, hidden.hp - expected.pendingDamage), 8);
    const expired = await seek(page, expected.expired);
    expect(expired.hidden).toBe(false);
    if (mode === 'tower') expect(expired.cannonShots).toBeGreaterThan(hidden.cannonShots);
    expect(await seek(page, expected.hidden)).toEqual(hidden);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, expected.impacted)).toEqual(impacted);
    expect(await seek(page, expected.expired)).toEqual(expired);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__nativeInvisibility.data, version: 91 }))
        throw Error('Legacy native Invisibility replay rejected');
    });
    const old = await seek(page, expected.hidden);
    expect(old.hidden).toBe(false);
    if (mode === 'building') expect(old.target).toBe(2);
    else {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            return (
              scene.heroNativePresentation.sprites.get(window.__nativeInvisibility.subjectId)
                ?.alpha ?? -1
            );
          }),
        )
        .toBe(1);
    }
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
