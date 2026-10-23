import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const defender = model.battle.defenders.find((defender) => defender.kind === 'dragon');
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(defender.x, defender.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 2 : 2.5).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    return {
      hp: defender.hp,
      position: [defender.x, defender.y],
      cooldown: defender.cooldown,
      poison: defender.poison,
      avoiding: defender.avoidingPoison,
    };
  }, at);
}

for (const width of [1440, 390]) {
  test(`Idle garrison troops leave Poison through replay seeks at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const times = await page.evaluate(async () => {
      const { poisonAvoidanceRecording } = await import('/tests/fixtures/poison-avoidance.ts');
      const recording = poisonAvoidanceRecording();
      window.__poisonAvoidanceRecording = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(recording.data)) throw Error('Garrison replay rejected');
      scene.sync();
      return { before: recording.before, poisoned: recording.avoiding, later: recording.escaped };
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const before = await seek(page, times.before);
    const poisoned = await seek(page, times.poisoned);
    expect(poisoned.poison.attack).toBe(-0.35);
    expect(poisoned.avoiding).toBe(true);
    const later = await seek(page, times.later);
    expect(later.hp).toBeLessThan(before.hp);
    expect(later.avoiding).toBeUndefined();
    expect(later.position).not.toEqual(before.position);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          scene.drawOverlay(0);
          const id = model.battle.defenders.find((defender) => defender.kind === 'dragon').id;
          return (scene.garrisonPresentation.defenders.get(id)?.objects ?? []).filter(
            (object) => object.visible,
          ).length;
        }),
      )
      .toBeGreaterThan(0);
    await page.screenshot({
      path: `output/playtest/poison-avoidance-${width}-${browserName}.png`,
    });
    expect(await seek(page, times.before)).toEqual(before);
    expect(await seek(page, times.later)).toEqual(later);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__poisonAvoidanceRecording.data, version: 63 }))
        throw Error('Version 63 replay rejected');
      scene.sync();
    });
    const old = await seek(page, times.later);
    expect(old.position).toEqual(before.position);
    expect(old.poison.areas).toBeUndefined();
    expect(old.hp).toBeLessThan(later.hp);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    });
    expect(await page.evaluate(() => window.__game.scene.garrisonPresentation.defenders.size)).toBe(
      0,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
