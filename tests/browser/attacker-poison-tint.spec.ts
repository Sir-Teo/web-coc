import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  await page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((u) => u.id === window.__attackerPoison.unitId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(unit.x, unit.y);
    scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 40);
    scene.drawOverlay(0);
  }, at);
}

async function report(page: Page, hero: boolean) {
  return page.evaluate((hero) => {
    const { model, scene } = window.__game;
    scene.drawOverlay(0);
    const id = window.__attackerPoison.unitId;
    const unit = model.battle.units.find((u) => u.id === id);
    const fallback = scene.unitSprites.get(id);
    const objects = hero
      ? scene.children.list.filter((o) => o.getData?.('nativeHero') === id)
      : (scene.troopNativePresentation.views.get(id)?.view.objects ?? []);
    const visible = objects.filter((o) => o.visible && o.alpha > 0);
    return {
      hp: unit.hp,
      active: (unit.late?.garrison?.poison?.until ?? 0) > model.battle.elapsed,
      fallback: {
        tint: fallback.tintTopLeft,
        visible: fallback.visible,
        width: fallback.displayWidth,
      },
      native: visible.length,
      tints: visible.map((o) =>
        o.vertices !== undefined || o.nativeColored ? o.tint : o.tintTopLeft,
      ),
    };
  }, hero);
}

for (const hero of [false, true])
  for (const width of [1440, 390])
    test(`Headhunter Poison follows ${hero ? 'King' : 'Giant'} art handoff and replay expiry at ${width}px`, async ({
      page,
      browserName,
    }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route(
        hero
          ? '**/assets/characters/king-v1/atlas.json'
          : '**/assets/troops-native/giant/graph.json',
        async (route) => {
          await held;
          await route.continue();
        },
      );
      try {
        await page.goto('/?lazyart');
        await page.waitForFunction(() => window.__game?.scene.artSettled);
        await page.locator('[data-action="skip-tutorial"]').click();
        const times = await page.evaluate(async (hero) => {
          const { attackerPoisonTintRecording } =
            await import('/tests/fixtures/attacker-poison-tint.ts');
          const recording = attackerPoisonTintRecording(hero);
          window.__attackerPoison = recording;
          const { model, scene } = window.__game;
          scene.paused = true;
          if (!model.openReplay(recording.data)) throw Error('Attacker Poison replay rejected');
          scene.sync();
          return { poisoned: recording.poisoned, expired: recording.expired };
        }, hero);
        await page.waitForFunction(() => !window.__game.scene.battleArtPending());
        await seek(page, times.poisoned);
        await page.waitForFunction((hero) => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          const sprite = scene.unitSprites.get(window.__attackerPoison.unitId);
          return (
            sprite?.visible &&
            (hero ? sprite.texture.key !== 'troop-fallback' : sprite.texture.key === 'giant-walk')
          );
        }, hero);
        const fallback = await report(page, hero);
        expect(fallback.active).toBe(true);
        expect(fallback.native).toBe(0);
        expect(fallback.fallback.tint).toBe(0xa6e57a);
        expect(fallback.fallback.width).toBeGreaterThan(0);
        release();
        await expect
          .poll(async () => (await report(page, hero)).native, { timeout: 30000 })
          .toBeGreaterThan(0);
        const native = await report(page, hero);
        expect(native.tints).toContain(0xa6e57a);
        expect(native.fallback.visible).toBe(false);
        expect((await report(page, hero)).tints).toEqual(native.tints);
        await page.evaluate(() => {
          window.__game.model.state.settings.reducedMotion = true;
        });
        expect((await report(page, hero)).tints).toContain(0xa6e57a);
        await page.evaluate(() => {
          window.__game.model.state.settings.reducedMotion = false;
        });
        await page.screenshot({
          path: `output/playtest/attacker-poison-${hero ? 'king' : 'giant'}-${width}-${browserName}.png`,
        });
        await seek(page, times.expired);
        const expired = await report(page, hero);
        expect(expired.hp).toBeGreaterThan(0);
        expect(expired.active).toBe(false);
        expect(expired.fallback.tint).toBe(0xffffff);
        expect(expired.tints).not.toContain(0xa6e57a);
        await seek(page, times.poisoned);
        expect((await report(page, hero)).tints).toContain(0xa6e57a);
        await page.evaluate(() => {
          const { model, scene } = window.__game;
          const unit = model.battle.units.find((u) => u.id === window.__attackerPoison.unitId);
          unit.hp = 0;
          unit.defeatedAt = model.battle.elapsed;
          scene.drawOverlay(0);
        });
        const defeated = await report(page, hero);
        expect(defeated.tints).not.toContain(0xa6e57a);
        expect(defeated.fallback.tint).not.toBe(0xa6e57a);
        await page.evaluate(() => {
          const { model, scene } = window.__game;
          model.returnHome();
          model.changed();
          scene.sync();
          scene.drawOverlay(0);
        });
        expect(await page.evaluate(() => window.__game.scene.unitSprites.size)).toBe(0);
        expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
        expect(errors).toEqual([]);
      } finally {
        release();
      }
    });
