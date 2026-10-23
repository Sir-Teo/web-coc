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
      freeze: builder.freeze,
      poses: JSON.stringify(defendingBuilderLayers(builder, model.battle).body),
      objects: objects.filter((object) => object.visible).length,
      blue: objects.filter((object) => object.visible && object.tint === 0xa8e6ff).length,
      tints: objects.map((object) => object.tint),
      gl: window.__game.game.renderer.gl.getError(),
    };
  });
}

for (const width of [1440, 390]) {
  test(`Freeze holds original Builder repairs and poses through replay seeks at ${width}px`, async ({
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
      const { defendingBuilderFreezeRecording } =
        await import('/tests/fixtures/defending-builder-freeze.ts');
      const recording = defendingBuilderFreezeRecording();
      window.__builderFreezeRecording = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(recording.data)) throw Error('Freeze replay rejected');
      scene.sync();
      return {
        first: recording.firstFrozen,
        later: recording.laterFrozen,
        end: recording.freezeEnd,
      };
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await seek(page, times.first);
    await expect.poll(async () => (await report(page)).objects).toBeGreaterThan(0);
    const frozen = await report(page);
    expect(frozen.freeze).toBeDefined();
    expect(frozen.blue).toBeGreaterThan(0);
    expect(frozen.gl).toBe(0);
    await seek(page, times.later);
    const held = await report(page);
    expect(held.count).toBe(frozen.count);
    expect(held.position).toEqual(frozen.position);
    expect(held.poses).toBe(frozen.poses);
    expect(held.blue).toBeGreaterThan(0);
    await page.screenshot({
      path: `output/playtest/defending-builder-frozen-${width}-${browserName}.png`,
    });
    await seek(page, times.end + 1);
    const thawed = await report(page);
    expect(thawed.count).toBeGreaterThan(frozen.count);
    expect(thawed.blue).toBe(0);
    expect(thawed.poses).not.toBe(frozen.poses);
    await page.screenshot({
      path: `output/playtest/defending-builder-thawed-${width}-${browserName}.png`,
    });
    await seek(page, times.first);
    const rewind = await report(page);
    expect(rewind.count).toBe(frozen.count);
    expect(rewind.poses).toBe(frozen.poses);
    expect(rewind.blue).toBeGreaterThan(0);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__builderFreezeRecording.data, version: 56 }))
        throw Error('Version 56 replay rejected');
      scene.sync();
    });
    await seek(page, times.later);
    const old = await report(page);
    expect(old.freeze).toBeUndefined();
    expect(old.blue).toBe(0);
    expect(old.count).toBeGreaterThan(frozen.count);
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
