// Touch-play a spell-housing refusal, completed upgrade, preset replacement and replay.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const townHall = 12;
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/preset-capacity';
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
    obstacles: [],
    nextId: 100,
    buildings: [
      makeBuilding(1, 'townhall', 34, 31, townHall),
      makeBuilding(2, 'spellfactory', 25, 20, 1),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 12),
    ],
    army: { ...emptyArmy(), giant: 1 },
    spells: { ...emptySpells(), lightning: 1 },
    armyPresets: [
      {
        name: 'Balloon and Lightning',
        army: { ...emptyArmy(), balloon: 1 },
        spells: {
          ...emptySpells(),
          lightning: 3,
        },
      },
      null,
      null,
    ],
    gold: 10000000,
    elixir: 10000000,
    troopLevels: {
      ...Object.fromEntries(Object.keys(emptyArmy()).map((kind) => [kind, 1])),
      balloon: 8,
    },
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
    const shot = (name) =>
      page.screenshot({
        path: `${screenshots}/${label}-th${townHall}-${name}.png`,
        animations: 'disabled',
      });
    const fieldTap = async (x, y) => {
      const point = await page.evaluate(
        ({ x, y }) => {
          const { scene } = window.qa;
          const point = scene.screenFor(x, y);
          if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
            throw Error(`Field point is occluded at ${JSON.stringify(point)}`);
          return { x: point.x, y: point.y };
        },
        { x, y },
      );
      await page.touchscreen.tap(point.x, point.y);
    };
    const url = page.url();
    const ready = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };
    const openPresets = async () => {
      await page.locator('.train-add').tap();
      await tap('army-presets');
    };
    const close = () => page.locator('.modal [data-action="close"]').tap();
    const read = () =>
      page.evaluate(() => {
        const { model } = window.qa;
        const { battle, state } = model;
        const factory = state.buildings.find(({ kind }) => kind === 'spellfactory');
        const balloon = battle?.units.find(({ kind }) => kind === 'balloon');
        return {
          factory: factory.level,
          deadline: factory.upgradeEnd,
          army: state.army,
          spells: state.spells,
          preset: state.armyPresets[0],
          remainingLightning: battle?.spells.lightning,
          balloon: balloon && { id: balloon.id, level: balloon.level },
          actions: state.raidLog?.[0]?.replay?.actions,
        };
      });
    const card = page.locator('.preset-card').filter({ has: page.locator('#preset-name-0') });
    const load = card.locator('[data-action="preset-load:0"]');
    const refusal = async () => {
      await expect(load).toBeDisabled();
      await expect(card.locator('.preset-empty')).toContainText(
        baselineDist
          ? 'This army needs more troop or spell housing.'
          : 'Spells need 3 spaces, but your factories hold 2.',
      );
    };

    await ready();
    const original = await read();
    await openPresets();
    await refusal();
    await load.tap({ force: true });
    expect(await read()).toEqual(original);
    await shot('refused');
    await close();
    await tap('close-drawer');
    await fieldTap(27, 22);
    await tap('upgrade:2');
    const pending = await read();
    expect(pending).toMatchObject({ factory: 1, army: original.army, spells: original.spells });
    expect(pending.deadline).toBeGreaterThan(Date.now());
    await page.reload();
    await ready();
    await openPresets();
    await refusal();
    expect(await read()).toEqual(pending);

    await page.goto('about:blank');
    await page.clock.setFixedTime(pending.deadline + 1);
    await page.goto(url);
    await ready();
    await openPresets();
    await expect(load).toBeEnabled();
    expect(await read()).toMatchObject({
      factory: 2,
      army: original.army,
      spells: original.spells,
    });
    await load.tap();
    expect(await read()).toMatchObject({
      army: original.preset.army,
      spells: original.preset.spells,
      preset: original.preset,
    });
    await shot('loaded');
    await page.reload();
    await ready();
    expect(await read()).toMatchObject({
      army: original.preset.army,
      spells: original.preset.spells,
    });
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await page.evaluate(() => {
      window.qa.scene.paused = true;
    });
    await tap('troop:balloon');
    await fieldTap(17.5, 21.5);
    await tap('spell:lightning');
    await fieldTap(19.5, 23.5);
    const step = (ticks) =>
      page.evaluate((ticks) => {
        const { model, scene } = window.qa;
        for (let i = 0; i < ticks; i++) model.step(0.05);
        scene.sync();
        scene.drawOverlay(0);
      }, ticks);
    await step(25);
    const live = await read();
    expect(live.balloon).toBeDefined();
    expect(live.remainingLightning).toBe(2);
    await shot('deployed');
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await page.evaluate(() => {
      const { model, scene } = window.qa;
      model.seekReplay(model.replay.duration);
      while (model.replay.seeking) model.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
    });
    const playback = await read();
    expect(playback.balloon).toEqual(live.balloon);
    expect(playback.remainingLightning).toBe(2);
    expect(playback.army).toEqual(original.preset.army);
    expect(playback.spells).toEqual(original.preset.spells);
    await shot('replay');
    expect(errors).toEqual([]);
    console.log({
      label,
      factoryBefore: pending.factory,
      factoryAfter: playback.factory,
      balloon: playback.balloon,
      remainingLightning: playback.remainingLightning,
    });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
