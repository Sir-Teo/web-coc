import { chromium, webkit, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import fs from 'node:fs/promises';

await fs.mkdir('output/playtest', { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let file, expected;
try {
  const { GameModel, makeNpcBuilding } = await modules.ssrLoadModule('/src/game/model.ts');
  const { makeReplayFile } = await modules.ssrLoadModule('/src/game/replay-file.ts');
  const m = new GameModel();
  m.startBattle(0);
  m.deploy(1, 1);
  m.finishBattle();
  const replay = structuredClone(m.state.raidLog[0].replay);
  // A purpose-built NPC combat fixture. This does not assert a playable native campaign.
  replay.initial.buildings = [
    makeNpcBuilding(1000, 'goblin-townhall', 15, 15, 11),
    makeNpcBuilding(1001, 'goblin-hut', 20, 15),
    makeNpcBuilding(1002, 'tutorial-cannon', 10, 10),
  ];
  replay.steps = Array(1000).fill(0.05);
  replay.actions = [
    { step: 0, type: 'troop', kind: 'swordsman', x: 7, y: 11.5 },
    { step: 1000, type: 'end' },
  ];
  file = JSON.stringify(makeReplayFile(replay));
  const viewer = new GameModel();
  if (!viewer.openReplay(replay)) throw Error('Invalid NPC replay fixture');
  viewer.seekReplay(1e6);
  for (let i = 0; i < 1000 && viewer.replay.seeking; i++) viewer.step(0.05);
  if (!viewer.replay.complete) throw Error('Fixture seek did not finish');
  expected = structuredClone(viewer.battle.result);
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
    const browser = await engine.launch({
      headless: true,
      ...(name === 'chromium' && process.platform === 'darwin'
        ? { args: ['--use-angle=metal'] }
        : {}),
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (r.status() >= 400) errors.push(r.url());
      });
      await page.goto(url);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.locator('#loading').waitFor({ state: 'detached' });
      expect(await page.evaluate(() => window.__game)).toBeUndefined();
      await page.locator('[data-action="battle-log"]').click();
      await page.locator('#import-replay-file').setInputFiles({
        name: 'goblin-fixture.crown-replay.json',
        mimeType: 'application/json',
        buffer: Buffer.from(file),
      });
      await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
      await page.getByRole('slider', { name: 'Replay position' }).focus();
      await page.getByRole('slider', { name: 'Replay position' }).press('End');
      await expect(page.locator('.replay-status')).toContainText('Replay complete');
      expect(
        await page.evaluate(() => JSON.parse(window.render_game_to_text()).battle.result),
      ).toEqual(expected);
      const download = page.waitForEvent('download');
      await page.locator('[data-action="replay-export"]').click();
      const path = `output/playtest/goblin-production-${name}.crown-replay.json`;
      await (await download).saveAs(path);
      const exported = JSON.parse(await fs.readFile(path, 'utf8'));
      expect(exported.replay.initial.buildings.map((b) => b.npc)).toEqual([
        'goblin-townhall',
        'goblin-hut',
        'tutorial-cannon',
      ]);
      expect(exported.replay.initial.buildings[0]).toMatchObject({
        npc: 'goblin-townhall',
        level: 11,
        hp: 6800,
        maxHp: 6800,
      });
      await page.screenshot({
        animations: 'disabled',
        path: `output/playtest/goblin-production-${name}.png`,
      });
      let offline = false;
      if (name === 'chromium') {
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller)
            await new Promise((resolve) =>
              navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
            );
        });
        await context.setOffline(true);
        offline = true;
        await page.reload();
        await expect(page.locator('.shop-btn')).toBeVisible();
        const images = await page.evaluate(async () =>
          Promise.all(
            ['goblin_townhall_lvl1', 'goblin_hut_lvl1'].map(async (name) => {
              const im = new Image();
              im.src = `/assets/buildings/goblin-native/${name}.png`;
              await im.decode();
              return [im.naturalWidth, im.naturalHeight];
            }),
          ),
        );
        expect(images).toEqual([
          [400, 360],
          [280, 260],
        ]);
        await page.locator('[data-action="battle-log"]').click();
        await page.locator('#import-replay-file').setInputFiles(path);
        await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
      }
      expect(errors).toEqual([]);
      report[name] = {
        errors,
        dpr: 2,
        viewport: [390, 844],
        npcExport: true,
        townHallLevel: exported.replay.initial.buildings[0].level,
        seekResult: expected,
        offline,
      };
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    'output/playtest/goblin-production-report.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
