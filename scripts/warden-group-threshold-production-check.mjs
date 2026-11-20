// Toggle Warden mode, then touch-play the same low-weight group approach in both packaged builds.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/warden-group-threshold';
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
      makeBuilding(1, 'townhall', 34, 34, 12),
      makeBuilding(2, 'herohall', 34, 25, 6),
      makeBuilding(3, 'goldstorage', 26, 17, 12),
      makeBuilding(4, 'builder', 39, 34, 1),
    ],
    army: { ...emptyArmy(), archer: 2 },
    spells: emptySpells(),
    heroes: { warden: { level: 20 } },
    heroLineup: ['warden'],
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
        const warden = battle.units.find(({ hero }) => hero === 'warden');
        return {
          at: battle.elapsed,
          archers: battle.carriedArmy.archer - battle.remaining.archer,
          warden: warden && {
            kind: warden.kind, id: warden.id, hp: warden.hp, x: warden.x, y: warden.y,
            target: warden.target, spawnedAt: warden.spawnedAt,
          },
          replay: replay && { time: replay.time, complete: replay.complete },
        };
      });
    const openHeroes = async () => {
      await page.locator('.train-add').tap();
      await tap('heroes');
    };
    await openHeroes();
    await expect(page.locator('[data-action="warden-mode"]')).toHaveText('Ground mode');
    await tap('warden-mode');
    await expect(page.locator('[data-action="warden-mode"]')).toHaveText('Air mode');
    await page.reload();
    await page.waitForFunction(() => window.qa?.scene.ready);
    await openHeroes();
    await expect(page.locator('[data-action="warden-mode"]')).toHaveText('Air mode');
    await shot('army-air-mode');
    await page.locator('.modal [data-action="close"]').tap();
    await tap('close-drawer');

    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await tap('troop:archer');
    await fieldTap(16, 27, true);
    if ((await read()).archers === 1) await fieldTap(16, 27, true);
    await expect.poll(async () => (await read()).archers).toBe(2);
    await tap('hero-select:warden');
    await fieldTap(16, 18, true);
    await expect.poll(async () => {
      const state = await read();
      return state.warden ? state.at - state.warden.spawnedAt : 0;
    }).toBeGreaterThanOrEqual(0.6);
    const approach = await read();
    expect(approach.warden.kind).toBe('grandwardenair');
    expect(approach.warden.target).toBe(3);
    if (baselineDist) {
      expect(approach.warden.y).toBeGreaterThan(19);
      expect(approach.warden.x).toBeLessThan(17);
    } else {
      expect(approach.warden.x).toBeGreaterThan(17);
      expect(approach.warden.y).toBeLessThan(19);
    }
    await shot('live-approach');

    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    const finished = await read();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const pause = page.locator('[data-action="replay-pause"]');
    if ((await pause.getAttribute('aria-label')) === 'Pause' && await pause.isEnabled())
      await pause.tap();
    await tap('replay-jump:-10');
    await expect.poll(async () => (await read()).replay?.time).toBe(0);
    expect((await read()).warden).toBeUndefined();
    await tap('replay-jump:10');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await read();
    expect(replay.warden).toEqual(finished.warden);
    expect(replay.archers).toBe(finished.archers);
    await shot('replay-end');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ label, approach, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
