import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv[2];
const artifacts = 'output/rea-cloud-playtest/spell-boundary-feedback';
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
      makeBuilding(8, 'spellfactory', 28, 14, 1),
    ],
    army: { ...emptyArmy(), archer: 70 },
    spells: { ...emptySpells(), lightning: 1 },
    gold: 1000,
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
    await tap('spell:lightning');
    await expect(page.locator('.deploy-label')).toContainText(
      baseline ? 'Tap anywhere to cast' : 'Tap the battlefield to cast',
    );
    // Frame the board edge in the compact viewport. Actual casts still go through touch.
    const points = await page.evaluate(() => {
      const { scene, model } = window.qa;
      scene.cameras.main.setZoom(0.25);
      const cannon = model.battle.buildings.find((b) => b.kind === 'cannon');
      const inside = scene.screenFor(cannon.x + 1, cannon.y + 1);
      const outside = Array.from({ length: 25 }, (_, i) => scene.screenFor(-3, i * 2)).find(
        (p) =>
          p.y > 175 &&
          p.y < 415 &&
          document.elementFromPoint(p.x, p.y) === scene.game.canvas &&
          scene.gridAtScreen(p.x, p.y).x < -1,
      );
      if (!outside || document.elementFromPoint(inside.x, inside.y) !== scene.game.canvas)
        throw Error('Could not expose a legal target and the board edge');
      return { outside, inside };
    });
    const state = () =>
      page.evaluate(() => {
        const b = window.qa.model.battle;
        return {
          started: b.started,
          spells: b.spells.lightning,
          hp: b.buildings.find((b) => b.kind === 'cannon')?.hp,
        };
      });
    const before = await state();
    const toast = page.locator('#toast.show');
    await page.touchscreen.tap(points.outside.x, points.outside.y);
    expect(await state()).toEqual(before);
    if (baseline) await expect(toast).toHaveCount(0);
    else await expect(toast).toContainText('Tap inside the battlefield to cast');
    await shot('rejected');
    await page.touchscreen.tap(points.inside.x, points.inside.y);
    expect(await state()).toMatchObject({ started: true, spells: 0 });
    await expect.poll(async () => (await state()).hp).toBeLessThan(before.hp);
    expect(await toast.count()).toBe(0);
    await shot('accepted');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    const recorded = await page.evaluate(() =>
      window.qa.model.state.raidLog[0].replay.actions.filter((a) => a.type === 'spell'),
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
