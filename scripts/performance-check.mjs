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
  battle,
};
await fs.writeFile('output/playtest/performance.json', JSON.stringify(report, null, 2));
console.log(report);
await browser.close();
