import { chromium, webkit, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import fs from 'node:fs/promises';

await fs.mkdir('output/playtest', { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let fixture;
try {
  const { GameModel, makeBuilding } = await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 8),
    makeBuilding(2, 'herohall', 4, 4, 2),
    makeBuilding(3, 'builder', 30, 30),
    makeBuilding(4, 'blacksmith', 8, 4),
  ];
  m.state.king = { level: 20 };
  m.state.nextId = 10;
  m.state.tutorial = true;
  m.state.army = emptyArmy();
  m.state.spells = emptySpells();
  m.state.ores = { shiny: 120, glowy: 0, starry: 4 };
  m.state.gems = 1000;
  m.state.lastTick = Date.now();
  if (!validateSave(m.state)) throw Error('Invalid Blacksmith production fixture');
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
  const baseURL = `http://127.0.0.1:${server.httpServer.address().port}`;
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
        viewport: { width: 1440, height: 960 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (r.status() >= 400) errors.push(r.url());
      });
      await page.goto(baseURL);
      await expect(page.locator('.shop-btn')).toBeVisible();
      expect(await page.evaluate(() => window.__game)).toBeUndefined();
      await page.locator('#import-file').setInputFiles({
        name: 'blacksmith-village.json',
        mimeType: 'application/json',
        buffer: Buffer.from(fixture),
      });
      await expect(page.locator('#toast')).toContainText('Village restored');
      await page.locator('.train-add').click();
      await page.locator('[data-action="heroes"]').click();
      await page.locator('[data-action="equipment-view:puppet"]').click();
      await page.locator('[data-action="equipment-upgrade:puppet,1"]').click();
      await expect(page.locator('.equipment-detail-heading')).toContainText('Level 2');
      await page.locator('[data-action="equipment-upgrade:puppet,2"]').click();
      await expect(page.locator('[data-action="ore-buy"]')).toContainText('340');
      await page.locator('[data-action="ore-buy"]').click();
      await expect(page.locator('.equipment-detail-heading')).toContainText('Level 3');
      expect(
        await page.evaluate(() => JSON.parse(window.render_game_to_text()).resources.gems),
      ).toBe(660);
      await page.locator('.equipment-card[data-action="equipment-view:boots"]').click();
      await page.locator('[data-action="equipment-equip:boots,1"]').click();
      await expect(page.locator('.equipped-label')).toContainText('slot 2');
      await page.locator('.ore-wallet').scrollIntoViewIfNeeded();
      await expect(page.locator('#toast')).not.toHaveClass(/show/);
      await page.screenshot({
        animations: 'disabled',
        path: `output/playtest/production-blacksmith-${name}.png`,
      });
      if (name === 'chromium') {
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller)
            await new Promise((r) =>
              navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
            );
        });
        await context.setOffline(true);
      }
      await page.reload();
      await expect(page.locator('.shop-btn')).toBeVisible();
      await page.locator('.train-add').click();
      await page.locator('[data-action="heroes"]').click();
      await expect(page.locator('.hero-equipment')).toContainText('Earthquake Boots');
      await expect(page.locator('.hero-equipment')).toContainText('LEVEL 3');
      await page.locator('[data-action="practice"]').click();
      await page.getByRole('button', { name: 'Barbarian King, Deploy King', exact: true }).click();
      for (const [x, y] of [480, 400, 320, 240, 560].flatMap((y) =>
        [720, 560, 880, 400, 1040, 240, 1200].map((x) => [x, y]),
      )) {
        if (
          await page.evaluate(
            ([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS',
            [x, y],
          )
        ) {
          await page.mouse.click(x, y);
          await page.waitForTimeout(50);
          if (
            await page.evaluate(
              () => JSON.parse(window.render_game_to_text()).battle.hero.unitId !== null,
            )
          )
            break;
        }
      }
      await expect(
        page.getByRole('button', { name: 'Barbarian King, Activate ability', exact: true }),
      ).toBeEnabled();
      await page.keyboard.press('h');
      await expect
        .poll(() =>
          page.evaluate(() => JSON.parse(window.render_game_to_text()).battle.hero.summonsSpawned),
        )
        .toBe(16);
      const hero = await page.evaluate(() => JSON.parse(window.render_game_to_text()).battle.hero);
      expect(hero.equipment).toEqual({
        levels: { puppet: 3, vial: 1, boots: 1 },
        loadout: ['puppet', 'boots'],
      });
      expect(hero.rageUntil).toBe(hero.abilityAt);
      await page.waitForTimeout(1000);
      await page.locator('[data-action="surrender"]').click();
      await page.locator('[data-action="end"]').click();
      await page.locator('[data-action="home"]').click();
      await page.locator('[data-action="battle-log"]').click();
      await page.getByRole('button', { name: 'Watch replay', exact: true }).click();
      await page.getByRole('slider', { name: 'Replay position' }).press('End');
      await expect(page.locator('.replay-status')).toContainText('Replay complete');
      const replayHero = await page.evaluate(
        () => JSON.parse(window.render_game_to_text()).battle.hero,
      );
      expect(replayHero.equipment).toEqual(hero.equipment);
      expect(replayHero.summonsSpawned).toBe(16);
      expect(
        await page.evaluate(() => JSON.parse(window.render_game_to_text()).resources.gems),
      ).toBe(660);
      expect(errors).toEqual([]);
      report[name] = {
        density: 2,
        import: true,
        oreUpgrade: true,
        gemUpgrade: true,
        savedLoadout: true,
        timedSummons: 16,
        replay: true,
        offline: name === 'chromium',
        errors,
      };
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    'output/playtest/blacksmith-production-report.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
