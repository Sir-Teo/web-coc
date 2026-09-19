import { test, expect } from '@playwright/test';

// Compare the real deferred troop loader against Phaser's ordinary image upload. The atlas
// has unrelated body parts above/below each UV region, so a flipped upload fragments units.
test('battle troop atlases match ordinary image uploads in both facings and survive restoration', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.heavyArtReady);
  await page.locator('[data-action="skip-tutorial"]').click();
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    scene.paused = true;
    scene.tweens.pauseAll();
    document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#45534f');
    const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
    const { nativeScenePoses } = await import('/src/game/native-mesh.ts');
    const kinds = ['swordsman', 'archer', 'giant', 'wallbreaker', 'dragon', 'minion'];
    const presentation = scene.troopNativePresentation;
    await Promise.all(kinds.map((kind) => presentation.load(kind)));
    const cases = [];
    for (const [i, kind] of kinds.entries()) {
      const pack = presentation.packs.get(kind);
      if (!pack) throw Error(`No troop pack: ${kind}`);
      for (let j = 0; j < 4; j++) {
        const state =
          pack.levels[j < 2 ? 0 : pack.levels.length - 1].states[j % 2 ? 'attack' : 'walk'];
        const graph = pack.scenes[state.scene];
        const prefix = `troop:${kind}:${state.scene}`;
        const reference = `reference:${kind}:${state.scene}`;
        for (const [id, texture] of Object.entries(graph.textures)) {
          const key = `${reference}:mesh:${id}`;
          if (scene.textures.exists(key)) continue;
          const image = new Image();
          image.src = '/' + texture.path;
          await image.decode();
          scene.textures.addImage(key, image);
        }
        const scale = state.scale * 1.4;
        cases.push({
          poses: nativeScenePoses(graph, state.exports[j % state.exports.length], 0.25, {}, [
            scale * (j % 2 ? -1 : 1),
            0,
            0,
            0,
            scale,
            0,
          ]),
          prefix,
          reference,
          x: 160 + j * 330,
          y: 155 + i * 175,
        });
      }
    }
    let views = [];
    const draw = (reference = false) => {
      for (const view of views) view.destroy();
      views = cases.map((c, i) => {
        const view = new NativeSceneView(scene, reference ? c.reference : c.prefix);
        view.render(c.poses, c.x, c.y, i * 10);
        return view;
      });
    };
    const gl = game.renderer.gl;
    const capture = () =>
      new Promise<Uint8Array>((resolve) =>
        game.events.once('postrender', () => {
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
          resolve(pixels);
        }),
      );
    const compare = (a: Uint8Array, b: Uint8Array) => {
      let different = 0,
        painted = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (
          a[i] !== b[i] ||
          a[i + 1] !== b[i + 1] ||
          a[i + 2] !== b[i + 2] ||
          a[i + 3] !== b[i + 3]
        )
          different++;
        if (b[i] !== 69 || b[i + 1] !== 83 || b[i + 2] !== 79) painted++;
      }
      return { different, painted };
    };
    draw();
    const actual = await capture();
    draw(true);
    const reference = await capture();
    draw();
    const extension = gl.getExtension('WEBGL_lose_context');
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
    const restored = await capture();
    return {
      initial: compare(actual, reference),
      restored: compare(restored, reference),
      error: gl.getError(),
    };
  });
  await page.screenshot({ path: 'output/playtest/troop-texture-upload.png' });
  expect(report.initial.painted).toBeGreaterThan(20000);
  expect(report.initial.different).toBe(0);
  expect(report.restored.different).toBe(0);
  expect(report.error).toBe(0);
});
