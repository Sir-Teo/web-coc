import { expect, test } from '@playwright/test';

for (const { width, home, level, reduced } of [
  { width: 1440, home: true, level: 1, reduced: false },
  { width: 390, home: false, level: 4, reduced: false },
  { width: 390, home: true, level: 1, reduced: true },
]) {
  test(`warms native troop projectile art from ${home ? 'home army' : 'imported roster'} at ${width}px${reduced ? ' after reduced motion is disabled' : ''}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let requested = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      '**/assets/projectiles-native/headhunter-card-lvl1/graph.json',
      async (route) => {
        requested++;
        await held;
        await route.continue();
      },
    );
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const start = await page.evaluate(
      async ({ home, level }) => {
        const { headhunterHeroRecording } =
          await import('/tests/fixtures/headhunter-hero-rules.ts');
        const recording = headhunterHeroRecording(false);
        recording.data.initial.troopLevels.headhunter = level;
        window.__projectilePrefetch = recording;
        const { model, scene } = window.__game;
        scene.paused = true;
        model.clearArmy();
        if (home) {
          model.state.army.headhunter = 1;
          model.state.troopLevels = { ...model.state.troopLevels, headhunter: level };
          model.changed();
        } else if (!model.openReplay(recording.data))
          throw Error('Provided roster replay rejected');
        scene.sync();
        return {
          units: model.battle?.units.length ?? 0,
          projectiles: model.battle?.projectiles?.length ?? 0,
          flight: recording.flight,
          pending: scene.nativeProjectiles.packs.pending.has(
            'assets/projectiles-native/headhunter-card-lvl1/graph.json',
          ),
        };
      },
      { home, level },
    );
    expect(start.units).toBe(0);
    expect(start.projectiles).toBe(0);
    if (reduced) {
      expect(start.pending).toBe(false);
      expect(requested).toBe(0);
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.toggleReducedMotion();
        scene.sync();
      });
    }
    await expect.poll(() => requested).toBe(1);
    release();
    await page.waitForFunction(() =>
      window.__game.scene.nativeProjectiles.packs.packs.has(
        'assets/projectiles-native/headhunter-card-lvl1/graph.json',
      ),
    );
    if (home) {
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        if (!model.openReplay(window.__projectilePrefetch.data))
          throw Error('Warm army replay rejected');
        scene.sync();
      });
    }
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const first = await page.evaluate(async (at) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const { iso } = await import('/src/game/scene.ts');
      const point = iso(6.25, 5);
      scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 30);
      scene.drawOverlay(0);
      const shot = model.battle.projectiles.find(
        (shot) => shot.sourceId === window.__projectilePrefetch.unitId,
      );
      const entry = scene.nativeProjectiles.views.get(shot.id);
      return {
        native: shot.native.name,
        covered: scene.nativeProjectiles.covers(shot.id),
        drawn:
          !!entry &&
          entry.view.objects.some(
            (object) =>
              object.visible &&
              object.alpha > 0 &&
              object.texture?.key &&
              object.texture.key !== '__MISSING' &&
              object.texture.key !== '__DEFAULT',
          ),
      };
    }, start.flight);
    expect(first).toEqual({ native: `Headhunter_Card_lvl${level}`, covered: true, drawn: true });
    expect(requested).toBe(1);
    await page.screenshot({
      path: `output/playtest/projectile-prefetch-${width}${reduced ? '-motion-toggle' : ''}.png`,
    });
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
