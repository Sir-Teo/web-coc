// Touch-play the Town Hall 8 Hero Hall prerequisite and the unlocked Queen in Practice.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const townHall = 8;
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/hero-hall-townhall-gate';
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
        const hero = battle?.nativeHeroes?.find(h => h.kind === 'queen');
        return {
          gold:m.state.gold, townHall:m.townhall.level, townEnd:m.townhall.upgradeEnd,
          hall:m.heroHallLevel, hallEnd:m.heroHall?.upgradeEnd,
          queen:m.heroProgress('queen')?.level, slots:m.heroSlotCount, lineup:m.heroLineup,
          hero: hero && { level: hero.level, unit: hero.unitId },
          replay: replay && { time: replay.time, paused: replay.paused },
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
    await ready();
    const first = await read();
    expect(first).toMatchObject({townHall:8,hall:1,queen:undefined,slots:1});
    await fieldTap(24,23);
    const context = page.locator('.building-context');
    await expect(context.locator('h2')).toHaveText('Town Hall');
    await shot('town-hall-offer');
    await context.locator('[data-action="upgrade:1"]').tap();
    const attempted = await read();
    if (baselineDist) {
      expect(attempted.townEnd).toBeGreaterThan(Date.now());
      expect(attempted.gold).toBeLessThan(first.gold);
      await page.keyboard.press('Escape');
      await fieldTap(18,22);
    } else {
      await expect(context.locator('.upgrade-blocker')).toContainText('Complete Hero Hall level 2');
      expect(attempted.townEnd).toBeUndefined();
      expect(attempted.gold).toBe(first.gold);
      await context.getByRole('button',{name:'Show Hero Hall'}).tap();
    }
    await expect(context.locator('h2')).toHaveText('Hero Hall');
    await context.locator('[data-action="upgrade:2"]').tap();
    const pending = await read();
    expect(pending).toMatchObject({hall:1,queen:undefined,slots:1});
    expect(pending.hallEnd).toBeGreaterThan(Date.now());
    await shot('hall-upgrading');
    await page.goto('about:blank');
    await page.clock.setFixedTime(pending.hallEnd+1);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await ready();
    const completed = await read();
    expect(completed).toMatchObject({hall:2,queen:1,slots:1});
    if (!baselineDist) {
      await fieldTap(24,23);
      await expect(context.locator('.upgrade-blocker')).toHaveCount(0);
      await context.locator('[data-action="upgrade:1"]').tap();
      expect((await read()).townEnd).toBeGreaterThan(Date.now());
      await page.keyboard.press('Escape');
    }
    await page.locator('.train-add').tap();
    await page.locator('.modern-army-actions [data-action="heroes"]').tap();
    await tap('hero-lineup:queen');
    expect((await read()).lineup).toEqual(['queen']);
    await expect(page.locator('[data-hero="queen"]')).toContainText('SLOT 1');
    await page.locator('[data-hero="queen"] h2').evaluate(el => el.scrollIntoView({block:'center'}));
    await shot('queen-ready');
    await page.locator('.modal [data-action="close"]').tap();
    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.evaluate(() => { window.qa.scene.paused = true; });
    await tap('hero-select:queen');
    await fieldTap(12.5,21.5);
    await steps(30);
    const live = await read();
    expect(live.hero?.level).toBe(1);
    expect(live.hero.unit).not.toBeNull();
    await shot('deployed');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.getByRole('button', { name: 'First deployment' }).tap();
    await steps(90);
    expect((await read()).hero).toEqual(live.hero);
    await shot('replay');
    expect(errors).toEqual([]);
    console.log({label,first,attempted,pending,completed,live,replay:await read()});
  } finally {
    await browser.close();
  }
} finally {
  await new Promise(resolve=>server.httpServer.close(resolve));
}
