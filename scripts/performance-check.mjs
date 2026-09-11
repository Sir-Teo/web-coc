import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { loadavg, availableParallelism } from 'node:os';
const hostLoadStart = loadavg();
const metal = process.argv.includes('--metal');
if (metal && process.platform !== 'darwin') throw Error('--metal requires macOS.');
const browser = await chromium.launch(metal ? { args: ['--use-angle=metal'] } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://localhost:5173');
await page.waitForFunction(() => window.__game?.scene.ready);
await page.locator('[data-action="skip-tutorial"]').click();
const renderer = await page.evaluate(() => {
  const gl = window.__game.game.renderer.gl;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
if (metal && !renderer.includes('Metal')) {
  await browser.close();
  throw Error(`Metal was requested, but Chromium selected ${renderer}.`);
}
async function measure() {
  await page.waitForTimeout(500);
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        const start = last;
        function frame(now) {
          deltas.push(now - last);
          last = now;
          if (now - start < 4000) {
            requestAnimationFrame(frame);
            return;
          }
          const sorted = deltas.slice(1).sort((a, b) => a - b);
          resolve({
            frames: sorted.length,
            meanFps: Math.round(1000 / (sorted.reduce((a, b) => a + b, 0) / sorted.length)),
            p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
          });
        }
        requestAnimationFrame(frame);
      }),
  );
}
const idle = await measure();
let fullCamps;
let legacyCamps;
let quadComparison;
let fieldComparison;
if (
  ['--camps', '--compare-quads', '--compare-field-mask'].some((flag) => process.argv.includes(flag))
) {
  const saved = await page.evaluate(() => structuredClone(window.__game.model.state));
  const actors = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.townhall.level = 8;
    const template = m.state.buildings.find((b) => b.kind === 'camp');
    for (const b of m.state.buildings) if (b.kind === 'camp') b.level = 6;
    for (let y = 2; y < 24 && m.countOf('camp') < 4; y++)
      for (let x = 2; x < 24 && m.countOf('camp') < 4; x++)
        if (m.canPlace('camp', x, y))
          m.state.buildings.push({ ...template, id: m.state.nextId++, x, y, level: 6 });
    for (const k of Object.keys(m.state.army)) m.state.army[k] = 0;
    m.state.army.swordsman = m.capacity;
    m.changed();
    scene.sync();
    return scene.ambientUnits.length;
  });
  fullCamps = { actors, ...(await measure()) };
  await page.screenshot({ path: 'output/playtest/full-camps.png' });
  if (process.argv.includes('--compare-quads')) {
    const topology = (strip) =>
      page.evaluate((strip) => {
        const renderer = window.__game.game.renderer;
        const node = renderer.renderNodes.getNode('BatchHandlerQuad');
        const indices = new Uint16Array(node.indexBuffer.dataBuffer);
        for (let i = 0; i < indices.length; i += 6) {
          const v = (i / 6) * 4;
          indices.set(
            strip ? [v, v, v + 1, v + 2, v + 3, v + 3] : [v + 1, v, v + 2, v + 1, v + 2, v + 3],
            i,
          );
        }
        renderer.glWrapper.update(
          { vao: null, bindings: { elementArrayBuffer: node.indexBuffer } },
          true,
        );
        node.indexBuffer.update();
        node.topology = strip ? renderer.gl.TRIANGLE_STRIP : renderer.gl.TRIANGLES;
      }, strip);
    await topology(true);
    try {
      quadComparison = { strip: await measure() };
    } finally {
      await topology(false);
    }
    quadComparison.triangles = await measure();
  }
  if (process.argv.includes('--compare-field-mask')) {
    await page.evaluate(() => {
      const s = window.__game.scene;
      const [stencil, turf, release] = s.ground.list;
      window.__fieldMaskBenchmark = {
        paused: s.paused,
        commands: stencil.list[0].commandBuffer.slice(),
        invert: stencil.stencilInvert,
        releaseInvert: release.stencilInvert,
      };
      s.paused = true;
      // Both alternatives render the same frozen village and the same turf.
      // Only the shape and inversion of the clipping stencil differ.
      window.__fieldMaskBenchmark.apply = (reference) => {
        const outline = stencil.list[0];
        if (reference) {
          const cx = turf.x,
            cy = turf.y,
            hx = turf.width / 2,
            hy = turf.height / 2;
          outline
            .clear()
            .fillStyle(0xffffff)
            .fillPoints(
              [
                { x: cx, y: cy - hy },
                { x: cx + hx, y: cy },
                { x: cx, y: cy + hy },
                { x: cx - hx, y: cy },
              ],
              true,
            );
        } else outline.commandBuffer = window.__fieldMaskBenchmark.commands.slice();
        stencil.stencilInvert = reference;
        release.stencilInvert = reference;
      };
    });
    fieldComparison = [];
    try {
      for (const reference of [true, false, true, false]) {
        await page.evaluate((reference) => window.__fieldMaskBenchmark.apply(reference), reference);
        fieldComparison.push({
          mask: reference ? 'inverted diamond' : 'corner triangles',
          ...(await measure()),
        });
      }
    } finally {
      await page.evaluate(() => {
        const s = window.__game.scene,
          saved = window.__fieldMaskBenchmark;
        const [stencil, , release] = s.ground.list;
        stencil.list[0].commandBuffer = saved.commands;
        stencil.stencilInvert = saved.invert;
        release.stencilInvert = saved.releaseInvert;
        s.paused = saved.paused;
        delete window.__fieldMaskBenchmark;
      });
    }
  }
  if (process.argv.includes('--camps')) {
    const actors = await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.state.army.swordsman = 660;
      model.changed();
      scene.sync();
      return scene.ambientUnits.length;
    });
    legacyCamps = { actors, ...(await measure()) };
    await page.screenshot({ path: 'output/playtest/legacy-camps.png' });
  }
  await page.evaluate((saved) => {
    const { model, scene } = window.__game;
    model.state = saved;
    model.changed();
    scene.sync();
  }, saved);
}
await page.evaluate(() => {
  const m = window.__game.model;
  m.state.settings.sound = false;
  m.startBattle(0);
  for (const k of ['giant', 'wallbreaker', 'swordsman', 'archer', 'wizard', 'balloon', 'goblin']) {
    m.activeTroop = k;
    let i = 0;
    while (m.battle.remaining[k] > 0) {
      m.deploy(4 + (i % 3) * 0.3, 10 + (i % 4) * 0.5);
      i++;
    }
  }
});
const battle = await measure();
const report = {
  environment: `Headless Chromium ${browser.version()} on ${process.platform}, 1440×960, 1× pixel ratio; not a physical mobile benchmark`,
  renderer,
  host: {
    logicalCpus: availableParallelism(),
    loadAverageStart: hostLoadStart,
    loadAverageEnd: loadavg(),
  },
  idle,
  ...(fullCamps ? { fullCamps } : {}),
  ...(legacyCamps ? { legacyCamps } : {}),
  ...(quadComparison ? { quadComparison } : {}),
  ...(fieldComparison ? { fieldComparison } : {}),
  battle,
};
await fs.writeFile('output/playtest/performance.json', JSON.stringify(report, null, 2));
console.log(report);
await browser.close();
