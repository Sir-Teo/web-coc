import fs from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1600, height: 1200 } });

test('all 21 live Cannon assemblies match their independent original-texture compositions', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { CANNON_ART } = await import('/src/game/cannon-art.ts');
    const { cannonBounds } = await import('/src/game/cannon-poses.ts');
    scene.paused = true;
    scene.tweens.pauseAll();
    document.querySelector('#ui').style.display = 'none';
    for (const o of scene.children.list) o.setVisible(false);
    const c = scene.cameras.main,
      zoom = 2 / CANNON_ART.scale;
    c.setZoom(zoom)
      .centerOn(c.width / 2 / zoom, c.height / 2 / zoom)
      .setBackgroundColor('#304135');
    // The independent original-texture composition uses two pixels per source unit
    // and retains additive glow against this exact backdrop.
    c.setForceComposite(true);
    const towers = Array.from({ length: 21 }, (_, i) => ({
      ...makeBuilding(i, 'cannon', i, 0, i + 1),
    }));
    const position = (x: number) => {
      const i = x - 1.5;
      return { x: ((i % 7) * 440 + 217) / zoom, y: (Math.floor(i / 7) * 370 + 222) / zoom };
    };
    const live = scene.cannonPresentation;
    live.render(towers, null, 0, false, position);
    const gl = game.renderer.gl,
      width = 3080,
      height = 1110;
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
    scene.load.image('cannon-live-source', '/tests/fixtures/native-cannon-live/reference.png');
    await new Promise<void>((resolve) => {
      scene.load.once('complete', resolve);
      scene.load.start();
    });
    const actual = await capture();
    for (const map of [live.towers])
      for (const view of map.values()) for (const o of view.objects) o.setVisible(false);
    // Flattened transparent portraits cannot preserve additive body glows on every backdrop.
    const image = scene.add
      .image(0, 0, 'cannon-live-source')
      .setOrigin(0, 0)
      .setScale(1 / zoom);
    const expected = await capture();
    image.destroy();
    for (const map of [live.towers])
      for (const view of map.values()) for (const o of view.objects) o.setVisible(true);
    const cases = towers.map((tower, i) => {
      let colored = 0,
        total = 0,
        large = 0,
        maximum = 0;
      for (let y = Math.floor(i / 7) * 370; y < Math.floor(i / 7) * 370 + 370; y++)
        for (let x = (i % 7) * 440; x < (i % 7) * 440 + 440; x++) {
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
        bounds: cannonBounds(tower.level),
      };
    });
    return {
      cases,
      glError: gl.getError(),
      towers: live.towers.size,
    };
  });
  console.log('Native Cannon live assembly', browserName, JSON.stringify(report));
  await page.screenshot({
    path: `output/playtest/native-cannon-live-assembly-${browserName}.png`,
  });
  await fs.writeFile(
    `output/playtest/native-cannon-live-assembly-${browserName}.json`,
    JSON.stringify(report, null, 2),
  );
  expect(report.glError).toBe(0);
  expect(report.towers).toBe(21);
  for (const c of report.cases) {
    expect(c.colored).toBeGreaterThan(1000);
    expect(c.meanError, `Level ${c.level}`).toBeLessThan(1);
    expect(c.largeFraction, `Level ${c.level}`).toBeLessThan(0.003);
  }
});
