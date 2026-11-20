// Touch-play Angry with a Barbarian and an immune Giant in the same cast.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const townHall = 15;
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/angry-eligibility';
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
      makeBuilding(2, 'cannon', 27, 24, 1),
      makeBuilding(8, 'goldmine', 20, 20, 8),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 12),
      makeBuilding(6, 'herohall', 34, 39, 8),
      makeBuilding(7, 'darkspellfactory', 30, 36, 8),
    ],
    army: { ...emptyArmy(), giant: 1, swordsman: 1 },
    spells: { ...emptySpells(), angry: 1 },
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
        const unit = kind => {
          const u = battle?.units.find(unit => unit.kind === kind);
          return u && { id: u.id, x: u.x, y: u.y, target: u.target, angryUntil: u.native?.angryUntil };
        };
        return {
          at: battle?.elapsed,
          casts: battle?.nativeSpells,
          barbarian: unit('swordsman'),
          giant: unit('giant'),
          remaining: battle?.spells.angry,
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
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.evaluate(() => { window.qa.scene.paused = true; });
    for (const kind of ['swordsman', 'giant']) {
      await tap('troop:'+kind);
      await fieldTap(17.5, 21.5);
    }
    await steps(8);
    const before = await read();
    expect(before.barbarian.target).toBe(8);
    expect(before.giant.target).toBe(2);
    await shot('approach');
    await tap('spell:angry');
    await fieldTap(17.5, 21.5);
    await steps(38);
    const live = await read();
    expect(live.remaining).toBe(0);
    expect(live.barbarian.angryUntil).toBeGreaterThan(live.at);
    expect(live.barbarian.target).toBe(2);
    expect(live.giant.target).toBe(before.giant.target);
    if (baselineDist) expect(live.giant.angryUntil).toBeGreaterThan(live.at);
    else expect(live.giant.angryUntil).toBeUndefined();
    await shot('cast');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await tap('replay-jump:-10');
    await steps(3);
    expect((await read()).barbarian?.angryUntil).toBeUndefined();
    await tap('replay-jump:10');
    await steps(90);
    const replay = await read();
    expect(replay.barbarian).toEqual(live.barbarian);
    expect(replay.giant).toEqual(live.giant);
    await shot('replay');
    expect(errors).toEqual([]);
    console.log({ label, before, live, replay });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise(resolve=>server.httpServer.close(resolve));
}
