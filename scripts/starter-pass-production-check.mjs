// Touch-play the first Starter Pass reward from Town Hall 1 through reload.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const townHall = 1;
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/starter-pass';
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
        const storage = model.state.buildings.find((b) => b.id === 2);
        const tower = model.state.buildings.find((b) => b.kind === 'archertower');
        return {
          hall: model.townhall.level,
          hallEnd: model.townhall.upgradeEnd,
          storageEnd: storage.upgradeEnd,
          towerEnd: tower?.upgradeEnd,
          towerExists: !!tower,
          elixir: model.state.elixir,
          points: model.starterPoints,
          claimed: model.state.starter?.claimed ?? [],
        };
      });
    const awards = () => page.locator('.left-tools [data-action="achievements"]').tap();
    const panel = page.locator('.starter-body');
    const challenge = (id) => panel.locator(`[data-challenge="${id}"]`);
    const tier = panel.locator('[data-tier="0"]');
    const openPass = async () => {
      await awards();
      await page.locator('.starter-card [data-action="starter"]').tap();
    };
    const advance = async (end, key) => {
      expect(end).toBeGreaterThan(0);
      await page.clock.setFixedTime(end);
      await expect.poll(async () => (await read())[key]).toBeUndefined();
    };
    await ready();
    await awards();
    await expect(page.locator('.starter-card')).toHaveCount(baselineDist ? 1 : 0);
    if (baselineDist) {
      await page.locator('.starter-card [data-action="starter"]').tap();
      await expect(panel.locator('[data-challenge]')).toHaveCount(0);
      await expect(tier).toContainText('100 points');
    }
    await shot('town-hall-1');
    await tap('close');
    await fieldTap(24, 23);
    await tap('upgrade:1');
    const hall = await read();
    expect(hall.hall).toBe(1);
    expect(hall.hallEnd).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Close building' }).tap();
    await awards();
    await expect(page.locator('.starter-card')).toHaveCount(baselineDist ? 1 : 0);
    await tap('close');
    await advance(hall.hallEnd, 'hallEnd');
    expect((await read()).hall).toBe(2);
    await openPass();
    const coffers = challenge('TH2_Home_UpgradeGoldStorage');
    const sentry = challenge('TH2_Home_BuildArcherTower');
    await expect(coffers).toContainText('Bigger Coffers');
    await expect(sentry).toContainText('Sentry Duty');
    await expect(tier).toContainText('100 points');
    await shot('unlocked');
    await tap('close');
    await fieldTap(17.5, 21.5);
    await tap('upgrade:2');
    const storage = await read();
    await advance(storage.storageEnd, 'storageEnd');
    expect((await read()).points).toBe(25);
    await page.locator('.shop-btn').tap();
    await tap('tab:Defenses');
    await tap('build:archertower');
    await fieldTap(20.5, 16.5);
    const tower = await read();
    expect(tower.towerExists).toBe(true);
    expect(tower.points).toBe(25);
    await advance(tower.towerEnd, 'towerEnd');
    await page.getByRole('button', { name: 'Close building' }).tap();
    await openPass();
    await expect(coffers).toHaveClass(/done/);
    await expect(sentry).toHaveClass(/done/);
    await expect(panel.getByRole('progressbar', { name: 'Starter Pass points' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    const claim = tier.getByRole('button', { name: 'Claim' });
    await expect(claim).toBeVisible();
    await tier.scrollIntoViewIfNeeded();
    await shot('ready');
    const before = await read();
    await claim.tap();
    await expect(tier).toContainText('Claimed');
    expect(await read()).toMatchObject({ elixir: before.elixir + 2000, points: 100, claimed: [0] });
    await page.reload();
    await ready();
    await openPass();
    await expect(tier).toContainText('Claimed');
    await expect(claim).toHaveCount(0);
    expect(await read()).toMatchObject({ elixir: before.elixir + 2000, points: 100, claimed: [0] });
    await tier.scrollIntoViewIfNeeded();
    await shot('reopened');
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        label,
        firstAccess: baselineDist ? 1 : 2,
        points: 100,
        elixirPaid: 2000,
        claims: 1,
      }),
    );
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
