import { chromium, webkit, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import fs from 'node:fs/promises';

// The shipping build boots without the late Goblin Map chunk or art, then fetches both for the
// first late replay and plays it to the recorded result.
const selectedBrowser = process.env.PRODUCTION_BROWSER;
if (selectedBrowser && !['chromium', 'webkit'].includes(selectedBrowser))
  throw Error(`Unknown PRODUCTION_BROWSER: ${selectedBrowser}`);
const LATE =
  /\/assets\/(late-campaign-scene-[^/]+\.js|characters-native\/|buildings\/(eagle-artillery|scattershot|monolith|spell-tower|tornado-trap|freeze-trap|late-goblin|builder-hut)-native\/)/;

await fs.mkdir('output/playtest', { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
let file, expected;
try {
  const { lateBattle, lateReplay, lateSetup, deploySpots } = await modules.ssrLoadModule(
    '/tests/fixtures/late-defense-battle.ts',
  );
  const { GameModel } = await modules.ssrLoadModule('/src/game/model.ts');
  const { makeReplayFile } = await modules.ssrLoadModule('/src/game/replay-file.ts');
  // Bowling Alley (63): its Eagle Artillery wakes once 200 housing is on the field.
  const setup = lateSetup(63, { giant: 20, archer: 100 });
  const spots = deploySpots(lateBattle(setup), 24, 46, 60);
  const deployments = [
    ...Array.from({ length: 20 }, (_, i) => ({ step: 0, kind: 'giant', ...spots[i % 20] })),
    ...Array.from({ length: 100 }, (_, i) => ({ step: 20, kind: 'archer', ...spots[i % 60] })),
  ].map(({ step, kind, x, y }) => ({ step, kind, x, y }));
  const data = lateReplay(setup, deployments, 900);
  const viewer = new GameModel();
  if (!viewer.openReplay(data)) throw Error('Invalid late campaign replay fixture');
  viewer.seekReplay(1e6);
  for (let i = 0; i < 2000 && viewer.replay.seeking; i++) viewer.step(0.05);
  if (!viewer.replay.complete) throw Error('Late campaign fixture seek did not finish');
  if (!viewer.battle.late?.eagleArtillery) throw Error('Fixture did not reach the Eagle Artillery');
  expected = structuredClone(viewer.battle.result);
  file = JSON.stringify(makeReplayFile(data));
} finally {
  await modules.close();
}

const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
  logLevel: 'warn',
});
const report = {};
try {
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const [name, engine] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    if (selectedBrowser && selectedBrowser !== name) continue;
    const browser = await engine.launch({
      headless: true,
      ...(name === 'chromium' && process.platform === 'darwin'
        ? { args: ['--use-angle=metal'] }
        : {}),
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
      });
      const page = await context.newPage(),
        errors = [],
        late = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (r.status() >= 400) errors.push(r.url());
        if (LATE.test(new URL(r.url()).pathname)) late.push(new URL(r.url()).pathname);
      });
      await page.goto(url);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.locator('#loading').waitFor({ state: 'detached' });
      expect(await page.evaluate(() => window.__game)).toBeUndefined();
      expect(late).toEqual([]);
      const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
      await page.locator('[data-action="battle-log"]').click();
      await page.locator('#import-replay-file').setInputFiles({
        name: 'bowling-alley.crown-replay.json',
        mimeType: 'application/json',
        buffer: Buffer.from(file),
      });
      await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
      await expect
        .poll(() => late.some((path) => path.includes('late-campaign-scene-')))
        .toBe(true);
      await expect
        .poll(() => late.some((path) => path.includes('eagle-artillery-native')))
        .toBe(true);
      expect((await read()).buildings.some((b) => b.type === 'eagleartillery')).toBe(true);
      await page.getByRole('slider', { name: 'Replay position' }).press('End');
      await expect(page.locator('.replay-status')).toContainText('Replay complete', {
        timeout: 60_000,
      });
      expect((await read()).battle.result).toEqual(expected);
      await page.screenshot({ path: `output/playtest/late-campaign-production-${name}.png` });
      expect(errors).toEqual([]);
      report[name] = { lateRequests: late.length, result: expected };
      await context.close();
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
await fs.writeFile(
  'output/playtest/late-campaign-production-report.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
