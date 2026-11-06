import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';

for (const profile of [
  {
    name: 'desktop',
    width: 960,
    height: 640,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
])
  test.describe(profile.name, () => {
    test.use({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
    });
    test('source geometry culling preserves pixels and restores buildings across camera changes', async ({
      page,
    }) => {
      test.setTimeout(180000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.evaluate(async () => {
        const { makeBuilding } = await import('/src/game/model.ts');
        const { model, scene } = window.__game;
        model.state.obstacles = [];
        model.state.buildings = [
          ...Array.from({ length: 128 }, (_, i) =>
            makeBuilding(1000 + i, 'wall', 8 + (i % 16), 8 + Math.floor(i / 16), i % 2 ? 12 : 13),
          ),
          makeBuilding(2000, 'goldmine', 26, 10, 17),
          makeBuilding(2001, 'elixirstorage', 10, 27, 19),
          makeBuilding(2002, 'townhall', 30, 30, 18),
        ];
        model.changed();
        scene.sync();
        scene.resetCamera();
        const p = scene.villageNativePresentation;
        await Promise.all(
          ['wall', 'goldmine', 'elixirstorage', 'townhall'].map((kind) => p.load(kind)),
        );
      });
      await page.waitForFunction(() => {
        const p = window.__game.scene.villageNativePresentation;
        return ['wall', 'goldmine', 'elixirstorage', 'townhall'].every((kind) => p.packs.has(kind));
      });
      // The optimized presentation deliberately defers pages outside the viewport.
      // Load the whole comparison fixture before presenting the unculled reference.
      await page.evaluate(async () => {
        const p = window.__game.scene.villageNativePresentation;
        await Promise.all(
          [
            ['wall', 12],
            ['wall', 13],
            ['goldmine', 17],
            ['elixirstorage', 19],
            ['townhall', 18],
          ].map(([kind, level]) => p.loadLevel(kind, undefined, level)),
        );
      });
      await page.waitForFunction(
        () => {
          const p = window.__game.scene.villageNativePresentation;
          return (
            p.levelsReady.get('wall')?.has(12) &&
            p.levelsReady.get('wall')?.has(13) &&
            p.levelsReady.get('goldmine')?.has(17) &&
            p.levelsReady.get('elixirstorage')?.has(19) &&
            p.levelsReady.get('townhall')?.has(18)
          );
        },
        {},
        { timeout: 120000 },
      );
      const result = await page.evaluate(async () => {
        const { scene, game, model } = window.__game;
        const p = scene.villageNativePresentation;
        scene.paused = true;
        scene.tweens.pauseAll();
        document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
        const displayModule = performance
          .getEntriesByType('resource')
          .find((e) => e.name.includes('/src/game/display.ts'))!.name;
        const { setMaxDensity } = await import(/* @vite-ignore */ displayModule);
        setMaxDensity(game, 0.5);
        setMaxDensity(game, 1);
        const shakeModule = performance
          .getEntriesByType('resource')
          .find((e) => e.name.includes('/src/game/camera-shake-layer.ts'))!.name;
        const { CameraShakeLayer } = await import(/* @vite-ignore */ shakeModule);
        for (const child of scene.children.list) child.setVisible(false);
        p.still.clear();
        p.hidden.clear();
        p.preview();
        p.storageFill = () => 0.5;
        for (const entries of p.views.values())
          for (const entry of entries.values()) entry.signature = undefined;
        const buildings = model.state.buildings.map((b) => ({ ...b }));
        const originalHp = new Map(buildings.map((b) => [b.id, b.hp]));
        const camera = scene.cameras.main;
        camera.removeBounds().setBackgroundColor('#304135');
        const iso = (x: number, y: number) => ({ x: 896 + (x - y) * 32, y: (x + y) * 16 });
        const frame = () => new Promise<void>((resolve) => game.events.once('postrender', resolve));
        const capture = () =>
          new Promise<Uint8Array>((resolve) =>
            game.events.once('postrender', () => {
              const gl = game.renderer.gl;
              const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
              gl.readPixels(
                0,
                0,
                gl.drawingBufferWidth,
                gl.drawingBufferHeight,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                bytes,
              );
              resolve(bytes);
            }),
          );
        const countVisible = () =>
          [...p.views.values()]
            .flatMap((entries) => [...entries.values()])
            .reduce(
              (n, entry) => n + entry.view.objects.filter((object) => object.visible).length,
              0,
            );
        const comparisons = [];
        const glErrors = [];
        for (const [index, config] of [
          { x: 896, y: 480, zoom: 1.5, state: 'idle' },
          { x: 400, y: 600, zoom: 1.5, state: 'idle' },
          { x: 1408, y: 470, zoom: 2.2, state: 'idle' },
          { x: 1408, y: 0, zoom: 2.2, state: 'idle', roofOnly: true },
          { x: 896, y: 800, zoom: 0.8, state: 'idle' },
          { x: 1408, y: 470, zoom: 1.5, state: 'damaged' },
          { x: 400, y: 600, zoom: 1.5, state: 'construction' },
          { x: 896, y: 480, zoom: 1.5, state: 'idle', shake: true },
          { x: 896, y: 480, zoom: 1.3, state: 'idle', rotation: 0.18 },
          { x: 896, y: 480, zoom: 1.5, state: 'idle' },
        ].entries()) {
          for (const b of buildings) {
            b.hp = config.state === 'damaged' && b.kind !== 'wall' ? 0 : originalHp.get(b.id)!;
            b.constructing = config.state === 'construction' && b.kind !== 'wall';
          }
          camera
            .setZoom(config.zoom)
            .setRotation(config.rotation ?? 0)
            .centerOn(config.x, config.roofOnly ? 585 - camera.height / config.zoom / 2 : config.y);
          const shake = config.shake
            ? new CameraShakeLayer(camera, () => ({ x: 60, y: -45 }))
            : undefined;
          await frame();
          const saved = {
            x: camera.worldView.x,
            y: camera.worldView.y,
            width: camera.worldView.width,
            height: camera.worldView.height,
          };
          // The reference presents every building. This changes only the metadata read by
          // early culling; the camera's real projection and GPU clipping stay unchanged.
          camera.worldView.setTo(-1e6, -1e6, 2e6, 2e6);
          p.render(buildings, null, 1.25, iso, scene.sprites);
          camera.worldView.setTo(saved.x, saved.y, saved.width, saved.height);
          const allVisible = countVisible();
          const reference = await capture();
          p.render(buildings, null, 1.25, iso, scene.sprites);
          const culledVisible = countVisible();
          const actual = await capture();
          const goldVisible = [...(p.views.get(2000)?.values() ?? [])].some((entry) =>
            entry.view.objects.some((object) => object.visible),
          );
          let changed = 0;
          for (let i = 0; i < reference.length; i++) if (reference[i] !== actual[i]) changed++;
          comparisons.push({
            index,
            ...config,
            changed,
            allVisible,
            culledVisible,
            hidden: p.hidden.size,
            goldVisible,
          });
          glErrors.push(game.renderer.gl.getError());
          shake?.destroy();
        }
        return {
          comparisons,
          glErrors,
          views: p.views.size,
          framebuffer: [game.canvas.width, game.canvas.height],
        };
      });
      await fs.mkdir('output/playtest', { recursive: true });
      await fs.writeFile(
        `output/playtest/village-geometry-culling-${profile.name}.json`,
        JSON.stringify(result, null, 2),
      );
      await page.screenshot({
        path: `output/playtest/village-geometry-culling-${profile.name}.png`,
      });
      expect(errors).toEqual([]);
      expect(result.glErrors).toEqual(result.glErrors.map(() => 0));
      expect(result.comparisons.map((c) => c.changed)).toEqual(result.comparisons.map(() => 0));
      expect(result.views).toBe(131);
      expect(result.comparisons[0].culledVisible).toBeLessThan(result.comparisons[0].allVisible);
      expect(result.comparisons.find((c) => c.roofOnly)!.goldVisible).toBe(true);
      expect(result.comparisons.some((c) => c.culledVisible < c.allVisible / 2)).toBe(true);
      expect(result.comparisons.at(-1)!.culledVisible).toBe(result.comparisons[0].culledVisible);
    });
  });
