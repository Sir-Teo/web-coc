// Touch-play Ice Block overlapping Giant Gauntlet protection.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/ice-block-overlap';
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
      makeBuilding(1, 'townhall', 34, 31, 14),
      makeBuilding(2, 'cannon', 25, 20, 8),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 10),
      makeBuilding(6, 'herohall', 34, 39, 8),
      makeBuilding(7, 'darkspellfactory', 30, 36, 7),
    ],
    army: { ...emptyArmy(), giant: 1 },
    spells: { ...emptySpells(), iceblock: 1 },
    king: { level: 60 },
    heroLineup: ['king'],
    gear: { levels: { 'giant-gauntlet': 1 }, loadouts: { king: ['giant-gauntlet'] } },
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
        const { battle, replay } = window.qa.model;
        const king = battle?.units.find((u) => u.hero === 'king');
        return {
          at: battle?.elapsed,
          king: king && { hp: king.hp, x: king.x, y: king.y, effects: king.native?.effects },
          replay: replay && { time: replay.time, paused: replay.paused },
        };
      });
    // Match the simulation ticks while issuing every gameplay command via Chromium touch.
    const steps = (count) => page.evaluate((count) => {
      const { model, scene } = window.qa;
      for (let i = 0; i < count; i++) model.step(0.05);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    }, count);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.evaluate(() => { window.qa.scene.paused = true; });

    const king = page.locator('[data-action="hero-select:king"]');
    await king.tap();
    await fieldTap(17.5, 21.5, true);
    await steps(2);
    await expect(king).toHaveAccessibleName(/Activate ability/);
    await king.tap();
    await steps(2);
    const gauntlet = await read();
    expect(gauntlet.king.effects.shield.percent).toBeGreaterThan(0);
    await tap('spell:iceblock');
    await fieldTap(gauntlet.king.x, gauntlet.king.y, false);
    await steps(40);
    const overlap = await read();
    expect(overlap.king.effects.frozenUntil).toBeGreaterThan(overlap.at);
    if (baselineDist) {
      expect(overlap.king.effects.shield.percent).toBe(0.86);
      expect(overlap.king.effects.shield.until).toBe(gauntlet.king.effects.shield.until);
    } else {
      expect(overlap.king.effects.shield).toEqual(gauntlet.king.effects.shield);
      expect(overlap.king.effects.iceBlockShield.percent).toBe(0.86);
    }
    await shot('overlap');
    await steps(Math.ceil((overlap.king.effects.frozenUntil - overlap.at) / 0.05) + 2);
    const thaw = await read();
    await steps(16);
    const live = await read();
    expect(live.at).toBeGreaterThan(overlap.king.effects.frozenUntil);
    expect(live.at).toBeLessThan(gauntlet.king.effects.shield.until);
    await shot('after-thaw');

    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const pause = page.locator('[data-action="replay-pause"]');
    if ((await pause.getAttribute('aria-label')) === 'Pause' && await pause.isEnabled())
      await pause.tap();
    await tap('replay-jump:-10');
    await steps(3);
    expect((await read()).replay.time).toBe(0);
    expect((await read()).king).toBeUndefined();
    await tap('replay-jump:10');
    await steps(90);
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await read();
    expect(replay.king).toEqual(live.king);
    await shot('replay-end');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ label, gauntlet, overlap, thaw, live, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
