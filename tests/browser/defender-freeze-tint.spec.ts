import { expect, test, type Page } from '@playwright/test';

type Kind = 'hero' | 'skeleton' | 'garrison' | 'guardian';

async function renderAt(page: Page, at: number, kind: Kind) {
  return page.evaluate(
    async ({ at, kind }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const defender = model.battle.defenders.find(
        (d) => d.id === window.__freezeTintRecording.defenderId,
      );
      const { iso } = await import('/src/game/scene.ts');
      const point = iso(defender.x, defender.y);
      scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 30);
      scene.drawOverlay(0);
      const objects =
        kind === 'garrison'
          ? (scene.garrisonPresentation.defenders.get(defender.id)?.objects ?? [])
          : kind === 'skeleton'
            ? [scene.defenderSprites.get(defender.id)].filter(Boolean)
            : scene.children.list.filter(
                (object) => object.getData?.('nativeHero') === defender.id,
              );
      const visible = objects.filter((object) => object.visible && object.alpha > 0);
      const tints = visible.map((object) =>
        object.vertices !== undefined || object.nativeColored ? object.tint : object.tintTopLeft,
      );
      return {
        hp: defender.hp,
        frozen: defender.frozenUntil > model.battle.elapsed,
        count: visible.length,
        blue: tints.filter((tint) => tint === 0xa8e6ff).length,
        basesRestored: visible
          .filter((object) => object.nativeTint !== undefined)
          .every((object) => object.tint === object.nativeTint),
      };
    },
    { at, kind },
  );
}

for (const kind of ['hero', 'skeleton', 'garrison', 'guardian'] as const)
  for (const width of [1440, 390]) {
    test(`Freeze tint follows ${kind} through expiry and seeks at ${width}px`, async ({ page }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      if (width === 390) await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const times = await page.evaluate(async (kind) => {
        const { defenderFreezeTintRecording } =
          await import('/tests/fixtures/defender-freeze-tint.ts');
        const recording = defenderFreezeTintRecording(kind);
        window.__freezeTintRecording = recording;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(recording.data)) throw Error('Defender Freeze replay rejected');
        scene.sync();
        return { frozen: recording.frozen, expired: recording.expired };
      }, kind);
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      await expect
        .poll(async () => (await renderAt(page, times.frozen, kind)).blue)
        .toBeGreaterThan(0);
      const frozen = await renderAt(page, times.frozen, kind);
      expect(frozen.frozen).toBe(true);
      await page.screenshot({ path: `output/playtest/defender-freeze-${kind}-${width}.png` });
      const expired = await renderAt(page, times.expired, kind);
      expect(expired.hp).toBeGreaterThan(0);
      expect(expired.count).toBeGreaterThan(0);
      expect(expired.frozen).toBe(false);
      expect(expired.blue).toBe(0);
      expect(expired.basesRestored).toBe(true);
      expect(await renderAt(page, times.frozen, kind)).toEqual(frozen);
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.returnHome();
        if (!model.openReplay({ ...window.__freezeTintRecording.data, version: 67 }))
          throw Error('Version 67 Freeze replay rejected');
        scene.sync();
      });
      const old = await renderAt(page, times.frozen, kind);
      expect(old.frozen).toBe(false);
      expect(old.blue).toBe(0);
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
      expect(errors).toEqual([]);
    });
  }
