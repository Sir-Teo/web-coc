// Save and restore a directional defense, then inspect the sector in Practice and replay.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const kind = process.env.DIRECTIONAL_DEFENSE ?? 'airsweeper';
const isSweeper = kind === 'airsweeper';
const screenshots = 'output/rea-cloud-playtest/directional-layout';
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
      makeBuilding(1, 'townhall', 30, 27, 18),
      { ...makeBuilding(2, kind, 22, 18, 1), direction: isSweeper ? 3 : 2 },
      makeBuilding(3, 'builder', 34, 33, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 33, 23, 6),
    ],
    army: { ...emptyArmy(), balloon: 1, archer: 1 },
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
    const shot = (name) => page.screenshot({ path: `${screenshots}/${kind}-${label}-${name}.png`, animations: 'disabled' });
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
        const { battle, replay, state } = window.qa.model;
        const direction = (layout) => layout?.find(({ id }) => id === 2)?.direction;
        return {
          home: direction(state.buildings),
          saved: direction(state.layouts?.[0]?.slots),
          battle: direction(battle?.buildings),
          deployed: !!battle?.units.some(({ kind }) => kind === 'balloon'),
          pushed: !!battle?.airSweepers?.[2]?.shots?.length || !!battle?.gusts?.length,
          fired: battle?.nativeDefenses?.[2]?.firedAt,
          time: replay?.time,
        };
      });
    const select = async () => {
      const center = isSweeper ? 1 : 1.5;
      await fieldTap(22 + center, 18 + center, false);
      await expect.poll(() => page.evaluate(() => window.qa.model.selected)).toBe(2);
    };
    const homeDirection = (dir) => expect.poll(async () => (await read()).home).toBe(dir);
    const layouts = async () => {
      await page.getByRole('button', { name: 'Close building' }).tap();
      await tap('edit');
      await tap('layouts');
    };
    const close = () => page.locator('.modal [data-action="close"]').tap();

    const drawnRange = () => page.evaluate(() => {
      const { scene } = window.qa;
      const layer = scene.overlay;
      const strokePoints = layer.strokePoints;
      const strokeEllipse = layer.strokeEllipse;
      let sector = null;
      let ellipses = 0;
      layer.strokePoints = function (points, ...args) {
        if (points.length === 98) {
          const center = points[73];
          // The three samples identify the start, center line and end of the outer arc.
          sector = [0, 24, 48].map((i) => [
            +(points[i].x - center.x).toFixed(4),
            +(points[i].y - center.y).toFixed(4),
          ]);
        }
        return strokePoints.call(this, points, ...args);
      };
      layer.strokeEllipse = function (...args) {
        ellipses++;
        return strokeEllipse.apply(this, args);
      };
      try {
        scene.drawOverlay(0);
        return { sector, ellipses };
      } finally {
        layer.strokePoints = strokePoints;
        layer.strokeEllipse = strokeEllipse;
      }
    });

    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await select();
    await tap('sweeper-rotate');
    await homeDirection(4);
    await shot('direction-set');
    await layouts();
    await tap('layout-save:0');
    await expect.poll(async () => (await read()).saved).toBe(4);
    await close();
    await tap('edit-done');

    await select();
    await tap('sweeper-rotate');
    await homeDirection(isSweeper ? 5 : 6);
    await shot('direction-changed');
    await layouts();
    await tap('layout-load:0');
    await homeDirection(4);
    await close();
    await tap('edit-done');
    await page.reload();
    await page.waitForFunction(() => window.qa?.scene.ready);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await homeDirection(4);
    await select();
    const homeRange = await drawnRange();
    await shot('reloaded-home');

    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await select();
    expect((await read()).battle).toBe(4);
    expect(await page.evaluate(() => window.qa.model.battle.started)).toBe(false);
    const practiceRange = await drawnRange();
    expect(practiceRange).toEqual(homeRange);
    if (!isSweeper) {
      if (baselineDist) expect(practiceRange).toEqual({ sector: null, ellipses: 1 });
      else {
        expect(practiceRange.ellipses).toBe(0);
        expect(practiceRange.sector).toHaveLength(3);
        // The west-facing centerline extends 16 tiles along the negative X axis.
        expect(practiceRange.sector[1]).toEqual([-512, -256]);
      }
    } else expect(practiceRange.sector).toHaveLength(3);
    await shot('practice-sector');
    await tap('troop:balloon');
    await fieldTap(15.5, 19.5, true);
    await expect.poll(async () => (await read()).deployed).toBe(true);
    if (isSweeper) await expect.poll(async () => (await read()).pushed).toBe(true);
    else await expect.poll(async () => (await read()).fired).toBeGreaterThanOrEqual(0);
    await shot('live');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const pause = page.locator('[data-action="replay-pause"]');
    if ((await pause.getAttribute('aria-label')) === 'Pause' && await pause.isEnabled())
      await pause.tap();
    await tap('replay-jump:-10');
    await expect.poll(async () => (await read()).time).toBe(0);
    expect((await read()).battle).toBe(4);
    expect((await read()).deployed).toBe(false);
    await tap('replay-jump:10');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await read();
    expect(replay.battle).toBe(4);
    expect(replay.home).toBe(4);
    expect(replay.deployed).toBe(true);
    if (isSweeper) expect(replay.pushed).toBe(true);
    else expect(replay.fired).toBeGreaterThanOrEqual(0);
    await shot('replay-end');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ label, kind, practiceRange, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
