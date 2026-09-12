import { chromium, webkit, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import fs from 'node:fs/promises';

await fs.mkdir('output/playtest', { recursive: true });

// Prepare a validated save through the model, then use only shipping UI controls.
// No running development server or fixed preview port is required.
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let fixture;
try {
  const { GameModel } = await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const m = new GameModel();
  m.state.obstacles = [];
  m.townhall.level = 7;
  m.state.tutorial = true;
  m.state.gold = m.state.elixir = 100000;
  for (const kind of ['herohall', 'darkstorage', 'darkdrill']) {
    let point;
    for (let y = 2; y < 40 && !point; y++)
      for (let x = 2; x < 40 && !point; x++) if (m.canPlace(kind, x, y)) point = { x, y };
    if (!point) throw Error('Cannot place hero fixture building');
    m.beginBuild(kind);
    if (!m.place(point.x, point.y)) throw Error('Cannot build hero fixture');
    m.tick(m.state.buildings.at(-1).upgradeEnd + 1);
  }
  m.state.dark = 10000;
  m.state.gems = 1000;
  m.state.army = emptyArmy();
  m.state.spells = emptySpells();
  m.state.lastTick = Date.now();
  if (!validateSave(m.state)) throw Error('Invalid production hero fixture');
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
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 960 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (r.status() >= 400) errors.push(r.url());
      });
      await page.goto(baseURL);
      await expect(page.locator('.shop-btn')).toBeVisible();
      await page.locator('#import-file').setInputFiles({
        name: 'hero-village.json',
        mimeType: 'application/json',
        buffer: Buffer.from(fixture),
      });
      await expect(page.locator('#toast')).toContainText('Village restored');
      await page.locator('.train-add').click();
      await page.locator('[data-action="heroes"]').click();
      await expect(page.locator('.hero-stat-grid')).toContainText('1,754 → 1,790');
      await expect(page.locator('.hero-upgrade')).toContainText('5,000');
      await expect(page.locator('.hero-upgrade')).toContainText('2h');
      await page.locator('[data-action="hero-upgrade"]').click();
      await expect(page.locator('[data-hero-timer]')).toBeVisible();
      await page.locator('[data-action="hero-finish"]').click();
      await expect(page.locator('.hero-overview')).toContainText('Level 2');
      await expect(page.locator('.hero-equipment')).toContainText('Barbarian Puppet');
      await expect(page.locator('.hero-equipment')).toContainText('Rage Vial');
      await page.screenshot({
        animations: 'disabled',
        path: `output/playtest/production-hero-${name}.png`,
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
        await page.reload();
        await expect(page.locator('.shop-btn')).toBeVisible();
        await page.locator('.train-add').click();
        await page.locator('[data-action="heroes"]').click();
        await expect(page.locator('.hero-overview')).toContainText('Level 2');
      }
      await page.locator('[data-action="practice"]').click();
      await page.getByRole('button', { name: 'Barbarian King, Deploy King', exact: true }).click();
      const sites = [480, 400, 320, 240, 560].flatMap((y) =>
        [720, 560, 880, 400, 1040, 240, 1200].map((x) => [x, y]),
      );
      for (const [x, y] of sites) {
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
      await expect(page.locator('.deploy-label')).toContainText(
        'Tap his card or press H to activate',
      );
      await page.keyboard.press('h');
      await expect(
        page.getByRole('button', { name: 'Barbarian King, Ability used', exact: true }),
      ).toBeDisabled();
      await expect
        .poll(() =>
          page.evaluate(() => JSON.parse(window.render_game_to_text()).battle.hero.summonsSpawned),
        )
        .toBe(8);
      await expect(page.locator('.deploy-label')).toHaveText(
        'Barbarian King · Ability used · Fighting',
      );
      await page.screenshot({
        animations: 'disabled',
        path: `output/playtest/production-hero-battle-${name}.png`,
      });
      await page.locator('[data-action="surrender"]').click();
      await page.locator('[data-action="end"]').click();
      await page.locator('[data-action="home"]').click();
      await page.locator('[data-action="battle-log"]').click();
      await page.getByRole('button', { name: 'Watch replay', exact: true }).click();
      await page.getByRole('slider', { name: 'Replay position' }).press('End');
      await expect(page.locator('.replay-status')).toContainText('Replay complete');
      expect(
        await page.evaluate(
          () => JSON.parse(window.render_game_to_text()).battle.hero.summonsSpawned,
        ),
      ).toBe(8);
      expect(errors).toEqual([]);
      report[name] = {
        density: 2,
        import: true,
        upgrade: true,
        defaultEquipment: true,
        deploy: true,
        ability: true,
        timedSummons: true,
        replay: true,
        offline: name === 'chromium',
        errors,
      };
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    'output/playtest/hero-production-report.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
