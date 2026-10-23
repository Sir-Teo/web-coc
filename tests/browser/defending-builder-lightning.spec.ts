import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
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
    return {
      target: builder.target,
      repairs: builder.repairs.map((repair) => repair.targetId),
      position: [builder.x, builder.y],
    };
  }, at);
}

for (const width of [1440, 390]) {
  test(`Lightning retargets the original Builder through replay seeks at ${width}px`, async ({
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
      const { defendingBuilderLightningRecording } =
        await import('/tests/fixtures/defending-builder-lightning.ts');
      const recording = defendingBuilderLightningRecording();
      window.__builderLightningRecording = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(recording.data)) throw Error('Lightning replay rejected');
      scene.sync();
      return { before: recording.before, after: recording.after, repaired: recording.repaired };
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    expect((await seek(page, times.before)).target).toBe(1);
    expect((await seek(page, times.after)).target).toBe(3);
    const repaired = await seek(page, times.repaired);
    expect(repaired.repairs).toContain(3);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          scene.drawOverlay(0);
          const family = scene.lateCampaign.families.find(
            (family) => family.constructor.name === 'DefendingBuilderPresentation',
          );
          return (
            family.views.get(model.battle.late.defendingBuilder.builders[0].id)?.body.objects ?? []
          ).filter((object) => object.visible).length;
        }),
      )
      .toBeGreaterThan(0);
    await page.screenshot({
      path: `output/playtest/defending-builder-lightning-${width}-${browserName}.png`,
    });
    expect((await seek(page, times.before)).target).toBe(1);
    expect(await seek(page, times.repaired)).toEqual(repaired);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__builderLightningRecording.data, version: 57 }))
        throw Error('Version 57 replay rejected');
      scene.sync();
    });
    const old = await seek(page, times.repaired);
    expect(old.target).toBe(1);
    expect(old.repairs.every((target) => target === 1)).toBe(true);
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
