import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import index from '../fixtures/native-cannon-mesh/index.json' with { type: 'json' };
// displaySize caps the actual framebuffer at 16 million pixels. Render source
// sheets in row-aligned strips, keeping the original independent PNGs intact.
const witnesses = index.flatMap(({ category }) => {
  const source = JSON.parse(
    readFileSync(`tests/fixtures/native-cannon-mesh/${category}.json`, 'utf8'),
  );
  const stripHeight = source.cell * 20;
  return Array.from({ length: Math.ceil(source.height / stripHeight) }, (_, i) => {
    const sourceY = i * stripHeight;
    return {
      ...source,
      sourceCategory: category,
      sourceY,
      category: source.height > stripHeight ? `${category}-part-${i + 1}` : category,
      height: Math.min(stripHeight, source.height - sourceY),
      cases: source.cases
        .filter((c) => c.y >= sourceY && c.y < sourceY + stripHeight)
        .map((c) => ({ ...c, sourceY: c.y, y: c.y - sourceY })),
    };
  });
});

for (const witness of witnesses)
  test(`native Cannon ${witness.category} matches original pixels and survives context restoration`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1250, height: Math.ceil(witness.height / 2) + 50 });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('#loading').waitFor({ state: 'detached' });
    const report = await page.evaluate(async (reference) => {
      const { scene, game } = window.__game;
      const { default: world } = await import('/reference/cannon/runtime.json');

      const { nativeScenePoses } = await import('/src/game/native-mesh.ts');
      const { preloadNativeMeshes } = await import('/src/game/native-mesh-scene.ts');
      const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
      document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
      scene.paused = true;
      scene.tweens.pauseAll();
      for (const child of scene.children.list) child.setVisible(false);
      scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor(reference.background);
      preloadNativeMeshes(scene, world, 'cannon-test-world');
      scene.load.image(
        'cannon-source-reference',
        `/tests/fixtures/native-cannon-mesh/${reference.sourceCategory}.png`,
      );
      await new Promise<void>((resolve) => {
        scene.load.once('complete', resolve);
        scene.load.start();
      });
      const views = reference.cases.map((c) => {
        const view = new NativeSceneView(scene, 'cannon-test-world');
        const poses = c.base ? nativeScenePoses(world, c.base, 0, {}, c.root) : [];
        poses.push(...nativeScenePoses(world, c.export, c.time, c.controls, c.root));
        if (c.particleBlend !== undefined) for (const pose of poses) pose.blend = c.particleBlend;
        view.render(poses, c.x, c.y, 0);
        return view;
      });
      const gl = game.renderer.gl;
      if (gl.drawingBufferWidth < reference.width || gl.drawingBufferHeight < reference.height)
        throw Error(
          `Source comparison exceeds framebuffer: ${reference.width}×${reference.height} vs ${gl.drawingBufferWidth}×${gl.drawingBufferHeight}`,
        );
      const glErrors = [gl.getError()];
      const capture = () =>
        new Promise<Uint8Array>((resolve) =>
          game.events.once('postrender', () => {
            const pixels = new Uint8Array(reference.width * reference.height * 4);
            gl.readPixels(
              0,
              gl.drawingBufferHeight - reference.height,
              reference.width,
              reference.height,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixels,
            );
            glErrors.push(gl.getError());
            resolve(pixels);
          }),
        );
      const multisampled = await capture();
      const defaultFramebufferSamples = gl.getParameter(gl.SAMPLES);
      const node = game.renderer.renderNodes.getNode('BatchHandlerTri');
      const slots = node.maxTexturesPerBatch;
      node.updateTextureCount(1);
      const single = await capture();
      node.updateTextureCount(slots);
      const extension = gl.getExtension('WEBGL_lose_context');
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
      const restored = await capture();
      // CPU witnesses sample pixel centers. Compare through a single-sample
      // texture framebuffer; the default canvas uses MSAA polygon edge coverage.
      // Lifecycle and batching above still exercise the production canvas path.
      scene.cameras.main.setForceComposite(true);
      const actual = await capture();
      for (const view of views) for (const object of view.objects) object.setVisible(false);
      const image = scene.add
        .image(0, -reference.sourceY, 'cannon-source-reference')
        .setOrigin(0, 0);
      const expected = await capture();
      image.destroy();
      for (const view of views) for (const object of view.objects) object.setVisible(true);
      const cases = reference.cases.map((c) => {
        const largePixels: { x: number; y: number; actual: number[]; expected: number[] }[] = [];
        let colored = 0,
          total = 0,
          large = 0,
          maximum = 0;
        for (let y = c.y; y < c.y + reference.cell; y++)
          for (let x = c.x; x < c.x + reference.cell; x++) {
            const at = ((reference.height - 1 - y) * reference.width + x) * 4;
            const a = actual.slice(at, at + 3),
              e = expected.slice(at, at + 3);
            if (
              a.some((v, i) => v !== [48, 65, 53][i]) ||
              e.some((v, i) => v !== [48, 65, 53][i])
            ) {
              colored++;
              const error = Math.max(...a.map((v, i) => Math.abs(v - e[i])));
              total += error;
              maximum = Math.max(maximum, error);
              if (error > 16) {
                large++;
                if (largePixels.length < 32)
                  largePixels.push({ x: x - c.x, y: y - c.y, actual: [...a], expected: [...e] });
              }
            }
          }
        return {
          export: c.export,
          time: c.time,
          controls: c.controls,
          category: c.category,
          emitter: c.emitter,
          colored,
          empty: c.empty,
          meanError: colored ? total / colored : 0,
          largeFraction: colored ? large / colored : 0,
          maximum,
          largePixels,
        };
      });
      const changed = (other: Uint8Array) => {
        let count = 0;
        for (let i = 0; i < multisampled.length; i++) if (multisampled[i] !== other[i]) count++;
        return count;
      };
      return {
        cases,
        sourceCategory: reference.sourceCategory,
        sourceY: reference.sourceY,
        framebuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
        compared: { width: reference.width, height: reference.height },
        defaultFramebufferSamples,
        singleTextureChanges: changed(single),
        contextChanges: changed(restored),
        meshes: views.reduce((n, v) => n + v.meshes.size, 0),
        groups: views.reduce((n, v) => n + v.groups.size, 0),
        // Isolated groups plus additive/screen leaves (single-leaf groups draw directly).
        blended: views.reduce(
          (n, v) =>
            n + v.groups.size + [...v.meshes.values()].filter((m) => m.blendMode !== 0).length,
          0,
        ),
        tintedTextures: scene.textures
          .getTextureKeys()
          .filter((k) => k.startsWith('cannon-test') && k.includes(':color:')).length,
        glError: gl.getError(),
        glErrors,
        clip: {
          x: game.canvas.getBoundingClientRect().left,
          y: game.canvas.getBoundingClientRect().top,
          width: (reference.width * game.canvas.getBoundingClientRect().width) / game.canvas.width,
          height:
            (reference.height * game.canvas.getBoundingClientRect().height) / game.canvas.height,
        },
      };
    }, witness);
    await (
      await import('node:fs/promises')
    ).writeFile(
      `output/playtest/native-cannon-${witness.category}-${browserName}.json`,
      JSON.stringify(report, null, 2),
    );
    console.log('Native Cannon GPU comparison', browserName, JSON.stringify(report));
    await page.screenshot({
      path: `output/playtest/native-cannon-${witness.category}-${browserName}.png`,
      clip: report.clip,
    });
    expect(report.framebuffer.width).toBeGreaterThanOrEqual(report.compared.width);
    expect(report.framebuffer.height).toBeGreaterThanOrEqual(report.compared.height);
    expect(report.glError).toBe(0);
    expect(report.glErrors).toEqual([0, 0, 0, 0, 0, 0]);
    expect(report.singleTextureChanges).toBe(0);
    expect(report.contextChanges).toBe(0);
    expect(report.meshes).toBeGreaterThan(0);
    if (witness.category === 'effects') expect(report.blended).toBeGreaterThan(0);
    expect(report.cases).toHaveLength(witness.cases.length);
    for (const c of report.cases) {
      if (c.empty) {
        expect(c.colored).toBe(0);
        expect(c.maximum).toBe(0);
      } else expect(c.colored).toBeGreaterThan(0);
      expect(c.meanError, `${c.export}:${c.time}`).toBeLessThan(1);
      expect(c.largeFraction, `${c.export}:${c.time}`).toBeLessThan(0.003);
    }
  });
