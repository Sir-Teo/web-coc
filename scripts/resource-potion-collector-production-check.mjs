// Compare collector production after a touch-started upgrade and offline completion.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const townHall = 3;
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/resource-potion';
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
  model.addMagicItem('resource-potion');
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
        const other = model.state.buildings.find((b) => b.id === 4);
        return {
          level: mine.level,
          end: mine.upgradeEnd,
          stored: mine.stored,
          other: other.stored,
          potions: model.magicItemCount('resource-potion'),
          elixir: model.state.elixir,
          boost: model.state.boosts?.resources,
        };
      });
    await ready();
    await fieldTap(24, 23);
    await tap('magic-items');
    await tap('item-potion:resource-potion');
    await expect(page.locator('[data-item="resource-potion"]')).toContainText('left');
    await shot('boost-active');
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await fieldTap(17.5, 21.5);
    const before = await read();
    await tap('upgrade:2');
    const pending = await read();
    expect(pending).toMatchObject({ level: 1, potions: 0 });
    expect(pending.elixir).toBe(before.elixir - 300);
    expect(pending.end).toBeLessThan(pending.boost.end);
    await shot('upgrading');
    await page.goto('about:blank');
    await page.clock.setFixedTime(pending.end + 600_000);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await ready();
    const completed = await read();
    expect(completed).toMatchObject({ level: 2, end: undefined, potions: 0, elixir: pending.elixir });
    expect(completed.stored - pending.stored).toBeCloseTo(baselineDist ? 133.333 : 66.667, 2);
    expect(completed.other - pending.other).toBeCloseTo(
      (((pending.end + 600_000 - pending.boost.start) / 1000) * 2 * 200) / 3600,
      2,
    );
    await fieldTap(17.5, 21.5);
    await expect(page.locator('.building-context h2')).toHaveText('Gold Mine');
    await shot('after-reload');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ label, pending, completed }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
