// Touch-select a geared Mortar, then check its burst in Practice and replay.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/geared-mortar-info';
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
      makeBuilding(1, 'townhall', 34, 33, 18),
      { ...makeBuilding(2, 'mortar', 22, 18, 8), geared: true },
      makeBuilding(3, 'builder', 29, 33, 1),
      makeBuilding(4, 'camp', 26, 25, 1),
      makeBuilding(5, 'darkbarracks', 32, 24, 4),
    ],
    army: { ...emptyArmy(), golem: 1 },
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
    await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = (name) => page.screenshot({ path: `${screenshots}/${label}-${name}.png`, animations: 'disabled' });
    const fieldTap = async (x, y, deploy) => {
      const point = await page.evaluate(({ x, y, deploy }) => {
        const { model, scene } = window.qa;
        const point = scene.screenFor(x, y);
        const grid = scene.gridAtScreen(Math.round(point.x), Math.round(point.y));
        if (deploy && model.deployBlocked(grid.x, grid.y)) throw Error('Blocked deployment');
        if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
          throw Error(`Field point is occluded at ${JSON.stringify(point)} by ${document.elementFromPoint(point.x,point.y)?.outerHTML.slice(0,150)}`);
        return { x: point.x, y: point.y };
      }, { x, y, deploy });
      await page.touchscreen.tap(point.x, point.y);
    };
    const select = async () => {
      await fieldTap(23.5, 19.5, false);
      await expect.poll(() => page.evaluate(() => window.qa.model.selected)).toBe(2);
    };
    const info = page.locator('.building-context [data-action="info"]');
    const row = (name) => page.locator('.info-table tr').filter({
      has: page.getByText(name, { exact: true }),
    }).locator('td');
    const read = async () => ({
      range: await row('Range').nth(1).textContent(),
      dps: await row('Damage per second').nth(1).textContent(),
      damage: await row('Damage per hit').nth(1).textContent(),
      speed: await row('Attack speed').nth(1).textContent(),
    });
    const closeInfo = () => page.locator('.modal [data-action="close"]').tap();

    await select();
    await info.tap();
    const stats = await read();
    expect(stats.range).toBe('4–11 tiles');
    expect(stats.dps).toBe(baselineDist ? '20' : '25');
    expect(stats.damage).toBe(baselineDist ? '100' : '37.67');
    expect(stats.speed).toBe(baselineDist ? '5s' : '0.5s between shots');
    if (!baselineDist) await expect(row('Shots per burst').nth(1)).toHaveText('3');
    await shot('info');

    await page.reload();
    await page.waitForFunction(() => window.qa?.scene.ready);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await select();
    await info.tap();
    expect(await read()).toEqual(stats);
    await closeInfo();

    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await select();
    await expect(page.locator('#toast')).toContainText('Range 4–11 tiles');
    expect(await page.evaluate(() => window.qa.model.battle.started)).toBe(false);
    await shot('practice-range');

    // Sample the already-launched projectiles without changing combat state.
    await page.evaluate(() => {
      const shots = new Map();
      window.qa.mortarShots = shots;
      function sample() {
        const battle = window.qa.model.battle;
        if (!battle || window.qa.model.replay) return;
        for (const shot of battle.projectiles ?? [])
          if (shot.sourceId === 2) shots.set(shot.id, { launched: shot.launched, damage: shot.damage });
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await tap('troop:golem');
    await fieldTap(15.5, 19.5, true);
    const shots = () => page.evaluate(() => [...window.qa.mortarShots.values()]);
    await expect.poll(async () => (await shots()).length, { timeout: 15000 }).toBeGreaterThanOrEqual(3);
    const volley = (await shots()).slice(0, 3);
    expect(volley.map(({ damage }) => Number(damage.toFixed(2)))).toEqual([37.67, 37.67, 37.67]);
    expect(volley.map(({ launched }) => +(launched - volley[0].launched).toFixed(3))).toEqual([0, 0.5, 1]);
    await shot('live-volley');

    const battleState = () => page.evaluate(() => {
      const { battle, replay } = window.qa.model;
      return {
        turret: battle.nativeDefenses?.[2],
        deployed: battle.units.some(({ kind }) => kind === 'golem'),
        hp: battle.units.find(({ kind }) => kind === 'golem')?.hp,
        time: replay?.time,
      };
    });
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    const finished = await battleState();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const pause = page.locator('[data-action="replay-pause"]');
    if ((await pause.getAttribute('aria-label')) === 'Pause' && await pause.isEnabled()) await pause.tap();
    await tap('replay-jump:-10');
    await expect.poll(async () => (await battleState()).time).toBe(0);
    expect((await battleState()).deployed).toBe(false);
    await tap('replay-jump:10');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await battleState();
    expect(replay.turret).toEqual(finished.turret);
    expect(replay.hp).toBe(finished.hp);
    await shot('replay-end');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ label, stats, volley, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
