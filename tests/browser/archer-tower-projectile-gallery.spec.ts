import { test, expect } from '@playwright/test';
test('original arrow variants face ground and airborne targets in every quadrant', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 850, height: 770 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const result = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { archerTowerProjectilePose } = await import('/src/game/archer-tower-projectile.ts');
    const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
    const { nativeMatrix } = await import('/src/game/native-mesh.ts');
    scene.paused = true;
    document.querySelector('#ui').style.display = 'none';
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#304135');
    const iso = (x, y) => ({ x: (x - y) * 32, y: (x + y) * 16 });
    const enlarge = (poses) =>
      poses.map((p) =>
        'group' in p
          ? { ...p, group: enlarge(p.group) }
          : { ...p, matrix: nativeMatrix([2, 0, 0, 0, 2, 0], p.matrix) },
      );
    const views = [];
    for (const level of [1, 4, 7, 11])
      for (const airborne of [false, true])
        for (let direction = 0; direction < 8; direction++) {
          const dx = Math.cos((direction * Math.PI) / 4) * 10,
            dy = Math.sin((direction * Math.PI) / 4) * 10;
          const p = {
            id: String(views.length),
            sourceId: 1,
            targetId: 2,
            targetBuilding: false,
            weapon: 'arrow',
            variant: level,
            fromX: 0,
            fromY: 0,
            x: dx,
            y: dy,
            launched: 1,
            impact: 2,
            damage: 1,
            flight: { x: dx * 0.4, y: dy * 0.4, at: 1.2 },
          };
          const pose = archerTowerProjectilePose(p, 1.2, iso, airborne ? 96 : 16);
          const x = direction * 200 + 100,
            y = Math.floor(views.length / 8) * 180 + 105;
          scene.add.text(x - 65, y - 90, `L${level} ${airborne ? 'Air' : 'Ground'} ${direction}`, {
            fontSize: '16px',
            color: '#fff',
          });
          const view = new NativeSceneView(scene, 'archer-tower-projectile');
          view.render(enlarge(pose.poses), x, y, 1);
          if (!view.objects.length) throw Error('Missing source arrow view');
          views.push(view);
        }
    await new Promise((resolve) => game.events.once('postrender', resolve));
    return {
      count: views.length,
      gl: game.renderer.gl.getError(),
      width: game.renderer.gl.drawingBufferWidth,
      height: game.renderer.gl.drawingBufferHeight,
    };
  });
  expect(result.count).toBe(64);
  expect(result.gl).toBe(0);
  expect(result.width).toBeGreaterThanOrEqual(1600);
  expect(result.height).toBeGreaterThanOrEqual(1440);
  await page.screenshot({
    path: `output/playtest/archer-tower-projectile-gallery-${browserName}.png`,
  });
});
