import { test, expect } from '@playwright/test';

test('all thirteen live tower assemblies match their independent original-source portraits', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { BOMB_TOWER_ART, bombTowerTexture } = await import('/src/game/bomb-tower-art.ts');
    const { bombTowerBounds } = await import('/src/game/bomb-tower-poses.ts');
    scene.paused = true;
    scene.tweens.pauseAll();
    document.querySelector('#ui').style.display = 'none';
    for (const o of scene.children.list) o.setVisible(false);
    const c = scene.cameras.main,
      zoom = 2 / BOMB_TOWER_ART.scale;
    c.setZoom(zoom)
      .centerOn(c.width / 2 / zoom, c.height / 2 / zoom)
      .setBackgroundColor('#304135');
    // Source portraits use two samples per source unit; use that same sampling
    // grid to test the actual production assembly and its ground registration.
    c.setForceComposite(true);
    const towers = Array.from({ length: 13 }, (_, i) => makeBuilding(i, 'bombtower', i, 0, i + 1));
    const position = (x: number) => {
      const i = x - 1.5;
      return { x: ((i % 5) * 400 + 180) / zoom, y: (Math.floor(i / 5) * 460 + 290) / zoom };
    };
    const live = scene.bombTowerPresentation;
    live.render(towers, null, 0, true, position);
    const gl = game.renderer.gl,
      width = 2000,
      height = 1380;
    const capture = () =>
      new Promise<Uint8Array>((resolve) =>
        game.events.once('postrender', () => {
          const pixels = new Uint8Array(width * height * 4);
          gl.readPixels(
            0,
            gl.drawingBufferHeight - height,
            width,
            height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
          resolve(pixels);
        }),
      );
    const actual = await capture();
    for (const map of [live.towers, live.defenders])
      for (const view of map.values()) for (const o of view.objects) o.setVisible(false);
    const images = towers.map((tower) => {
      const p = position(tower.x + 1.5);
      return scene.add
        .image(p.x, p.y, bombTowerTexture(tower.level))
        .setOrigin(BOMB_TOWER_ART.originX, BOMB_TOWER_ART.originY)
        .setDisplaySize(BOMB_TOWER_ART.width, BOMB_TOWER_ART.height);
    });
    const expected = await capture();
    for (const im of images) im.destroy();
    for (const map of [live.towers, live.defenders])
      for (const view of map.values()) for (const o of view.objects) o.setVisible(true);
    const cases = towers.map((tower, i) => {
      let colored = 0,
        total = 0,
        large = 0,
        maximum = 0;
      for (let y = Math.floor(i / 5) * 460; y < Math.floor(i / 5) * 460 + 460; y++)
        for (let x = (i % 5) * 400; x < (i % 5) * 400 + 400; x++) {
          const at = ((height - 1 - y) * width + x) * 4;
          const a = actual.slice(at, at + 3),
            e = expected.slice(at, at + 3);
          if (a.some((v, n) => v !== [48, 65, 53][n]) || e.some((v, n) => v !== [48, 65, 53][n])) {
            colored++;
            const error = Math.max(...a.map((v, n) => Math.abs(v - e[n])));
            total += error;
            maximum = Math.max(maximum, error);
            if (error > 16) large++;
          }
        }
      return {
        level: tower.level,
        colored,
        meanError: total / colored,
        largeFraction: large / colored,
        maximum,
        bounds: bombTowerBounds(tower.level),
      };
    });
    return {
      cases,
      glError: gl.getError(),
      towers: live.towers.size,
      defenders: live.defenders.size,
    };
  });
  console.log('Native Bomb Tower live assembly', browserName, JSON.stringify(report));
  await page.screenshot({
    path: `output/playtest/native-bomb-tower-live-assembly-${browserName}.png`,
  });
  expect(report.glError).toBe(0);
  expect([report.towers, report.defenders]).toEqual([13, 13]);
  for (const c of report.cases) {
    expect(c.colored).toBeGreaterThan(10000);
    expect(c.meanError, `Level ${c.level}`).toBeLessThan(1);
    expect(c.largeFraction, `Level ${c.level}`).toBeLessThan(0.003);
  }
});
