// Touch-play Hero Hall, the builder job shortcut, and the completed hero in Practice.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const townHall = 12;
const label = baselineDist ? 'baseline' : 'patched';
const readiness = process.argv.includes('--readiness');
const screenshots = `output/rea-cloud-playtest/${readiness ? 'hero-readiness' : 'hero-job-navigation'}`;
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
      makeBuilding(1, 'townhall', 34, 31, townHall),
      makeBuilding(2, 'cannon', 25, 20, 1),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 12),
      makeBuilding(6, 'herohall', 34, 39, 6),
      makeBuilding(7, 'darkspellfactory', 30, 36, 7),
    ],
    army: { ...emptyArmy(), giant: 1 },
    spells: emptySpells(),
    gold: 10000000,
    elixir: 10000000,
    troopLevels: { ...Object.fromEntries(Object.keys(emptyArmy()).map((kind) => [kind, 1])), balloon: 8 },
    superBoosts: {},
    heroes: { warden: { level: 5 } },
    heroLineup: ['warden'],
    gems: 1000,
  });
  if (readiness) model.addMagicItem('hero-potion');
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
        const warden = m.heroProgress('warden');
        const { level, upgradeEnd } = warden;
        const hero = battle?.nativeHeroes?.find(h => h.kind === 'warden');
        return {
          level, upgradeEnd,
          lineup: m.heroLineup,
          ready: m.heroSetups().some(hero => hero.kind === 'warden'),
          readyCount: m.heroSetups().length,
          ...(m.boostLeft('heroes') ? { battleLevel: m.battleHeroLevel('warden') } : {}),
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
    if (readiness) {
      await page.evaluate(() => {
        const { scene } = window.qa;
        const camera = scene.cameras.main;
        const point = scene.screenFor(36, 33);
        const canvas = scene.canvasPoint(point.x, point.y);
        const world = camera.getWorldPoint(canvas.x, canvas.y);
        camera.centerOn(world.x, world.y);
      });
      await fieldTap(36, 33);
      await tap('magic-items');
      await tap('item-potion:hero-potion');
      await page.locator('.modal [data-action="close"]').tap();
    }
    await page.locator('.train-add').tap();
    await page.locator('.modern-army-actions [data-action="heroes"]').tap();
    const overview = page.locator('.hero-body > .hero-stats-note').first();
    const warden = page.locator('.hero-section[data-hero="warden"]');
    if (readiness) {
      const buff = await read();
      expect(buff.battleLevel).toBeGreaterThan(6);
      expect(buff.readyCount).toBe(buff.lineup.length);
      await expect(overview).toContainText(baselineDist ? '3 selected' : '3 selected · 3 ready to deploy');
      if (baselineDist) await expect(warden.locator('.hero-battle-level')).toHaveCount(0);
      else await expect(warden.locator('.hero-battle-level')).toHaveText(`Deploys at level ${buff.battleLevel} with Hero Potion`);
      await warden.locator('.hero-overview').scrollIntoViewIfNeeded();
      await shot('ready-before-upgrade');
    }
    await tap('hero-upgrade:warden');
    const pending = await read();
    expect(pending).toMatchObject({ level:5, ready:false });
    expect(pending.upgradeEnd).toBeGreaterThan(Date.now());
    if (readiness) {
      expect(pending.readyCount).toBe(2);
      await expect(overview).toContainText(baselineDist ? '3 selected' : '3 selected · 2 ready to deploy');
      await expect(warden.locator('.hero-battle-level')).toHaveCount(0);
      await warden.locator('.hero-overview').scrollIntoViewIfNeeded();
      await shot('unavailable');
    }
    await page.locator('.modal [data-action="close"]').tap();
    await tap('close-drawer');
    if (readiness) {
      await page.locator('.attack-btn').tap();
      await tap('practice');
      await page.waitForFunction(() => !window.qa.scene.battleArtPending());
      await expect(page.locator('[data-action="hero-select:warden"]')).toHaveCount(0);
      await expect(page.locator('[data-action="troop:giant"]')).toBeEnabled();
      await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
      await shot('scouting-without-warden');
      await tap('home');
    }
    const counter = page.locator('.status-chips [data-action="builders"]');
    await counter.tap();
    const job = page.locator('.builder-option.working').filter({hasText:'Grand Warden'});
    await expect(job).toBeVisible();
    await shot('builder-job');
    await job.tap();
    const finish = page.locator('[data-action="hero-finish:warden"]');
    await expect(finish).toBeVisible();
    if (baselineDist && !readiness) {
      await expect(finish).not.toBeInViewport();
    } else {
      await expect(finish).toBeInViewport({ratio:1});
      await expect(finish).toBeFocused();
      await expect(page.getByText(/Grand Warden upgrade completes in/)).toBeInViewport({ ratio: 1 });
    }
    await shot('job-destination');
    await finish.tap();
    const completed = await read();
    expect(completed).toMatchObject({level:6, upgradeEnd:undefined, ready:true, lineup:pending.lineup});
    await shot('completed');
    if (readiness) {
      await expect(warden.locator('.hero-overview')).toContainText('Level 6');
      if (!baselineDist) {
        await expect(overview).toContainText('3 selected · 3 ready to deploy');
        await expect(warden.locator('.hero-battle-level')).toContainText(`Deploys at level ${completed.battleLevel}`);
      }
      await warden.locator('.hero-overview').scrollIntoViewIfNeeded();
      await shot('ready-after-upgrade');
    }
    await page.reload();
    await ready();
    expect(await read()).toEqual(completed);
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.evaluate(() => { window.qa.scene.paused = true; });
    await tap('hero-select:warden');
    await fieldTap(17.5, 21.5);
    await steps(30);
    const live = await read();
    expect(live.hero.level).toBe(readiness ? completed.battleLevel : 6);
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
    console.log({ label, pending, completed, live, replay: await read() });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
