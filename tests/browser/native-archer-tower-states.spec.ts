import { expect, test } from '@playwright/test';
for (const first of [1, 8, 15])
  test(`original Archer Tower states and residents, tiers ${first}–${first + 6}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('#loading').waitFor({ state: 'detached' });
    const result = await page.evaluate(async (first) => {
      const { scene, game } = window.__game;
      const { ARCHER_TOWER_GRAPH, TOWER_ARCHER_GRAPH, archerTowerPoses, towerArcherPoses } =
        await import('/src/game/archer-tower-art.ts');
      const { preloadNativeMeshes } = await import('/src/game/native-mesh-scene.ts');
      const { NativeSceneView, nativeSceneBounds } = await import('/src/game/native-scene-view.ts');
      scene.paused = true;
      scene.tweens.pauseAll();
      document.querySelector('#ui').style.display = 'none';
      for (const child of scene.children.list) child.setVisible(false);
      scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#304135');
      preloadNativeMeshes(scene, ARCHER_TOWER_GRAPH, 'archer-body-gallery');
      preloadNativeMeshes(scene, TOWER_ARCHER_GRAPH, 'archer-resident-gallery');
      await new Promise<void>((resolve) => {
        scene.load.once('complete', resolve);
        scene.load.start();
      });
      const titles = [
        'Ready',
        'Alternate',
        'Construction',
        'Upgrade',
        'Ruin',
        'Idle 1',
        'Idle 2',
        'Idle 3',
        'Attack 1',
        'Attack 2',
        'Attack 3',
      ];
      const views = [];
      for (let level = first; level < first + 7; level++)
        for (let column = 0; column < 11; column++) {
          const x = column * 195 + 10,
            y = (level - first) * 205 + 12;
          scene.add.text(x, y, `${level} · ${titles[column]}`, {
            fontSize: '16px',
            color: '#ffffff',
          });
          if (column === 1 && level < 7) continue;
          const sample = (root?) =>
            column < 5
              ? archerTowerPoses(
                  level,
                  ['ready', 'ready', 'constructing', 'upgrading', 'ruin'][column],
                  0,
                  column === 1,
                  root,
                )
              : towerArcherPoses(
                  level,
                  column < 8 ? 'idle' : 'attack',
                  ((column - 5) % 3) + 1,
                  column < 8 ? 0 : 0.2,
                  root,
                );
          const bounds = nativeSceneBounds(sample());
          if (!bounds) throw Error('Empty original pose');
          const scale = Math.min(2, 165 / (bounds[2] - bounds[0]), 160 / (bounds[3] - bounds[1]));
          const root = [
            scale,
            0,
            82.5 - ((bounds[0] + bounds[2]) * scale) / 2,
            0,
            scale,
            80 - ((bounds[1] + bounds[3]) * scale) / 2,
          ];
          const view = new NativeSceneView(
            scene,
            column < 5 ? 'archer-body-gallery' : 'archer-resident-gallery',
          );
          view.render(sample(root), x, y + 28, 0);
          views.push(view);
        }
      await new Promise((resolve) => game.events.once('postrender', resolve));
      window.__archerGallery = views;
      return {
        count: views.length,
        visible: views.every((view) => view.objects.length > 0),
        gl: game.renderer.gl.getError(),
        width: game.renderer.gl.drawingBufferWidth,
        height: game.renderer.gl.drawingBufferHeight,
      };
    }, first);
    expect(result.count).toBe(first === 1 ? 71 : 77);
    expect(result.visible).toBe(true);
    expect(result.gl).toBe(0);
    expect(result.width).toBeGreaterThanOrEqual(2150);
    expect(result.height).toBeGreaterThanOrEqual(1450);
    await page.screenshot({
      path: `output/playtest/archer-tower-states-${first}-${browserName}.png`,
    });
    expect(
      await page.evaluate(() => {
        for (const view of window.__archerGallery) view.destroy();
        return window.__archerGallery.every((view) => view.objects.length === 0);
      }),
    ).toBe(true);
  });
