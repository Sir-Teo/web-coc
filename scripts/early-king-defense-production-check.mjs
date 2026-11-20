// Touch-play the King in Practice on both sides of the Town Hall 7 defense boundary.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const townHall = 6;
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/early-king-defense';
await mkdir(screenshots, { recursive: true });

const modules = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { GameModel, initialSave, makeBuilding } = await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const model = new GameModel(initialSave());
  Object.assign(model.state, {
    tutorial: true,
    obstacles: [],
    nextId: 100,
    buildings: [
      makeBuilding(1, 'townhall', 22, 21, townHall),
      makeBuilding(2, 'herohall', 16, 20, 1),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 12),
      makeBuilding(6, 'builder', 26, 26, 1),
      makeBuilding(7, 'darkspellfactory', 30, 36, 7),
    ],
    army: { ...emptyArmy(), giant: 1 },
    spells: emptySpells(),
    gold: 10000000,
    elixir: 10000000,
    troopLevels: { ...Object.fromEntries(Object.keys(emptyArmy()).map((kind) => [kind, 1])), balloon: 8 },
    superBoosts: {},
    heroLineup: ['king'],
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
      viewport: { width: 390, height: 650 },
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
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = (name) => page.screenshot({ path: `${screenshots}/${label}-th${townHall}-${name}.png`, animations: 'disabled' });
    const fieldTap = async (x, y) => {
      const point = await page.evaluate(({ x, y }) => {
        const { scene } = window.qa;
        const point = scene.screenFor(x, y);
        if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
          throw Error(`Field point is occluded at ${JSON.stringify(point)}`);
        return { x: point.x, y: point.y };
      }, { x, y });
      await page.touchscreen.tap(point.x, point.y);
    };
    const read = () =>
      page.evaluate(() => {
        const { battle, replay } = window.qa.model;
        const { state } = window.qa.model;
        const m = window.qa.model;
        const king = battle?.nativeHeroes?.find(hero => hero.kind === 'king');
        return {
          townHall: m.townhall.level,
          townEnd: m.townhall.upgradeEnd,
          lineup: m.heroLineup,
          king: king && { level: king.level, unitId: king.unitId },
          defenders: battle?.defenders?.filter(d => d.kind === 'hero').map(d => d.hero) ?? [],
        };
      });
    // Match the simulation ticks while issuing every gameplay command via Chromium touch.
    const steps = (count) => page.evaluate((count) => {
      const { model, scene } = window.qa;
      for (let i = 0; i < count; i++) model.step(0.05);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    }, count);
    const ready = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };
    const practice = async (tier, hasDefender) => {
      expect(await read()).toMatchObject({ townHall: tier, lineup: ['king'] });
      await page.locator('.attack-btn').tap();
      await tap('practice');
      await page.waitForFunction(() => !window.qa.scene.battleArtPending());
      await page.evaluate(() => { window.qa.scene.paused = true; });
      const scout = await read();
      expect(scout.defenders).toHaveLength(hasDefender ? 1 : 0);
      await shot(`scout-${tier}`);
      await tap('hero-select:king');
      await fieldTap(12.5, 21.5);
      await steps(30);
      const live = await read();
      expect(live.king?.level).toBe(1);
      expect(live.king.unitId).not.toBeNull();
      await shot(`deployed-${tier}`);
      await tap('surrender');
      await tap('end');
      await expect(page.locator('.result-modal')).toBeVisible();
      await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
      await page.waitForFunction(() => !window.qa.scene.battleArtPending());
      await page.getByRole('button', { name: 'First deployment' }).tap();
      await steps(90);
      expect(await read()).toEqual(live);
      await shot(`replay-${tier}`);
      await tap('replay-exit');
      const close = page.locator('.modal [data-action="close"]');
      if (await close.isVisible()) await close.tap();
      return live;
    };
    await ready();
    const before = await practice(6, !!baselineDist);
    await fieldTap(24, 23);
    const context = page.locator('.building-context');
    await expect(context.locator('h2')).toHaveText('Town Hall');
    await context.locator('[data-action="upgrade:1"]').tap();
    const pending = await read();
    expect(pending.townEnd).toBeGreaterThan(Date.now());
    await shot('town-hall-upgrading');
    await page.goto('about:blank');
    await page.clock.setFixedTime(pending.townEnd + 1);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await ready();
    const after = await practice(7, true);
    expect(errors).toEqual([]);
    console.log({ label, before, after });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise(resolve=>server.httpServer.close(resolve));
}
