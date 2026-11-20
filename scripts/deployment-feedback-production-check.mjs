import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv[2];
const artifacts = 'output/rea-cloud-playtest/deployment-feedback';
await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { GameModel, initialSave, makeBuilding } =
    await modules.ssrLoadModule('/src/game/model.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const fixture = initialSave();
  Object.assign(fixture, {
    tutorial: true,
    trophies: 0,
    obstacles: [],
    buildings: [
      makeBuilding(1, 'townhall', 22, 21, 5),
      makeBuilding(2, 'camp', 13, 14, 3),
      makeBuilding(3, 'camp', 13, 24, 3),
      makeBuilding(4, 'barracks', 16, 20, 2),
      makeBuilding(5, 'builder', 32, 29),
      makeBuilding(6, 'goldstorage', 25, 15, 2),
      makeBuilding(7, 'elixirstorage', 28, 21, 4),
    ],
    army: { ...emptyArmy(), archer: 70 },
    spells: emptySpells(),
    gold: 1000,
    starter: { counts: { TH2_Battle_LootGold: 3900 }, claimed: [0] },
  });
  fixture.settings.sound = false;
  fixture.settings.music = false;
  expect(new GameModel(fixture).capacity).toBe(70);
  expect(validateSave(fixture)).toBe(true);
  save = JSON.stringify(fixture);
} finally {
  await modules.close();
}
const server = await preview({
  ...(baseline ? { build: { outDir: baseline } } : {}),
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
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((save) => {
      if (!localStorage.getItem('crown-clan-save-v1'))
        localStorage.setItem('crown-clan-save-v1', save);
    }, save);
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
    await page.waitForFunction(() => window.qa?.scene.ready);
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = (name) =>
      page.screenshot({
        animations: 'disabled',
        path: `${artifacts}/${baseline ? 'baseline' : 'patched'}-${name}.png`,
      });

    await page.locator('.attack-btn').tap();
    await tap('attack:0');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await tap('troop:archer');
    const points = await page.evaluate(() => {
      const { scene, model } = window.qa;
      const blocked = model.battle.buildings.find((b) => b.kind === 'townhall');
      const coords = [scene.screenFor(blocked.x + 2, blocked.y + 2), scene.screenFor(32, 26)];
      for (const point of coords)
        if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
          throw Error(`Placement point is occluded at ${JSON.stringify(point)}`);
      return coords.map(({ x, y }) => ({ x, y }));
    });
    const remaining = () => page.evaluate(() => window.qa.model.battle.remaining.archer);
    const toast = page.locator('#toast.show');
    await page.touchscreen.tap(points[0].x, points[0].y);
    await expect(toast).toContainText('outside the red boundary');
    expect(await remaining()).toBe(70);
    await shot('rejected');
    await page.touchscreen.tap(points[1].x, points[1].y);
    expect(await remaining()).toBe(69);
    if (baseline) await expect(toast).toContainText('outside the red boundary');
    else expect(await toast.count()).toBe(0);
    await shot('accepted');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    const recorded = await page.evaluate(() =>
      window.qa.model.state.raidLog[0].replay.actions.filter((a) => a.type === 'troop'),
    );
    expect(recorded).toHaveLength(1);
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const replay = page.getByRole('slider', { name: 'Replay position' });
    await expect(replay).toBeVisible();
    await replay.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
