import { chromium, webkit, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import fs from 'node:fs/promises';

const selectedBrowser = process.env.PRODUCTION_BROWSER;
if (selectedBrowser && !['chromium', 'webkit'].includes(selectedBrowser))
  throw Error(`Unknown PRODUCTION_BROWSER: ${selectedBrowser}`);

await fs.mkdir('output/playtest', { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let fixture, expected;
try {
  const { GameModel } = await modules.ssrLoadModule('/src/game/model.ts');
  const { developedSave } = await modules.ssrLoadModule('/tests/fixtures/developed-village.ts');
  const { freshNativeCampaign } = await modules.ssrLoadModule('/src/game/native-campaign.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const m = new GameModel(developedSave());
  m.state.tutorial = true;
  m.state.settings.sound = false;
  m.state.spells = { lightning: 0, heal: 0, rage: 0 };
  m.state.nativeCampaign = freshNativeCampaign();
  m.state.nativeCampaign.remaining[0] = { gold: 400, elixir: 300, dark: 0 };
  m.state.gold = m.resourceCap('gold');
  m.state.elixir = m.resourceCap('elixir');
  m.startCampaign(0);
  m.activeTroop = 'swordsman';
  if (!m.deploy(32, 26)) throw Error('Fixture deployment failed');
  for (let i = 0; i < 6400; i++) m.step(0.05);
  if (m.battle.finished) throw Error('Campaign ended at a time limit');
  m.finishBattle();
  expected = { loot: m.state.nativeCampaign, result: m.battle.result, trophies: m.state.trophies };
  if (!m.state.raidLog[0].replay || !m.battle.result.lostLoot?.gold)
    throw Error('Missing fixture recording or overflow');
  m.returnHome();
  if (!validateSave(m.state)) throw Error('Invalid campaign production fixture');
  fixture = JSON.stringify(m.state);
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
      expect(await page.evaluate(() => window.__game)).toBeUndefined();
      await page.locator('#import-file').setInputFiles({
        name: 'campaign-village.json',
        mimeType: 'application/json',
        buffer: Buffer.from(fixture),
      });
      await expect(page.locator('#toast')).toContainText('Village restored');
      await page.locator('.attack-btn').click();
      await expect(page.locator('.campaign-loot').first()).toContainText(
        String(expected.loot.remaining[0].gold),
      );
      await expect(page.locator('.campaign-rules')).toContainText('Loot does not replenish');
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await page.locator('[data-action="battle-log"]').click();
      await page.getByRole('button', { name: 'Watch replay', exact: true }).click();
      const slider = page.getByRole('slider', { name: 'Replay position' });
      await slider.focus();
      await slider.press('End');
      await expect(page.locator('.replay-status')).toContainText('Replay complete');
      expect(
        await page.evaluate(() => JSON.parse(window.render_game_to_text()).battle.result),
      ).toEqual(expected.result);
      await expect(page.locator('#battle-timer')).toHaveText('∞');
      const download = page.waitForEvent('download');
      await page.locator('[data-action="replay-export"]').click();
      const downloaded = await download;
      const file = `output/playtest/campaign-production-${name}.crown-replay.json`;
      await downloaded.saveAs(file);
      await page.locator('[data-action="replay-exit"]').click();
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      let offline = false,
        cache = [];
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
        offline = true;
      }
      await page.reload();
      await expect(page.locator('.shop-btn')).toBeVisible();
      await page.locator('.attack-btn').click();
      await expect(page.locator('.campaign-loot').first()).toContainText(
        String(expected.loot.remaining[0].gold),
      );
      await page.locator('[data-action="attack:0"]').click();
      await expect(page.locator('#battle-timer')).toHaveText('∞');
      await expect(page.locator('[data-loot="gold"]')).toHaveText(
        String(expected.loot.remaining[0].gold),
      );
      await expect(page.locator('.loot-capacity-note')).toBeVisible();
      const native = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
      expect(native.battle.catalog).toBe('goblin-v1');
      expect(native.battle.scenery).toHaveLength(14);
      expect(native.buildings.map((b) => [b.npc, b.x, b.y, b.hp])).toEqual([
        ['goblin-townhall', 30, 20, 400],
        ['tutorial-cannon', 23, 24, 250],
      ]);
      await page.screenshot({ path: `output/playtest/campaign-production-${name}.png` });
      await page.locator('[data-action="home"]').click();
      await page.locator('[data-action="battle-log"]').click();
      await page.locator('#import-replay-file').setInputFiles(file);
      await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
      await page.getByRole('slider', { name: 'Replay position' }).focus();
      await page.getByRole('slider', { name: 'Replay position' }).press('End');
      await expect(page.locator('.replay-status')).toContainText('Replay complete');
      expect(
        await page.evaluate(() => JSON.parse(window.render_game_to_text()).battle.result),
      ).toEqual(expected.result);
      expect(errors).toEqual([]);
      report[name] = {
        errors,
        viewport: [390, 844],
        dpr: 2,
        importedSave: true,
        nativeCatalog: native.battle.catalog,
        nativeBuildings: native.buildings.length,
        nativeScenery: native.battle.scenery.length,
        depletedInventoryReload: true,
        longReplaySeconds: 320,
        sharedReplay: true,
        offline,
        cache,
        result: expected.result,
      };
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
  await fs.writeFile(
    'output/playtest/campaign-production-report.json',
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report, null, 2));
