// Touch-play Lavaloon Puppet through bomb impact, support deployment and replay.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/lavaloon-puppet-bombs';
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
      makeBuilding(2, 'airdefense', 21, 21, 1),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 10),
      makeBuilding(6, 'herohall', 34, 39, 8),
      makeBuilding(7, 'spellfactory', 30, 36, 6),
      makeBuilding(8, 'blacksmith', 35, 27, 7),
    ],
    army: { ...emptyArmy(), balloon: 4 },
    spells: emptySpells(),
    heroes: { warden: { level: 20 } },
    heroLineup: ['warden'],
    gear: { levels: { 'lavaloon-puppet': 3 }, loadouts: { warden: ['lavaloon-puppet'] } },
  });
  model.brew('freeze');
  expect(model.state.spells.freeze).toBe(1);
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
        return {
          at: b.elapsed,
          airDefense: b.buildings.find(({ id }) => id === 2).hp,
          units: b.units.map(({ id, kind, x, y, level, hp, native }) => ({
            id,
            kind,
            x,
            y,
            level,
            hp,
            attacks: native?.attacks,
          })),
          remainingBalloon: b.remaining.balloon,
          remainingFreeze: b.spells.freeze,
        };
      });
    const advance = (mode) =>
      page.evaluate((mode) => {
        const { model, scene } = window.qa;
        const b = model.battle;
        const done = () =>
          mode === 'bomb'
            ? b.units.some((u) => u.kind === 'gwlavaloon' && u.native?.attacks)
            : b.buildings.find(({ id }) => id === 2).hp <= 0;
        for (let i = 0; i < 800 && !done() && !b.finished; i++) model.step(0.05);
        if (!done()) throw Error(`Unreached phase: ${mode}`);
        for (let i = 0; i < 2; i++) model.step(0.05);
        scene.sync();
        scene.drawOverlay(0);
      }, mode);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.locator('.train-add').tap();
    await expect(page.locator('[data-army-count="troop:balloon"]')).toHaveText('4');
    await expect(page.locator('[data-army-count="spell:freeze"]')).toHaveText('1');
    await page.locator('.modern-army-actions [data-action="heroes"]').tap();
    const warden = page.locator('.hero-section[data-hero="warden"]');
    await expect(warden).toContainText('Lavaloon Puppet');
    await warden.getByRole('heading', { name: 'Lavaloon Puppet' }).scrollIntoViewIfNeeded();
    await shot('equipment');
    await page.locator('.modal [data-action="close"]').tap();
    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    const cameraPose = await page.evaluate(() => {
      const { scene } = window.qa;
      scene.paused = true;
      const camera = scene.cameras.main;
      const point = scene.screenFor(16, 16);
      const canvas = scene.canvasPoint(point.x, point.y);
      const anchor = camera.getWorldPoint(canvas.x, canvas.y);
      camera.useBounds = false;
      camera.setZoom(0.66).centerOn(anchor.x, anchor.y);
      return { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom };
    });
    await tap('hero-select:warden');
    await fieldTap(14, 17, true);
    await tap('hero-select:warden');
    await tap('spell:freeze');
    await fieldTap(21.7, 21.7, false);
    await advance('bomb');
    const impact = await read();
    expect(impact.airDefense).toBeLessThan(800);
    expect(impact.units.find(({ kind }) => kind === 'gwlavaloon')).toMatchObject({
      level: 2,
      attacks: 1,
    });
    expect(impact.units.find(({ kind }) => kind === 'gwlavaloon').hp).toBeGreaterThan(0);
    expect(
      impact.units.filter(({ kind }) => kind === 'gwlavaloonpup').map(({ level }) => level),
    ).toEqual(baselineDist ? [] : [2]);
    await shot('bomb-impact');
    // Separate the sampled impact tick from the next recorded touch actions.
    await page.evaluate(() => window.qa.model.step(0.05));
    await tap('troop:balloon');
    for (let i = 0; i < 4; i++) await fieldTap(14, 18 + i * 0.4, true);
    await advance('defense-down');
    const defenseDown = await read();
    expect(defenseDown.airDefense).toBe(0);
    expect(defenseDown.remainingBalloon).toBe(0);
    expect(defenseDown.remainingFreeze).toBe(0);
    await shot('defense-down');
    await page.evaluate(() => window.qa.model.step(0.05));
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
    for (const frame of [defenseDown, impact]) {
      await seek(scout + frame.at);
      expect(await read()).toEqual(frame);
    }
    await shot('replay-bomb-impact');
    expect(errors).toEqual([]);
    console.log({
      label,
      parent: impact.units.find(({ kind }) => kind === 'gwlavaloon'),
      pupsAtFirstImpact: impact.units.filter(({ kind }) => kind === 'gwlavaloonpup').length,
      defenseDownAt: defenseDown.at,
    });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
