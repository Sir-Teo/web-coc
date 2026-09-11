import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://localhost:5173');
await page.waitForFunction(() => window.__game?.scene.ready);
async function measure() {
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
if (process.argv.includes('--camps')) {
  const saved = await page.evaluate(() => structuredClone(window.__game.model.state));
  const actors = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.townhall.level = 8;
    const template = m.state.buildings.find((b) => b.kind === 'camp');
    for (const b of m.state.buildings) if (b.kind === 'camp') b.level = 8;
    for (let y = 2; y < 24 && m.countOf('camp') < 4; y++)
      for (let x = 2; x < 24 && m.countOf('camp') < 4; x++)
        if (m.canPlace('camp', x, y))
          m.state.buildings.push({ ...template, id: m.state.nextId++, x, y, level: 8 });
    for (const k of Object.keys(m.state.army)) m.state.army[k] = 0;
    m.state.army.swordsman = m.capacity;
    m.changed();
    scene.sync();
    return scene.ambientUnits.length;
  });
  fullCamps = { actors, ...(await measure()) };
  await page.screenshot({ path: 'output/playtest/full-camps.png' });
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
  environment:
    'Headless Chromium on local macOS, 1440×960, 1× pixel ratio; not a physical mobile benchmark',
  idle,
  ...(fullCamps ? { fullCamps } : {}),
  battle,
};
await fs.writeFile('output/playtest/performance.json', JSON.stringify(report, null, 2));
console.log(report);
await browser.close();
