import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__diggyStun;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const pet = model.battle.units.find((u) => u.id === r.petId);
    const tower = model.battle.buildings.find((b) => b.id === 2);
    const { buildingDisabled, unitHidden } = await import('/src/game/native-status.ts');
    const { iso } = await import('/src/game/scene.ts');
    const p = iso(8, 6.5);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1 : 1.7).centerOn(p.x, p.y - 50);
    scene.drawOverlay(0);
    return {
      surfaced: !!pet.native.surfaced,
      burrowed: !!pet.native.burrowed,
      hidden: unitHidden(pet, model.battle.elapsed),
      hp: pet.hp,
      until: model.battle.defenseStuns[2],
      frozenUntil: model.battle.buildingEffects?.[2]?.frozenUntil,
      disabled: buildingDisabled(model.battle, tower, model.battle.elapsed),
      cooldown: tower.cooldown,
      fired: model.battle.cannons?.[2]?.fired ?? 0,
    };
  }, at);
}

for (const { level, width } of [
  { level: 1, width: 1440 },
  { level: 10, width: 390 },
]) {
  test(`Diggy level ${level} stuns once and the defense recovers at ${width}px`, async ({
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
    const times = await page.evaluate(async (level) => {
      const { diggyStunRecording } = await import('/tests/fixtures/diggy-surface-stun.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = diggyStunRecording(level);
      window.__diggyStun = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Diggy stun replay rejected');
      scene.sync();
      return {
        moving: r.moving,
        surfaced: r.surfaced,
        repeated: r.repeated,
        recovered: r.recovered,
        until: r.until,
      };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const moving = await seek(page, times.moving);
    expect(moving.burrowed).toBe(true);
    expect(moving.hidden).toBe(true);
    const surfaced = await seek(page, times.surfaced);
    expect(surfaced.surfaced).toBe(true);
    expect(surfaced.hidden).toBe(false);
    expect(surfaced.disabled).toBe(true);
    expect(surfaced.until).toBe(times.until);
    expect(surfaced.until - times.surfaced).toBeCloseTo(level === 1 ? 2 : 3, 9);
    expect(surfaced.frozenUntil).toBeUndefined();
    expect(typeof surfaced.cooldown).toBe('number');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.children.list.some(
            (o) =>
              o.visible &&
              o.alpha > 0 &&
              o.getData?.('nativeHero') === window.__diggyStun.petId &&
              o.texture?.key.startsWith('baked:heroes-native/diggy/'),
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/diggy-stun-${level}-${width}.png` });
    const repeated = await seek(page, times.repeated);
    expect(repeated.until).toBe(times.until);
    expect(repeated.disabled).toBe(true);
    expect(repeated.cooldown).toBeCloseTo(surfaced.cooldown, 10);
    expect(repeated.fired).toBe(surfaced.fired);
    const recovered = await seek(page, times.recovered);
    expect(recovered.disabled).toBe(false);
    expect(recovered.fired).toBeGreaterThan(repeated.fired);
    expect(await seek(page, times.moving)).toEqual(moving);
    expect(await seek(page, times.surfaced)).toEqual(surfaced);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, times.recovered)).toEqual(recovered);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__diggyStun.data, version: 89 }))
        throw Error('Legacy Diggy stun replay rejected');
    });
    const old = await seek(page, times.repeated);
    expect(old.until).toBeUndefined();
    expect(old.disabled).toBe(false);
    expect(old.fired).toBeGreaterThan(repeated.fired);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
