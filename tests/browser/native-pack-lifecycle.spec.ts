import { expect, test } from '@playwright/test';

test('releases owned GPU pages while preserving another live projectile loader', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 960 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { headhunterHeroRecording } = await import('/tests/fixtures/headhunter-hero-rules.ts');
    const { model, scene } = window.__game;
    scene.paused = true;
    window.__packLifecycleRecording = headhunterHeroRecording();
    if (!model.openReplay(window.__packLifecycleRecording.data))
      throw Error('Shared pack replay rejected');
    scene.sync();
  });
  const shared = 'assets/projectiles-native/headhunter-card-lvl1/graph.json';
  await page.waitForFunction(
    (path) => window.__game.scene.nativeProjectiles.packs.packs.has(path),
    shared,
  );
  await page.evaluate(async (path) => {
    const { NativeArtPacks } = await import('/src/game/native-art-pack.ts');
    const packs = new NativeArtPacks(window.__game.scene);
    window.__sharedNativePack = packs;
    packs.get(path);
  }, shared);
  await page.waitForFunction((path) => !!window.__sharedNativePack.get(path), shared);
  const retained = await page.evaluate(async (path) => {
    const { nativeMeshTexture } = await import('/src/game/native-mesh.ts');
    const { nativePackPrefix, NativeArtPacks } = await import('/src/game/native-art-pack.ts');
    const { scene } = window.__game;
    const pack = window.__sharedNativePack.get(path);
    const keys = Object.entries(pack.scenes).flatMap(([name, graph]) =>
      Object.keys(graph.textures).map((id) => nativeMeshTexture(nativePackPrefix(path, name), id)),
    );
    const textures = keys.map((key) => scene.textures.get(key));
    window.__sharedNativePack.destroy();
    const kept = keys.every(
      (key, index) => scene.textures.exists(key) && scene.textures.get(key) === textures[index],
    );
    const unique = new NativeArtPacks(scene);
    window.__uniqueNativePack = unique;
    unique.get('assets/projectiles-native/ddreversalcardprojectile/graph.json');
    return { count: keys.length, kept };
  }, shared);
  expect(retained.count).toBeGreaterThan(0);
  expect(retained.kept).toBe(true);
  const uniquePath = 'assets/projectiles-native/ddreversalcardprojectile/graph.json';
  await page.waitForFunction((path) => !!window.__uniqueNativePack.get(path), uniquePath);
  const removed = await page.evaluate(async (path) => {
    const { nativeMeshTexture } = await import('/src/game/native-mesh.ts');
    const { nativePackPrefix } = await import('/src/game/native-art-pack.ts');
    const { model, scene } = window.__game;
    const pack = window.__uniqueNativePack.get(path);
    const keys = Object.entries(pack.scenes).flatMap(([name, graph]) =>
      Object.keys(graph.textures).map((id) => nativeMeshTexture(nativePackPrefix(path, name), id)),
    );
    const uploaded = keys.every((key) => scene.textures.exists(key));
    window.__uniqueNativePack.destroy();
    const freed = keys.every((key) => !scene.textures.exists(key));
    model.seekReplay(window.__packLifecycleRecording.flight);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(6.25, 5);
    scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    const shot = model.battle.projectiles.find(
      (shot) => shot.sourceId === window.__packLifecycleRecording.unitId,
    );
    const entry = scene.nativeProjectiles.views.get(shot.id);
    const drawn =
      !!entry &&
      entry.view.objects.some(
        (object) =>
          object.visible &&
          object.alpha > 0 &&
          object.texture?.key &&
          object.texture.key !== '__MISSING' &&
          object.texture.key !== '__DEFAULT',
      );
    return {
      count: keys.length,
      uploaded,
      freed,
      covered: scene.nativeProjectiles.covers(shot.id),
      drawn,
    };
  }, uniquePath);
  expect(removed.count).toBeGreaterThan(0);
  expect(removed).toMatchObject({ uploaded: true, freed: true, covered: true, drawn: true });
  await page.screenshot({ path: 'output/playtest/native-pack-shared-lifecycle.png' });
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  expect(errors).toEqual([]);
});

test('cancels a partially decoded native pack without restoring its GPU pages later', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    '**/assets/projectiles-native/airtrapballoon/buildings/texture-66.png',
    async (route) => {
      await held;
      await route.continue();
    },
  );
  const path = 'assets/projectiles-native/airtrapballoon/graph.json';
  let graphs = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/' + path) graphs++;
  });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (path) => {
    const { NativeArtPacks, nativePackPrefix } = await import('/src/game/native-art-pack.ts');
    const { nativeMeshTexture } = await import('/src/game/native-mesh.ts');
    const { scene } = window.__game;
    scene.paused = true;
    const original = HTMLImageElement.prototype.decode;
    window.__originalPackDecode = original;
    HTMLImageElement.prototype.decode = function () {
      const decoded = original.call(this);
      if (this.src.endsWith('/assets/projectiles-native/airtrapballoon/buildings/texture-66.png'))
        window.__lateNativePackDecode = decoded;
      return decoded;
    };
    window.__partialPackKeys = ['8', '66'].map((id) =>
      nativeMeshTexture(nativePackPrefix(path, 'buildings'), id),
    );
    window.__partialNativePack = new NativeArtPacks(scene);
    window.__partialNativePack.get(path);
  }, path);
  await page.waitForFunction(
    () =>
      window.__lateNativePackDecode &&
      window.__game.scene.textures.exists(window.__partialPackKeys[0]),
  );
  const partial = await page.evaluate(() => {
    const { scene } = window.__game;
    const before = window.__partialPackKeys.map((key) => scene.textures.exists(key));
    window.__partialNativePack.destroy();
    return { before, after: window.__partialPackKeys.map((key) => scene.textures.exists(key)) };
  });
  expect(partial).toEqual({ before: [true, false], after: [false, false] });
  release();
  const finished = await page.evaluate(async (path) => {
    await window.__lateNativePackDecode;
    await Promise.resolve();
    HTMLImageElement.prototype.decode = window.__originalPackDecode;
    return {
      textures: window.__partialPackKeys.map((key) => window.__game.scene.textures.exists(key)),
      pack: !!window.__partialNativePack.get(path),
      failed: window.__partialNativePack.unavailable(path),
    };
  }, path);
  expect(finished).toEqual({ textures: [false, false], pack: false, failed: false });
  expect(graphs).toBe(1);
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  expect(errors).toEqual([]);
});
