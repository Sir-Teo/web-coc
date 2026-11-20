// Touch-play Poison research and verify the upgraded cast in Practice and replay.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const townHall = 8;
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/poison-research-preview';
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
      makeBuilding(2, 'laboratory', 25, 20, 6),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 12),
      makeBuilding(6, 'herohall', 34, 39, 8),
      makeBuilding(7, 'darkspellfactory', 30, 36, 1),
    ],
    army: { ...emptyArmy(), giant: 1 },
    spells: { ...emptySpells(), poison: 1 },
    dark: 5000,
    gold: 10000000,
    elixir: 10000000,
    troopLevels: { ...Object.fromEntries(Object.keys(emptyArmy()).map((kind) => [kind, 1])), balloon: 8 },
    superBoosts: {},
    heroLineup: [],
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
        return {
          dark: state.dark,
          research: state.research,
          level: m.spellLevel('poison'),
          battleLevel: battle?.spellLevels?.poison,
          remaining: battle?.spells.poison,
          castLevel: battle?.nativeSpells?.find(cast => cast.name === 'Poison')?.level,
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
    await page.locator('.train-add').tap();
    await tap('research');
    const stats = page.locator('[data-research-kind="poison"] .research-stats');
    const research = page.locator('[data-action="research-start:poison"]');
    if (baselineDist) {
      await expect(stats).toContainText('Damage');
      await expect(stats).not.toContainText('115 DPS');
    } else {
      await expect(stats).toContainText('Up to 90 DPS · 26% slower');
      await expect(stats).toContainText('Up to 115 DPS · 30% slower');
      expect(await stats.evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(await stats.evaluate(el => el.clientWidth));
    }
    await research.scrollIntoViewIfNeeded();
    await shot('research-offer');
    await expect(research).toContainText('5,000');
    await research.tap();
    const pending = await read();
    expect(pending).toMatchObject({ dark: 0, level: 1, research: { kind: 'poison' } });
    await page.goto('about:blank');
    await page.clock.setFixedTime(pending.research.end + 1);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await ready();
    expect(await read()).toMatchObject({ dark: 0, level: 2, research: undefined });
    await page.locator('.train-add').tap();
    await page.locator('#army-search').fill('Poison');
    const tile = page.locator('.army-tile').filter({ has: page.locator('[data-action="spell-info:poison"]') });
    await expect(tile).toContainText('115 DPS');
    await tile.scrollIntoViewIfNeeded();
    await shot('army');
    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.evaluate(() => { window.qa.scene.paused = true; });
    await tap('spell:poison');
    await fieldTap(17.5, 21.5);
    await steps(30);
    const live = await read();
    expect(live).toMatchObject({ battleLevel: 2, remaining: 0, castLevel: 2 });
    await shot('cast');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await tap('replay-jump:10');
    await steps(90);
    expect(await read()).toMatchObject({ battleLevel: 2, remaining: 0, castLevel: 2 });
    await shot('replay');
    expect(errors).toEqual([]);
    console.log({ label, pending, live, replay: await read() });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
