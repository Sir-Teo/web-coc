import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const defender = model.battle.defenders.find((defender) => defender.kind === 'hero');
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(defender.x, defender.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 2 : 2.5).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    return {
      hp: defender.hp,
      position: [defender.x, defender.y],
      cooldown: defender.cooldown,
      poison: defender.poison,
    };
  }, at);
}

for (const width of [1440, 390]) {
  test(`Poison slows and scales defending hero damage through replay seeks at ${width}px`, async ({
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
      const { defendingHeroPoisonRecording } =
        await import('/tests/fixtures/defending-hero-poison.ts');
      const recording = defendingHeroPoisonRecording();
      window.__defendingHeroPoisonRecording = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(recording.data)) throw Error('Defending hero replay rejected');
      scene.sync();
      return { before: recording.before, poisoned: recording.poisoned, later: recording.later };
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const before = await seek(page, times.before);
    const poisoned = await seek(page, times.poisoned);
    expect(poisoned.poison.attack).toBe(-0.35);
    const later = await seek(page, times.later);
    expect(later.hp).toBeLessThan(before.hp);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          scene.drawOverlay(0);
          const id = model.battle.defenders.find((defender) => defender.kind === 'hero').id;
          return scene.children.list.filter(
            (object) => object.getData?.('nativeHero') === id && object.visible,
          ).length;
        }),
      )
      .toBeGreaterThan(0);
    await page.screenshot({
      path: `output/playtest/defending-hero-poison-${width}-${browserName}.png`,
    });
    expect(await seek(page, times.before)).toEqual(before);
    expect(await seek(page, times.later)).toEqual(later);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__defendingHeroPoisonRecording.data, version: 59 }))
        throw Error('Version 59 replay rejected');
      scene.sync();
    });
    const old = await seek(page, times.later);
    expect(old.hp).toBeLessThan(later.hp);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    });
    expect(
      await page.evaluate(
        () =>
          window.__game.scene.children.list.filter((object) => object.getData?.('nativeHero') < 0)
            .length,
      ),
    ).toBe(0);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
