import fs from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1250, height: 1200 } });

test('all 56 live Air Sweeper assemblies match their independent original-source portraits', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { SWEEPER_ART, sweeperTexture } = await import('/src/game/air-control-art.ts');
    const { sweeperBounds } = await import('/src/game/air-sweeper-poses.ts');
    scene.paused = true;
    scene.tweens.pauseAll();
    document.querySelector('#ui').style.display = 'none';
    for (const o of scene.children.list) o.setVisible(false);
    const c = scene.cameras.main,
      zoom = 2 / SWEEPER_ART.scale;
    c.setZoom(zoom)
      .centerOn(c.width / 2 / zoom, c.height / 2 / zoom)
      .setBackgroundColor('#304135');
    // Source portraits use two samples per source unit; use that same sampling
    // grid to test the actual production assembly and its ground registration.
    c.setForceComposite(true);
    const towers = Array.from({ length: 56 }, (_, i) => ({
      ...makeBuilding(i, 'airsweeper', i, 0, Math.floor(i / 8) + 1),
      direction: i % 8,
    }));
    const position = (x: number) => {
      const i = x - 1;
      return { x: ((i % 8) * 300 + 150) / zoom, y: (Math.floor(i / 8) * 330 + 204) / zoom };
    };
    const live = scene.sweeperPresentation;
    live.render(towers, null, 0, false, position);
    const gl = game.renderer.gl,
      width = 2400,
      height = 2310;
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
    for (const map of [live.towers])
      for (const view of map.values()) for (const o of view.objects) o.setVisible(false);
    const images = towers.map((tower) => {
      const p = position(tower.x + 1);
      return scene.add
        .image(p.x, p.y, sweeperTexture(tower.level, tower.direction))
        .setOrigin(SWEEPER_ART.originX, SWEEPER_ART.originY)
        .setDisplaySize(SWEEPER_ART.width, SWEEPER_ART.height);
    });
    const expected = await capture();
    for (const im of images) im.destroy();
    for (const map of [live.towers])
      for (const view of map.values()) for (const o of view.objects) o.setVisible(true);
    const cases = towers.map((tower, i) => {
      let colored = 0,
        total = 0,
        large = 0,
        maximum = 0;
      for (let y = Math.floor(i / 8) * 330; y < Math.floor(i / 8) * 330 + 330; y++)
        for (let x = (i % 8) * 300; x < (i % 8) * 300 + 300; x++) {
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
        direction: tower.direction,
        colored,
        meanError: total / colored,
        largeFraction: large / colored,
        maximum,
        bounds: sweeperBounds(tower.level),
      };
    });
    return {
      cases,
      glError: gl.getError(),
      towers: live.towers.size,
    };
  });
  console.log('Native Air Sweeper live assembly', browserName, JSON.stringify(report));
  await page.screenshot({
    path: `output/playtest/native-air-sweeper-live-assembly-${browserName}.png`,
  });
  await fs.writeFile(
    `output/playtest/native-air-sweeper-live-assembly-${browserName}.json`,
    JSON.stringify(report, null, 2),
  );
  expect(report.glError).toBe(0);
  expect(report.towers).toBe(56);
  for (const c of report.cases) {
    expect(c.colored).toBeGreaterThan(10000);
    expect(c.meanError, `Level ${c.level}`).toBeLessThan(1);
    expect(c.largeFraction, `Level ${c.level}`).toBeLessThan(0.003);
  }
});
