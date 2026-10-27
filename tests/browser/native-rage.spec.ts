import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__nativeRage;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const b = model.battle;
    const subject = b.units.find((u) => u.id === r.subjectId);
    const defender = b.defenders?.find((d) => d.id === r.defenderId);
    const { unitDamageScale, unitSpeedBonus } = await import('/src/game/native-status.ts');
    const { activeBoost } = await import('/src/game/native-boost.ts');
    const { defenderStatusTint } = await import('/src/game/unit-status-tint.ts');
    const { iso } = await import('/src/game/scene.ts');
    const p = iso(subject.x + 1, subject.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 0.85 : 1.4).centerOn(p.x, p.y - 40);
    scene.drawOverlay(0);
    return {
      damage: unitDamageScale(subject, b.elapsed),
      speed: unitSpeedBonus(subject, b.elapsed),
      hp: subject.hp,
      defenseBoost: defender ? activeBoost(defender.boost, b.elapsed) : undefined,
      tint: defender ? defenderStatusTint(defender, b.elapsed)?.color : undefined,
    };
  }, at);
}

for (const { mode, width } of [
  { mode: 'healing' as const, width: 1440 },
  { mode: 'aura' as const, width: 390 },
  { mode: 'tower' as const, width: 390 },
]) {
  test(`native ${mode} Rage survives portable seeks at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(async (mode) => {
      const { nativeRageRecording } = await import('/tests/fixtures/native-rage.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = nativeRageRecording(mode);
      window.__nativeRage = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Native Rage replay rejected');
      scene.sync();
      return { before: r.before, boosted: r.boosted, later: r.later, expired: r.expired };
    }, mode);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const boosted = await seek(page, r.boosted);
    if (mode === 'tower') {
      expect(boosted.damage).toBe(1);
      expect(boosted.defenseBoost.damage).toBeCloseTo(0.3, 12);
      expect(boosted.defenseBoost.speed).toBe(1.875);
      expect(boosted.tint).toBe(0xffbd76);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            const sprite = scene.heroNativePresentation.sprites.get(window.__nativeRage.defenderId);
            return sprite?.visible && sprite.texture.key.startsWith('baked:')
              ? sprite.tintTopLeft
              : -1;
          }),
        )
        .toBe(0xffbd76);
    } else {
      expect(boosted.damage).toBeCloseTo(2.3, 12);
      expect(boosted.speed).toBe(1.25);
    }
    const later = await seek(page, r.later);
    if (mode === 'aura') {
      expect(later.damage).toBeCloseTo(1.15, 12);
      expect(later.speed).toBe(0);
    }
    await page.screenshot({ path: `output/playtest/native-rage-${mode}-${width}.png` });
    if (r.expired !== undefined) {
      const expired = await seek(page, r.expired);
      expect(expired.defenseBoost).toBeUndefined();
      expect(expired.tint).toBeUndefined();
    }
    expect(await seek(page, r.boosted)).toEqual(boosted);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, r.later)).toEqual(later);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__nativeRage.data, version: 92 }))
        throw Error('Historical native Rage replay rejected');
    });
    const old = await seek(page, r.later);
    if (mode === 'healing') expect(later.hp).toBeGreaterThan(old.hp);
    if (mode === 'aura') {
      expect(old.damage).toBeCloseTo(2.3, 12);
      expect(old.speed).toBe(2.5);
    }
    if (mode === 'tower') {
      expect(old.defenseBoost).toBeUndefined();
      expect(old.tint).toBeUndefined();
      expect(later.hp).toBeLessThan(old.hp);
    }
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
