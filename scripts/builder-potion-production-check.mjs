// Compare Builder Potion job countdowns before and after a reload.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const townHall = 3;
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/builder-potion';
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
      makeBuilding(1, 'townhall', 22, 21, townHall),
      makeBuilding(2, 'goldmine', 16, 20),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'goldmine', 12, 14),
      makeBuilding(6, 'builder', 26, 31, 1),
    ],
    army: { ...emptyArmy(), archer: 30 },
    spells: emptySpells(),
    gold: 10000000,
    elixir: 10000000,
    troopLevels: {
      ...Object.fromEntries(Object.keys(emptyArmy()).map((kind) => [kind, 1])),
      balloon: 8,
    },
    superBoosts: {},
    heroLineup: [],
    gems: 1000,
  });
  model.addMagicItem('builder-potion');
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

    const ready = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };

    const read = () =>
      page.evaluate(() => {
        const { model } = window.qa;
        const mine = model.state.buildings.find((b) => b.id === 2);
        return {
          level: mine.level,
          end: mine.upgradeEnd,
          clock: model.clock,
          elixir: model.state.elixir,
          potions: model.magicItemCount('builder-potion'),
          boost: model.state.boosts?.builders,
        };
      });
    await ready();
    await fieldTap(24, 23);
    await tap('magic-items');
    await tap('item-potion:builder-potion');
    await expect(page.locator('[data-item="builder-potion"]')).toContainText('left');
    await shot('potion');
    await tap('close');
    await fieldTap(17.5, 21.5);
    const before = await read();
    await tap('upgrade:2');
    const booked = await read();
    expect(booked).toMatchObject({
      level: 1,
      elixir: before.elixir - 300,
      potions: 0,
      end: before.clock + 15_000,
    });
    await tap('builders');
    const countdown = page.locator('.builder-menu [data-action="select-building:2"] em');
    await expect(countdown).toHaveText('15s');
    await page.clock.setFixedTime(booked.clock + 1000);
    await expect.poll(async () => (await read()).end).toBe(booked.end - 9000);
    await expect(countdown).toHaveText(baselineDist ? '14s' : '5s');
    await shot('ticking');
    // The next navigation uses the ordinary pagehide save, then simulates 400ms away.
    await page.goto('about:blank');
    await page.clock.setFixedTime(booked.clock + 1400);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await ready();
    expect(await read()).toMatchObject({
      level: 1,
      end: booked.end - 12_600,
      elixir: booked.elixir,
      potions: 0,
    });
    await tap('builders');
    await expect(countdown).toHaveText('1s');
    await shot('reloaded');
    await page.clock.setFixedTime(booked.clock + 1500);
    await expect(countdown).toHaveCount(0);
    expect(await read()).toMatchObject({
      level: 2,
      end: undefined,
      elixir: booked.elixir,
      potions: 0,
    });
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        label,
        firstDeadline: booked.end,
        displayed: baselineDist ? '14s' : '5s',
        afterReload: '1s',
      }),
    );
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
