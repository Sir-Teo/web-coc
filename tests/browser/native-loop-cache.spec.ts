import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('real Archer loops reuse immutable poses with identical pixels after context restoration', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.waitForFunction(() => {
    const art = window.__game.scene.troopNativePresentation;
    return !art.pending.size && !art.pendingLevels.size;
  });
  const result = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    scene.paused = true;
    scene.tweens.pauseAll();
    game.anims.pauseAll();
    game.loop.setFPSLimit(0);
    const resource = (path: string) =>
      performance.getEntriesByType('resource').find((entry) => entry.name.includes(path))!.name;
    const { setMaxDensity } = await import(/* @vite-ignore */ resource('/src/game/display.ts'));
    setMaxDensity(game, 1);
    const { nativeScenePoses, nativeScenePosesShared } = await import(
      /* @vite-ignore */ resource('/src/game/native-mesh.ts')
    );
    const { NativeSceneView } = await import(
      /* @vite-ignore */ resource('/src/game/native-scene-view.ts')
    );
    const pack = await (await fetch('/assets/troops-native/archer/graph.json')).json();
    const state = pack.levels.find((row) => row.level === 1).states.walk;
    const graph = pack.scenes[state.scene];
    const name = state.exports[0];
    const root = [0.6, 0, 0, 0, 0.6, 0];
    const first = nativeScenePosesShared(graph, name, 16 / 24, {}, root);
    const repeated = nativeScenePosesShared(graph, name, 32 / 24, {}, root);
    const fresh = nativeScenePoses(graph, name, 48 / 24, {}, root);
    const original = JSON.stringify(first);
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1);
    const view = new NativeSceneView(scene, `troop:archer:${state.scene}`);
    const capture = async (poses) => {
      for (let i = 0; i < 3; i++) {
        view.render(poses, 195, 450, 1);
        await new Promise<void>((resolve) => game.events.once('postrender', resolve));
      }
      const gl = game.renderer.gl;
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    };
    const empty = await capture([]);
    const baseline = await capture(first);
    const loop = await capture(repeated);
    const independent = await capture(fresh);
    const extension = game.renderer.gl.getExtension('WEBGL_lose_context');
    if (!extension) throw Error('Context-loss extension unavailable');
    await new Promise<void>((resolve) => {
      game.canvas.addEventListener(
        'webglcontextlost',
        () => setTimeout(() => extension.restoreContext(), 50),
        { once: true },
      );
      game.canvas.addEventListener(
        'webglcontextrestored',
        () => {
          scene.paused = true;
          resolve();
        },
        { once: true },
      );
      extension.loseContext();
    });
    const restoredPose = nativeScenePosesShared(graph, name, 64 / 24, {}, root);
    const restored = await capture(restoredPose);
    view.destroy();
    return {
      reused: first === repeated && first === restoredPose,
      immutable: JSON.stringify(first) === original,
      exactPose: original === JSON.stringify(fresh),
      empty,
      baseline,
      loop,
      independent,
      restored,
    };
  });
  expect(result.reused).toBe(true);
  expect(result.immutable).toBe(true);
  expect(result.exactPose).toBe(true);
  expect(result.baseline).not.toBe(result.empty);
  expect(result.loop).toBe(result.baseline);
  expect(result.independent).toBe(result.baseline);
  expect(result.restored).toBe(result.baseline);
  expect(errors).toEqual([]);
});
