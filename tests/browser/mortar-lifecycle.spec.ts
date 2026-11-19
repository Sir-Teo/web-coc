import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('Mortar meshes wait for their atlas after eviction and survive context restoration', async ({
  page,
}, info) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').tap();
  const raid = () =>
    page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model, scene } = window.__game;
      model.startBattle(0, true);
      model.battle!.buildings = [
        makeBuilding(8100, 'townhall', 20, 20, 2),
        makeBuilding(8101, 'mortar', 16, 19, 1),
        makeBuilding(8102, 'mortar', 23, 24, 6),
      ];
      model.changed();
      scene.sync();
    });
  const art = () =>
    page.evaluate(() => {
      const { scene } = window.__game;
      const sprite = scene.sprites.get(8101);
      return {
        fallback: !!sprite?.visible && sprite.alpha > 0 && sprite.texture.key === 'mortar',
        atlas: scene.textures.exists('mortar:mesh:36'),
        native: [8101, 8102].map(
          (id) => scene.mortarPresentation.towers.get(id)?.objects.some((o) => o.visible) ?? false,
        ),
      };
    });
  const ready = { fallback: false, atlas: true, native: [true, true] };
  await raid();
  await expect.poll(art).toEqual(ready);
  await page.locator('.end-battle[data-action="home"]').tap();
  await page.waitForFunction(() => window.__game.scene.artSettled);
  await page.evaluate(() => {
    const { scene } = window.__game;
    // Advance the same idle cleanup the scene uses after 20 seconds at home.
    scene.familyCheckAt = 0;
    scene.familyIdleSince = 0;
    scene.releaseIdleFamilies(scene.time.now + 21_000);
  });
  expect((await art()).atlas).toBe(false);

  const atlas = '**/assets/buildings/mortar-native/texture/texture-36.png';
  let failed = 0;
  await page.route(atlas, (route) => {
    failed++;
    return route.fulfill({ status: 503, body: 'Temporary atlas outage' });
  });
  await raid();
  await expect.poll(() => failed).toBeGreaterThan(0);
  await expect(page.locator('#toast')).toContainText('Some village art could not load');
  await expect.poll(art).toEqual({ fallback: true, atlas: false, native: [false, false] });
  await page.screenshot({ path: info.outputPath('mortar-fallback.png') });

  await page.unroute(atlas);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(art, { timeout: 20000 }).toEqual(ready);

  await page.evaluate(async () => {
    const { game } = window.__game;
    const extension = game.renderer.gl.getExtension('WEBGL_lose_context');
    if (!extension) throw Error('Context-loss extension unavailable');
    await new Promise<void>((resolve) => {
      game.canvas.addEventListener(
        'webglcontextlost',
        () => setTimeout(() => extension.restoreContext(), 50),
        { once: true },
      );
      game.canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true });
      extension.loseContext();
    });
  });
  await expect.poll(art).toEqual(ready);
  await page.screenshot({ path: info.outputPath('mortar-context-restored.png') });
  await page.locator('.end-battle[data-action="home"]').tap();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model } = window.__game;
    model.townhall!.level = 6;
    model.state.gold = 1_000_000;
    model.state.buildings.push(makeBuilding(8101, 'mortar', 16, 19, 1));
    model.state.nextId = Math.max(8102, model.state.nextId);
    model.selected = 8101;
    model.changed();
  });
  await page.locator('[data-action="upgrade:8101"]').tap();
  await page.evaluate(() => {
    const { model } = window.__game;
    const end = model.state.buildings.find((b) => b.id === 8101)!.upgradeEnd;
    if (!end) throw Error('Mortar upgrade did not start');
    model.tick(end);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { scene } = window.__game;
        const object = scene.mortarPresentation.towers.get(8101)?.objects.find((o) => o.visible);
        return {
          level: object?.getData('nativeMortar').level,
          fallbackAlpha: scene.sprites.get(8101)?.alpha,
          portrait: scene.textures.exists('mortar-level-2'),
        };
      }),
    )
    .toEqual({ level: 2, fallbackAlpha: 0, portrait: true });
});
