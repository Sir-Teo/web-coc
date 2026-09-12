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
  const { GameModel, makeBuilding } = await modules.ssrLoadModule('/src/game/model.ts');
  const { makeReplayFile } = await modules.ssrLoadModule('/src/game/replay-file.ts');
  const { emptyArmy } = await modules.ssrLoadModule('/src/game/army.ts');
  const m = new GameModel();
  // Supported-entity fixture; the home shop still caps Tesla at level 6.
  m.state.obstacles = [];
  m.state.buildings = [makeBuilding(1, 'townhall', 20, 20, 8), makeBuilding(3, 'tesla', 6, 10, 17)];
  m.state.nextId = 4;
  m.state.army = { ...emptyArmy(), dragon: 3 };
  m.startBattle(0, true);
  m.activeTroop = 'dragon';
  if (!m.deploy(1, 11)) throw Error('Native Tesla fixture deployment failed');
  for (let i = 0; i < 100; i++) m.step(0.05);
  m.finishBattle();
  if (m.battle.revealedTeslas?.[3] !== 0.05) throw Error('Native Tesla fixture did not reveal');
  expected = structuredClone(m.battle.result);
  file = JSON.stringify(makeReplayFile(m.state.raidLog[0].replay));
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
      const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const seek = async (time) => {
        if (!(await read()).replay.paused)
          await page.locator('[data-action="replay-pause"]').click();
        const slider = page.getByRole('slider', { name: 'Replay position' });
        await expect(slider).toBeEnabled();
        // Resolve the current form and dispatch in one browser turn: HUD renders
        // can replace a previously resolved range node between driver calls.
        await page.evaluate((value) => {
          const el = document.querySelector('#replay-progress');
          if (!el || el.disabled) throw Error('Replay range is unavailable');
          el.value = String(value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, time);
        await expect.poll(async () => (await read()).replay.seeking).toBe(false);
        await expect.poll(async () => (await read()).replay.time).toBeCloseTo(time, 6);
        return read();
      };
      const open = async (input) => {
        await page.locator('[data-action="battle-log"]').click();
        await page.locator('#import-replay-file').setInputFiles(input);
        await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
      };
      await open({
        name: 'tesla-fixture.crown-replay.json',
        mimeType: 'application/json',
        buffer: Buffer.from(file),
      });
      const hidden = await seek(0);
      expect(hidden.buildings.some((b) => b.type === 'tesla')).toBe(false);
      const raised = await seek(0.85);
      expect(raised.buildings.find((b) => b.type === 'tesla')).toMatchObject({
        id: 3,
        level: 17,
        hp: 1750,
      });
      await page.screenshot({
        path: `output/playtest/tesla-production-${name}.png`,
        animations: 'disabled',
      });
      await page.getByRole('slider', { name: 'Replay position' }).press('End');
      await expect(page.locator('.replay-status')).toContainText('Replay complete');
      expect((await read()).battle.result).toEqual(expected);
      const download = page.waitForEvent('download');
      await page.locator('[data-action="replay-export"]').click();
      const path = `output/playtest/tesla-production-${name}.crown-replay.json`;
      await (await download).saveAs(path);
      const exported = JSON.parse(await fs.readFile(path, 'utf8'));
      expect(exported.replay.initial.buildings.find((b) => b.kind === 'tesla')).toMatchObject({
        level: 17,
        hp: 1750,
        maxHp: 1750,
      });
      const back = await seek(0);
      expect(back.buildings).toEqual(hidden.buildings);
      expect((await seek(0.85)).buildings).toEqual(raised.buildings);
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
        await page.reload();
        await expect(page.locator('.shop-btn')).toBeVisible();
        const images = await page.evaluate(async () =>
          Promise.all(
            Array.from({ length: 17 }, async (_, i) => {
              const im = new Image();
              im.src = `/assets/buildings/tesla-native/preview-${i + 1}.png`;
              await im.decode();
              return [im.naturalWidth, im.naturalHeight];
            }),
          ),
        );
        expect(images).toEqual(Array.from({ length: 17 }, () => [320, 380]));
        await open(path);
        expect((await seek(0)).buildings.some((b) => b.type === 'tesla')).toBe(false);
        expect((await seek(0.85)).buildings).toEqual(raised.buildings);
        await page.getByRole('slider', { name: 'Replay position' }).press('End');
        await expect(page.locator('.replay-status')).toContainText('Replay complete');
        expect((await read()).battle.result).toEqual(expected);
        offline = true;
      }
      expect(errors).toEqual([]);
      report[name] = {
        errors,
        dpr: 2,
        viewport: [390, 844],
        level: 17,
        hp: 1750,
        portableReplay: true,
        concealmentAndRewind: true,
        seekResult: expected,
        offline,
      };
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    'output/playtest/tesla-production-report.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
