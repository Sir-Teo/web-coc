// Play the same disposable Practice layout against each packaged build.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/jump-siege';
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
      makeBuilding(1, 'townhall', 25, 20, 12),
      makeBuilding(2, 'goldstorage', 36, 36, 12),
      makeBuilding(3, 'spellfactory', 30, 20, 4),
      makeBuilding(4, 'workshop', 30, 25, 1),
      makeBuilding(5, 'builder', 32, 33, 1),
      ...Array.from({ length: 11 }, (_, n) => makeBuilding(6 + n, 'wall', 21, 16 + n, 12)),
    ],
    army: emptyArmy(),
    spells: emptySpells(),
  });
  model.state.settings.sound = false;
  model.state.settings.music = false;
  model.train('wallwrecker');
  model.brew('jump');
  expect(model.state.army.wallwrecker).toBe(1);
  expect(model.state.spells.jump).toBe(1);
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
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((fixture) => {
      if (!localStorage.getItem('crown-clan-save-v1'))
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
    const shot = (name) => page.screenshot({ path: `${screenshots}/${label}-${name}.png` });
    const fieldTap = async (x, y, deploy) => {
      const point = await page.evaluate(({ x, y, deploy }) => {
        const { model, scene } = window.qa;
        const point = scene.screenFor(x, y);
        const grid = scene.gridAtScreen(Math.round(point.x), Math.round(point.y));
        if (deploy && model.deployBlocked(grid.x, grid.y)) throw Error('Blocked deployment');
        if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
          throw Error(`Field point is occluded at ${JSON.stringify(point)}`);
        return { x: point.x, y: point.y };
      }, { x, y, deploy });
      await page.touchscreen.tap(point.x, point.y);
    };
    const read = () =>
      page.evaluate(() => {
        const { battle, replay } = window.qa.model;
        const unit = battle.units.find(({ kind }) => kind === 'wallwrecker');
        return {
          unit: unit && { x: unit.x, y: unit.y, hp: unit.hp, attacks: unit.native.attacks ?? 0 },
          walls: battle.buildings.filter(({ kind }) => kind === 'wall').map(({ hp, maxHp }) => ({
            hp, maxHp,
          })),
          jump: battle.nativeSpells?.find(({ name }) => name === 'Jump')?.hits ?? 0,
          replay: replay && { time: replay.time, complete: replay.complete },
        };
      });
    const damaged = (state) => state.walls.filter(({ hp, maxHp }) => hp < maxHp).length;

    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await tap('spell:jump');
    await fieldTap(21.5, 21.5, false);
    await expect.poll(async () => (await read()).jump).toBeGreaterThan(0);
    await tap('troop:wallwrecker');
    await fieldTap(18, 21.5, true);
    await expect.poll(async () => {
      const state = await read();
      return baselineDist ? state.unit?.x > 22 : damaged(state) > 0;
    }, { timeout: 15000 }).toBe(true);
    const contact = await read();
    if (baselineDist) expect(damaged(contact)).toBe(0);
    else expect(contact.unit.x).toBeLessThan(21);
    await shot('wall-contact');

    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    const finished = await read();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await tap('replay-pause');
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await slider.press('Home');
    await expect.poll(async () => (await read()).replay?.time).toBe(0);
    expect((await read()).unit).toBeUndefined();
    expect(damaged(await read())).toBe(0);
    await slider.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await read();
    expect(replay.unit).toEqual(finished.unit);
    expect(replay.walls).toEqual(finished.walls);
    await shot('replay-end');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ label, contact, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
