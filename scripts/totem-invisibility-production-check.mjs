// Touch-play Totem concealment and its effect on Cannon targeting.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/totem-invisibility';
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
      makeBuilding(1, 'townhall', 34, 31, 16),
      makeBuilding(2, 'cannon', 25, 20, 8),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 10),
      makeBuilding(6, 'herohall', 34, 39, 8),
      makeBuilding(7, 'spellfactory', 30, 36, 9),
    ],
    army: { ...emptyArmy(), giant: 1 },
    spells: emptySpells(),
    king: { level: 60 },
    heroLineup: ['king'],
    gear: { levels: { 'giant-gauntlet': 1 }, loadouts: { king: ['giant-gauntlet'] } },
  });
  model.brew('totem');
  model.brew('invisibility');
  expect(model.state.spells).toMatchObject({ totem: 1, invisibility: 1 });
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
    const shot = (name) =>
      page.screenshot({ path: `${screenshots}/${label}-${name}.png`, animations: 'disabled' });
    const fieldTap = async (x, y, deploy) => {
      const point = await page.evaluate(
        ({ x, y, deploy }) => {
          const { model, scene } = window.qa;
          const point = scene.screenFor(x, y);
          const grid = scene.gridAtScreen(Math.round(point.x), Math.round(point.y));
          if (deploy && model.deployBlocked(grid.x, grid.y)) throw Error('Blocked deployment');
          if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
            throw Error(`Field point is occluded at ${JSON.stringify(point)}`);
          return { x: point.x, y: point.y };
        },
        { x, y, deploy },
      );
      await page.touchscreen.tap(point.x, point.y);
    };
    const read = () =>
      page.evaluate(() => {
        const { model } = window.qa;
        const b = model.battle;
        const unit = (u) =>
          u && {
            id: u.id,
            hp: u.hp,
            x: u.x,
            y: u.y,
            hiddenUntil: u.native?.effects?.invisibleUntil,
          };
        return {
          at: b.elapsed,
          king: unit(b.units.find((u) => u.hero === 'king')),
          totem: unit(b.units.find((u) => u.kind === 'totem')),
          target: b.defenseTargets[2],
          spells: b.spells,
        };
      });
    const step = (ticks) =>
      page.evaluate((ticks) => {
        const { model, scene } = window.qa;
        for (let i = 0; i < ticks; i++) model.step(0.05);
        scene.sync();
        scene.drawOverlay(0);
      }, ticks);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.locator('.train-add').tap();
    const army = page.locator('.drawer-sheet');
    await expect(army.locator('[data-army-count="spell:totem"]')).toHaveText('1');
    await expect(army.locator('[data-army-count="spell:invisibility"]')).toHaveText('1');
    await expect(army.locator('.drawer-head')).toContainText('2/10');
    await shot('army');
    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    const cameraPose = await page.evaluate(() => {
      const { scene } = window.qa;
      scene.paused = true;
      const camera = scene.cameras.main;
      const point = scene.screenFor(20, 20);
      const canvas = scene.canvasPoint(point.x, point.y);
      const anchor = camera.getWorldPoint(canvas.x, canvas.y);
      camera.useBounds = false;
      camera.setZoom(0.72).centerOn(anchor.x, anchor.y);
      return { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom };
    });
    await tap('spell:totem');
    await fieldTap(20.5, 19, false);
    await step(56);
    const decoy = await read();
    expect(decoy.totem).toBeDefined();
    expect(decoy.target).toBe(decoy.totem.id);
    await shot('totem-targeted');
    await step(1);
    await tap('hero-select:king');
    await fieldTap(24.5, 27.5, true);
    await tap('spell:invisibility');
    await fieldTap(decoy.totem.x, decoy.totem.y, false);
    await step(44);
    const covered = await read();
    expect(covered.king).toBeDefined();
    expect(covered.king.hiddenUntil).toBeUndefined();
    expect(covered.target).toBe(baselineDist ? covered.totem.id : covered.king.id);
    if (baselineDist) expect(covered.totem.hiddenUntil).toBeUndefined();
    else expect(covered.totem.hiddenUntil).toBeGreaterThan(covered.at);
    expect(covered.spells).toMatchObject({ totem: 0, invisibility: 0 });
    await shot('concealment');
    await step(105);
    const revealed = await read();
    expect(revealed.totem.hp).toBeGreaterThan(0);
    expect(revealed.totem.hiddenUntil ?? 0).toBeLessThan(revealed.at);
    await shot('after-reveal');
    await step(1);
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const seek = (at) =>
      page.evaluate(
        ({ at, cameraPose }) => {
          const { model, scene } = window.qa;
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          scene.sync();
          scene.cameras.main.useBounds = false;
          scene.cameras.main.setZoom(cameraPose.zoom).setScroll(cameraPose.x, cameraPose.y);
          scene.drawOverlay(0);
        },
        { at, cameraPose },
      );
    const duration = await page.evaluate(() => window.qa.model.replay.duration);
    await seek(duration);
    const scout = duration - (await read()).at;
    for (const frame of [covered, decoy, revealed, covered]) {
      await seek(scout + frame.at);
      expect(await read()).toEqual(frame);
    }
    await shot('replay-concealment');
    expect(errors).toEqual([]);
    console.log({
      label,
      targetBefore: decoy.target,
      targetDuring: covered.target,
      totem: covered.totem.id,
      king: covered.king.id,
    });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
