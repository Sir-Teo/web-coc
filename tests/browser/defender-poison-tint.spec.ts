import { expect, test, type Page } from '@playwright/test';

type Kind = 'hero' | 'skeleton' | 'garrison' | 'guardian';

async function seek(page: Page, at: number) {
  await page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const defender = model.battle.defenders.find(
      (defender) => defender.id === window.__poisonTintRecording.defenderId,
    );
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(defender.x, defender.y);
    scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 40);
    scene.drawOverlay(0);
  }, at);
}

async function report(page: Page, kind: Kind) {
  return page.evaluate((kind) => {
    const { model, scene } = window.__game;
    scene.drawOverlay(0);
    const id = window.__poisonTintRecording.defenderId;
    const defender = model.battle.defenders.find((defender) => defender.id === id);
    const objects =
      kind === 'garrison'
        ? (scene.garrisonPresentation.defenders.get(id)?.objects ?? [])
        : kind === 'skeleton'
          ? [scene.defenderSprites.get(id)].filter(Boolean)
          : scene.children.list.filter(
              (object) => object.getData?.('nativeHero') === id && object.visible,
            );
    const visible = objects.filter((object) => object.visible && object.alpha > 0);
    const tints = visible.map((object) =>
      object.vertices !== undefined || object.nativeColored ? object.tint : object.tintTopLeft,
    );
    return {
      hp: defender.hp,
      active: !!defender.poison && defender.poison.until > model.battle.elapsed,
      count: visible.length,
      green: tints.filter((tint) => tint === 0xa6e57a).length,
      tints,
      basesRestored: visible
        .filter((object) => object.nativeTint !== undefined)
        .every((object) => object.tint === object.nativeTint),
    };
  }, kind);
}

for (const kind of ['hero', 'skeleton', 'garrison', 'guardian'] as const)
  for (const width of [1440, 390]) {
    test(`Poison tint follows ${kind} status, expiry and seeks at ${width}px`, async ({
      page,
      browserName,
    }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const times = await page.evaluate(async (kind) => {
        const { defenderPoisonTintRecording } =
          await import('/tests/fixtures/defender-poison-tint.ts');
        const recording = defenderPoisonTintRecording(kind);
        window.__poisonTintRecording = recording;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(recording.data)) throw Error('Poison tint replay rejected');
        scene.sync();
        return { poisoned: recording.poisoned, expired: recording.expired };
      }, kind);
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      await seek(page, times.poisoned);
      await expect.poll(async () => (await report(page, kind)).count).toBeGreaterThan(0);
      const poisoned = await report(page, kind);
      expect(poisoned.active).toBe(true);
      expect(poisoned.green).toBeGreaterThan(0);
      expect((await report(page, kind)).tints).toEqual(poisoned.tints);
      await page.screenshot({
        path: `output/playtest/defender-poison-${kind}-${width}-${browserName}.png`,
      });
      await seek(page, times.expired);
      const expired = await report(page, kind);
      expect(expired.hp).toBeGreaterThan(0);
      expect(expired.active).toBe(false);
      expect(expired.green).toBe(0);
      if (kind === 'garrison') expect(expired.basesRestored).toBe(true);
      else expect(expired.tints.every((tint) => tint === 0xffffff)).toBe(true);
      await seek(page, times.poisoned);
      await expect.poll(async () => (await report(page, kind)).green).toBeGreaterThan(0);
      await page.evaluate(async () => {
        const { hurtDefender } = await import('/src/game/defenders.ts');
        const { model, scene } = window.__game;
        const defender = model.battle.defenders.find(
          (defender) => defender.id === window.__poisonTintRecording.defenderId,
        );
        hurtDefender(model.battle, defender, defender.hp + 1);
        scene.drawOverlay(0);
      });
      expect((await report(page, kind)).green).toBe(0);

      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.returnHome();
        model.changed();
        scene.sync();
        scene.drawOverlay(0);
      });
      expect(await page.evaluate(() => window.__game.scene.defenderSprites.size)).toBe(0);
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
      expect(errors).toEqual([]);
    });
  }
