// Touch-play a Firespitter burst across the instant Invisibility takes effect.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/firespitter-invisibility';
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
      makeBuilding(1, 'townhall', 34, 31, 17),
      { ...makeBuilding(2, 'firespitter', 20, 20, 1), direction: 4 },
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 6),
      makeBuilding(6, 'darkbarracks', 34, 39, 4),
      makeBuilding(7, 'spellfactory', 40, 35, 6),
    ],
    army: { ...emptyArmy(), golem: 1, giant: 1, archer: 1 },
    spells: { ...emptySpells(), invisibility: 1 },
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
        const { battle, replay } = window.qa.model;
        const unit = (kind) => {
          const u = battle?.units.find((v) => v.kind === kind);
          return u && { lost: u.maxHp - u.hp, invisibleUntil: u.native?.effects?.invisibleUntil };
        };
        return {
          at: battle?.elapsed,
          inside: unit('golem'),
          outside: unit('giant'),
          fired: battle?.nativeShotSequence ?? 0,
          inFlight: battle?.nativePiercing?.length ?? 0,
          replay: replay && { time: replay.time, paused: replay.paused },
        };
      });
    // Advance identical 50 ms simulation ticks across the narrow launch/concealment window.
    // Deployment, casting and replay controls still receive trusted Chromium touch input.
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

    await tap('troop:giant');
    await fieldTap(31.5, 21.5, true);
    await tap('spell:invisibility');
    await fieldTap(9.5, 21.5, false);
    await steps(23);
    const outside = await read();
    expect(outside.outside.lost).toBe(0);
    expect(outside.fired).toBe(0);
    await tap('troop:golem');
    await fieldTap(9.5, 21.5, true);
    await steps(8);
    const concealed = await read();
    expect(concealed.inside.invisibleUntil).toBeGreaterThan(concealed.at);
    expect(concealed.inside.lost).toBe(0);
    expect(concealed.inFlight).toBeGreaterThan(0);
    await shot('shots-in-flight');
    await steps(13);
    const impact = await read();
    expect(impact.inside.invisibleUntil).toBeGreaterThan(impact.at);
    expect(impact.fired).toBe(concealed.fired);
    expect(impact.outside.lost).toBe(0);
    if (baselineDist) expect(impact.inside.lost).toBe(0);
    else expect(impact.inside.lost).toBeGreaterThan(0);
    await shot('concealed-impact');

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
    expect((await read()).inside).toBeUndefined();
    await tap('replay-jump:10');
    await steps(50);
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await read();
    expect(replay.inside).toEqual(impact.inside);
    expect(replay.outside).toEqual(impact.outside);
    expect(replay.fired).toBe(impact.fired);
    await shot('replay-end');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ label, outside, concealed, impact, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
