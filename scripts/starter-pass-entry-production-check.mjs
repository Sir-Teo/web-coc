// Check touch entry into the Starter Pass and return to the village.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const townHall = 2;
const landscape = process.argv.includes('--landscape');
const viewport = landscape ? { width: 650, height: 390 } : { width: 390, height: 650 };
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/starter-pass-entry';
await mkdir(screenshots, { recursive: true });

const modules = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { GameModel, initialSave, makeBuilding } =
    await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const model = new GameModel(initialSave());
  Object.assign(model.state, {
    tutorial: true,
    starter: { counts: { TH2_Battle_LootGold: 4000, TH2_Destroy_HomeBuildings: 50 }, claimed: [] },
    obstacles: [],
    nextId: 100,
    buildings: [
      makeBuilding(1, 'townhall', 22, 21, townHall),
      makeBuilding(2, 'goldstorage', 16, 20),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'elixirstorage', 12, 14),
      makeBuilding(6, 'builder', 26, 31, 1),
    ],
    army: emptyArmy(),
    spells: emptySpells(),
    gold: 3000,
    elixir: 1000,
    superBoosts: {},
    heroLineup: [],
    gems: 1000,
  });
  model.state.settings.sound = false;
  model.state.settings.music = false;
  model.state.settings.manualHeroAbilities = true;
  expect(validateSave(model.state)).toBe(true);
  save = JSON.stringify(model.state);
} finally {
  await modules.close();
}

const server = await preview({
  ...(baselineDist ? { build: { outDir: baselineDist } } : {}),
  preview: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
try {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
  try {
    const page = await browser.newPage({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    await page.clock.setFixedTime(Date.now());
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((fixture) => {
      if (location.protocol === 'http:' && !localStorage.getItem('crown-clan-save-v1'))
        localStorage.setItem('crown-clan-save-v1', fixture);
    }, save);
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await page.waitForFunction(() => window.qa?.scene.ready);
    const shot = (name) =>
      page.screenshot({
        path: `${screenshots}/${label}-${viewport.width}-${name}.png`,
        animations: 'disabled',
      });

    const ready = () => expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await ready();
    await page.waitForFunction(() => window.qa?.scene.ready);
    const awards = page.locator('.left-tools [data-action="achievements"]');
    const awardsBody = page.locator('.modal-body').filter({ has: page.locator('.starter-card') });
    const starter = page.locator('.starter-card [data-action="starter"]');
    const panel = page.locator('.starter-body');
    const close = page.getByRole('button', { name: 'Close dialog' });
    const tier = panel.locator('[data-tier="0"]');
    const cdp = await page.context().newCDPSession(page);
    const swipeAwards = async () => {
      const box = await awardsBody.boundingBox();
      const x = Math.round(box.x + box.width * 0.5);
      const y = Math.round(box.y + box.height * 0.8);
      const distance = Math.round(box.height * 0.6);
      const send = (type, yy) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: yy === undefined ? [] : [{ x, y: yy }],
        });
      await send('touchStart', y);
      for (let i = 1; i <= 8; i++) await send('touchMove', y - Math.round((distance * i) / 8));
      await send('touchEnd');
    };
    for (const scrolled of [false, true]) {
      await awards.tap();
      expect(await awardsBody.evaluate((el) => el.scrollTop)).toBe(0);
      if (scrolled) {
        await swipeAwards();
        await expect.poll(() => awardsBody.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      }
      await starter.tap();
      const offset = await panel.evaluate((el) => el.scrollTop);
      if (baselineDist && !scrolled) expect(offset).toBeGreaterThan(0);
      if (!baselineDist) {
        expect(offset).toBe(0);
        await expect(panel.locator('.starter-summary')).toBeInViewport();
        await expect(tier).toBeInViewport();
      }
      await expect(close).toBeFocused();
      await shot(scrolled ? 'scrolled-entry' : 'normal-entry');
      await close.tap();
      await expect(panel).toHaveCount(0);
      await expect(awards).toBeFocused();
      console.log(JSON.stringify({ label, viewport, scrolled, offset }));
    }
    const balance = () => page.evaluate(() => window.qa.model.state.elixir);
    const before = await balance();
    await awards.tap();
    await starter.tap();
    await tier.getByRole('button', { name: 'Claim' }).tap();
    await expect(tier).toContainText('Claimed');
    expect(await balance()).toBe(before + 2000);
    await page.reload();
    await ready();
    await awards.tap();
    await starter.tap();
    await expect(tier).toContainText('Claimed');
    await expect(tier.getByRole('button', { name: 'Claim' })).toHaveCount(0);
    expect(await balance()).toBe(before + 2000);
    await shot('claimed-after-reload');
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
