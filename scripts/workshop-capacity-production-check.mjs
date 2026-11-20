// Touch-play Workshop reserve capacity before and after a completed upgrade.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const townHall = 12;
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/workshop-capacity';
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
      makeBuilding(2, 'workshop', 25, 20, 1),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 12),
      makeBuilding(6, 'herohall', 34, 39, 8),
      makeBuilding(7, 'darkspellfactory', 30, 36, 7),
    ],
    army: { ...emptyArmy(), giant: 1 },
    spells: emptySpells(),
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
        const unit = battle?.units.find((u) => u.kind === 'wallwrecker');
        const workshop = state.buildings.find((b) => b.kind === 'workshop');
        return {
          workshop: workshop.level,
          deadline: workshop.upgradeEnd,
          wrecker: state.army.wallwrecker,
          blimp: state.army.battleblimp,
          unit: unit && { id: unit.id, hp: unit.maxHp },
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
    const openArmy = async name => {
      await page.locator('.train-add').tap();
      await page.locator('#army-search').fill(name);
    };
    const trainWrecker = page.locator('[data-action="train:wallwrecker"]');
    await ready();
    await openArmy('Wall Wrecker');
    await trainWrecker.tap();
    if (baselineDist) {
      await expect(trainWrecker).toBeEnabled();
      await trainWrecker.tap();
      expect((await read()).wrecker).toBe(2);
      await shot('level-one-overfilled');
      await tap('remove-troop:wallwrecker');
    } else {
      await expect(trainWrecker).toBeDisabled();
      await expect(trainWrecker).toHaveText('Reserve full');
      expect((await read()).wrecker).toBe(1);
      await shot('level-one-full');
    }
    await tap('close-drawer');
    await fieldTap(27, 22);
    await expect(page.locator('[data-action="upgrade:2"]')).toBeVisible();
    await tap('upgrade:2');
    const pending = await read();
    expect(pending.workshop).toBe(1);
    expect(pending.deadline).toBeGreaterThan(Date.now());
    await fieldTap(12, 10);
    await openArmy('Wall Wrecker');
    if (!baselineDist) await expect(trainWrecker).toBeDisabled();

    await page.goto('about:blank');
    await page.clock.setFixedTime(pending.deadline + 1);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await ready();
    expect(await read()).toMatchObject({ workshop: 2, wrecker: 1, deadline: undefined });
    await openArmy('Battle Blimp');
    await tap('train:battleblimp');
    expect((await read()).blimp).toBe(1);
    if (!baselineDist) await expect(page.locator('[data-action="train:battleblimp"]')).toBeDisabled();
    await shot('level-two-reserve');
    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.evaluate(() => { window.qa.scene.paused = true; });
    await tap('troop:wallwrecker');
    await fieldTap(17.5, 21.5);
    await steps(30);
    const live = await read();
    expect(live.unit).toBeDefined();
    await expect(page.locator('[data-action="troop:battleblimp"]')).toBeDisabled();
    await shot('deployed');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.getByRole('button', { name: 'First deployment' }).tap();
    await steps(90);
    expect((await read()).unit).toEqual(live.unit);
    await shot('replay');
    expect(errors).toEqual([]);
    console.log({ label, pending, live, replay: await read() });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
