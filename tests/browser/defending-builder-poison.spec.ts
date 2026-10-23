import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  await page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const builder = model.battle.late.defendingBuilder.builders[0];
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(builder.x, builder.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 2.5 : 3).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
  }, at);
}

async function report(page: Page) {
  return page.evaluate(async () => {
    const { model, scene } = window.__game;
    scene.drawOverlay(0);
    const builder = model.battle.late.defendingBuilder.builders[0];
    const family = scene.lateCampaign.families.find(
      (family) => family.constructor.name === 'DefendingBuilderPresentation',
    );
    const objects = family.views.get(builder.id)?.body.objects ?? [];
    const { defendingBuilderLayers } = await import('/src/game/defending-builder-poses.ts');
    return {
      count: builder.repairCount,
      position: [builder.x, builder.y],
      poison: builder.poison,
      poses: JSON.stringify(defendingBuilderLayers(builder, model.battle).body),
      objects: objects.filter((object) => object.visible).length,
      green: objects.filter((object) => object.visible && object.tint === 0xa6e57a).length,
      tints: objects.map((object) => object.tint),
      gl: window.__game.game.renderer.gl.getError(),
    };
  });
}

for (const width of [1440, 390]) {
  test(`Poison slows original Builder repairs through replay seeks at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.text().startsWith('Skipped drawing')) errors.push(message.text());
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const times = await page.evaluate(async () => {
      const { defendingBuilderPoisonRecording } =
        await import('/tests/fixtures/defending-builder-poison.ts');
      const recording = defendingBuilderPoisonRecording();
      window.__builderPoisonRecording = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(recording.data)) throw Error('Poison replay rejected');
      scene.sync();
      return {
        first: recording.poisoned,
        later: recording.later,
        end: recording.recovered,
      };
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await seek(page, times.first);
    await expect.poll(async () => (await report(page)).objects).toBeGreaterThan(0);
    const poisoned = await report(page);
    expect(poisoned.poison).toBeDefined();
    expect(poisoned.green).toBeGreaterThan(0);
    expect(poisoned.gl).toBe(0);
    await seek(page, times.later);
    const held = await report(page);
    expect(held.count).toBeGreaterThan(poisoned.count);
    expect(held.position).toEqual(poisoned.position);
    expect(held.green).toBeGreaterThan(0);
    await page.screenshot({
      path: `output/playtest/defending-builder-poisoned-${width}-${browserName}.png`,
    });
    await seek(page, times.end);
    const recovered = await report(page);
    expect(recovered.count).toBeGreaterThan(poisoned.count);
    expect(recovered.green).toBe(0);
    expect(recovered.poses).not.toBe(poisoned.poses);
    await page.screenshot({
      path: `output/playtest/defending-builder-recovered-${width}-${browserName}.png`,
    });
    await seek(page, times.first);
    const rewind = await report(page);
    expect(rewind.count).toBe(poisoned.count);
    expect(rewind.poses).toBe(poisoned.poses);
    expect(rewind.green).toBeGreaterThan(0);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__builderPoisonRecording.data, version: 58 }))
        throw Error('Version 58 replay rejected');
      scene.sync();
    });
    await seek(page, times.later);
    const old = await report(page);
    expect(old.poison).toBeUndefined();
    expect(old.green).toBe(0);
    expect(old.count).toBeGreaterThan(held.count);
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
          window.__game.scene.lateCampaign.families.find(
            (family) => family.constructor.name === 'DefendingBuilderPresentation',
          ).views.size,
      ),
    ).toBe(0);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
