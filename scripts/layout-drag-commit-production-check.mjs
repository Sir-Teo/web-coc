// Compare phone layout drag cancellation, committed placement, and Practice playback.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/layout-drag-commit';
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
      makeBuilding(1, 'townhall', 27, 17, 12),
      makeBuilding(2, 'mortar', 22, 18, 8),
      makeBuilding(3, 'builder', 32, 28, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
    ],
    army: { ...emptyArmy(), archer: 1 },
    spells: emptySpells(),
  });
  model.state.settings.sound = false;
  model.state.settings.music = false;
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
    const shot = (name) => page.screenshot({ path: `${screenshots}/${label}-${name}.png`, animations: 'disabled' });
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
        const { battle, replay, state, canUndo } = window.qa.model;
        const point = ({ x, y }) => [x, y];
        return {
          home: point(state.buildings.find(({ id }) => id === 2)),
          battle: battle && point(battle.buildings.find(({ id }) => id === 2)),
          deployed: battle?.units.some(({ kind }) => kind === 'archer'),
          undo: canUndo,
          time: replay?.time,
        };
      });
    const touch = await page.context().newCDPSession(page);
    const at = (x, y) => page.evaluate(({ x, y }) => {
      const { scene } = window.qa;
      const p = scene.screenFor(x + 1.5, y + 1.5);
      if (document.elementFromPoint(p.x, p.y) !== scene.game.canvas)
        throw Error(`Drag position ${x},${y} is obscured at ${p.x},${p.y}`);
      return [{ x: p.x, y: p.y }];
    }, { x, y });
    const gesture = async (type, point) => touch.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: point ? await at(...point) : [],
    });
    const position = (point) => expect.poll(async () => (await read()).home).toEqual(point);
    const original = [22, 18];
    const attempted = [20, 14];
    const committed = [18, 19];

    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await tap('edit');
    await gesture('touchStart', original);
    await gesture('touchMove', attempted);
    await position(attempted);
    await gesture('touchCancel');
    await position(baselineDist ? attempted : original);
    expect((await read()).undo).toBe(!!baselineDist);
    await shot('after-touch-cancel');
    if (baselineDist) {
      await tap('undo');
      await position(original);
    }

    await gesture('touchStart', original);
    await gesture('touchMove', attempted);
    await position(attempted);
    await gesture('touchMove', [27, 17]);
    await gesture('touchEnd');
    await position(baselineDist ? attempted : original);
    if (!baselineDist) await expect(page.locator('#toast')).toContainText('spot is blocked');
    await shot('blocked-release');

    await gesture('touchStart', baselineDist ? attempted : original);
    await gesture('touchMove', committed);
    await position(committed);
    await gesture('touchEnd');
    await position(committed);
    await tap('edit-done');
    await page.reload();
    await page.waitForFunction(() => window.qa?.scene.ready);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await position(committed);
    await shot('reloaded-home');

    if (!baselineDist) {
      await tap('edit');
      await gesture('touchStart', committed);
      await gesture('touchMove', attempted);
      await position(attempted);
      // Navigate away with the contact held so pagehide handles the unfinished edit.
      await page.reload();
      await page.waitForFunction(() => window.qa?.scene.ready);
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      await position(committed);
    }

    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    expect((await read()).battle).toEqual(committed);
    await shot('practice-layout');
    await tap('troop:archer');
    await fieldTap(12.5, 18.5, true);
    await expect.poll(async () => (await read()).deployed).toBe(true);
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const pause = page.locator('[data-action="replay-pause"]');
    if ((await pause.getAttribute('aria-label')) === 'Pause' && await pause.isEnabled())
      await pause.tap();
    await tap('replay-jump:-10');
    await expect.poll(async () => (await read()).time).toBe(0);
    expect((await read()).battle).toEqual(committed);
    expect((await read()).deployed).toBe(false);
    await tap('replay-jump:10');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await read();
    expect(replay.battle).toEqual(committed);
    expect(replay.home).toEqual(committed);
    expect(replay.deployed).toBe(true);
    await shot('replay-end');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ label, committed, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
