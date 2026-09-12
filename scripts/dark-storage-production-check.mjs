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
  const { darkLootReplay } = await modules.ssrLoadModule('/tests/fixtures/dark-loot-replay.ts');
  const { makeReplayFile } = await modules.ssrLoadModule('/src/game/replay-file.ts');
  const { GameModel } = await modules.ssrLoadModule('/src/game/model.ts');
  const replay = darkLootReplay(),
    m = new GameModel();
  file = JSON.stringify(makeReplayFile(replay));
  if (!m.openReplay(replay)) throw Error('Invalid storage production replay');
  m.seekReplay(1e6);
  for (let i = 0; i < 1000 && m.replay.seeking; i++) m.step(0.05);
  expected = m.battle.result;
  expect(expected).toMatchObject({ dark: 700, lostLoot: { dark: 550 }, destruction: 100 });
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
      await expect(page.locator('.shop-btn')).toBeVisible();
      await page.locator('#loading').waitFor({ state: 'detached' });
      await page.locator('[data-action="skip-tutorial"]').click();
      expect(await page.evaluate(() => window.__game)).toBeUndefined();
      const before = await page.evaluate(() => JSON.parse(window.render_game_to_text()).resources);
      await page.locator('[data-action="battle-log"]').click();
      await page
        .locator('#import-replay-file')
        .setInputFiles({
          name: 'dark-storage.crown-replay.json',
          mimeType: 'application/json',
          buffer: Buffer.from(file),
        });
      await expect(page.locator('.battle-enemy')).toContainText('Cross and Bows');
      const slider = page.getByRole('slider', { name: 'Replay position' });
      await slider.evaluate((s) => {
        s.value = '10';
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => JSON.parse(window.render_game_to_text()))).battle.time,
        )
        .toBeCloseTo(10, 8);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `output/playtest/dark-storage-production-${name}.png` });
      await slider.focus();
      await slider.press('End');
      await expect(page.locator('.replay-status')).toContainText('Replay complete');
      expect(
        await page.evaluate(() => JSON.parse(window.render_game_to_text()).battle.result),
      ).toEqual(expected);
      const download = page.waitForEvent('download');
      await page.locator('[data-action="replay-export"]').click();
      const exported = `output/playtest/dark-storage-production-${name}.crown-replay.json`;
      await (await download).saveAs(exported);
      const shared = JSON.parse(await fs.readFile(exported, 'utf8'));
      expect(shared.replay.initial.availableLoot.dark).toBe(1250);
      expect(shared.replay.initial.lootRoom.dark).toBe(700);
      await slider.focus();
      await slider.press('Home');
      await expect
        .poll(
          async () =>
            (await page.evaluate(() => JSON.parse(window.render_game_to_text()))).battle.time,
        )
        .toBe(0);
      expect(
        await page.evaluate(
          () => JSON.parse(window.render_game_to_text()).battle.availableLoot.dark,
        ),
      ).toBe(1250);
      await page.locator('[data-action="replay-exit"]').click();
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      let cache = [];
      if (name === 'chromium') {
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller)
            await new Promise((resolve) =>
              navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
            );
        });
        cache = await page.evaluate(() => caches.keys());
        await context.setOffline(true);
      }
      await page.reload();
      await expect(page.locator('.shop-btn')).toBeVisible();
      await page.locator('[data-action="battle-log"]').click();
      await page.locator('#import-replay-file').setInputFiles(exported);
      await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
      await page.getByRole('slider', { name: 'Replay position' }).focus();
      await page.getByRole('slider', { name: 'Replay position' }).press('End');
      await expect(page.locator('.replay-status')).toContainText('Replay complete');
      expect(
        await page.evaluate(() => JSON.parse(window.render_game_to_text()).battle.result),
      ).toEqual(expected);
      expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).resources)).toEqual(
        before,
      );
      expect(errors).toEqual([]);
      report[name] = {
        errors,
        dpr: 2,
        sourceStorageLevel: 13,
        supportedEntityFixture: true,
        result: expected,
        canonicalExport: true,
        rewind: true,
        homeIsolation: true,
        offline: name === 'chromium',
        cache,
      };
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
  await fs.writeFile(
    'output/playtest/dark-storage-production-report.json',
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report, null, 2));
