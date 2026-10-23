import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number, kind: 'hero' | 'skeleton') {
  return page.evaluate(
    async ({ at, kind }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const defender = model.battle.defenders.find((defender) => defender.kind === kind);
      const { iso } = await import('/src/game/scene.ts');
      const point = iso(defender.x, defender.y);
      scene.cameras.main
        .setZoom(kind === 'skeleton' ? 3 : innerWidth === 390 ? 2 : 2.5)
        .centerOn(point.x, point.y - 30);
      scene.drawOverlay(0);
      return {
        hp: defender.hp,
        position: [defender.x, defender.y],
        avoiding: defender.avoidingPoison,
      };
    },
    { at, kind },
  );
}

for (const kind of ['hero', 'skeleton'] as const)
  for (const width of [1440, 390]) {
    test(`Idle ${kind} avoids Poison through replay seeks at ${width}px`, async ({
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
      const times = await page.evaluate(async (kind) => {
        const { idleDefenderAvoidanceRecording } =
          await import('/tests/fixtures/idle-defender-avoidance.ts');
        const recording = idleDefenderAvoidanceRecording(kind);
        window.__idleDefenderAvoidanceRecording = recording;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(recording.data)) throw Error('Idle defender replay rejected');
        scene.sync();
        return {
          before: recording.before,
          avoiding: recording.avoiding,
          clear: recording.clear,
          recovered: recording.recovered,
          cloud: recording.cloud,
        };
      }, kind);
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      const before = await seek(page, times.before, kind);
      const avoiding = await seek(page, times.avoiding, kind);
      expect(avoiding.avoiding).toBe(true);
      const clear = await seek(page, times.clear, kind);
      expect(clear.hp).toBeGreaterThan(0);
      expect(
        Math.hypot(clear.position[0] - times.cloud.x, clear.position[1] - times.cloud.y),
      ).toBeGreaterThan(4);
      await expect
        .poll(() =>
          page.evaluate((kind) => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const id = model.battle.defenders.find((defender) => defender.kind === kind).id;
            const sprite =
              kind === 'hero'
                ? scene.children.list.find(
                    (object) => object.getData?.('nativeHero') === id && object.visible,
                  )
                : scene.defenderSprites.get(id);
            return !!sprite?.visible && sprite.alpha > 0 && sprite.texture.key !== '__MISSING';
          }, kind),
        )
        .toBe(true);
      await page.screenshot({
        path: `output/playtest/idle-${kind}-poison-clear-${width}-${browserName}.png`,
      });
      const recovered = await seek(page, times.recovered, kind);
      if (kind === 'hero') {
        expect(recovered.avoiding).toBeUndefined();
        expect(
          Math.hypot(recovered.position[0] - times.cloud.x, recovered.position[1] - times.cloud.y),
        ).toBeLessThan(1.5);
      }
      expect(await seek(page, times.before, kind)).toEqual(before);
      expect(await seek(page, times.clear, kind)).toEqual(clear);
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.returnHome();
        if (!model.openReplay({ ...window.__idleDefenderAvoidanceRecording.data, version: 64 }))
          throw Error('Version 64 replay rejected');
        scene.sync();
      });
      const old = await seek(page, times.clear, kind);
      expect(old.position).toEqual(before.position);
      expect(old.hp).toBeLessThan(clear.hp);
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
