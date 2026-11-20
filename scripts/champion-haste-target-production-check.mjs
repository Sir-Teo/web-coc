// Touch-play Haste Vial through a Hidden Tesla reveal and replay.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/champion-haste-target';
await mkdir(screenshots, { recursive: true });

const modules = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
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
      makeBuilding(2, 'cannon', 25, 21, 10),
      makeBuilding(3, 'tesla', 22, 22, 6),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 10),
      makeBuilding(6, 'herohall', 34, 39, 8),
      makeBuilding(7, 'spellfactory', 30, 36, 6),
      makeBuilding(8, 'blacksmith', 35, 27, 8),
      makeBuilding(9, 'builder', 40, 34, 1),
    ],
    army: { ...emptyArmy(), giant: 1 },
    spells: emptySpells(),
    heroes: { champion: { level: 20 } },
    heroLineup: ['champion'],
    gear: { levels: { 'haste-vial': 1 }, loadouts: { champion: ['haste-vial'] } },
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
        const b = window.qa.model.battle;
        const unit = b.units.find(({ hero }) => hero === 'champion');
        return {
          at: b.elapsed,
          revealedAt: b.revealedTeslas?.[3],
          unit: unit && {
            id: unit.id,
            hp: unit.hp,
            target: unit.target,
            x: unit.x,
            y: unit.y,
            boost: unit.native?.effects?.boost,
            lock: unit.native?.effects?.hasteTargetLockUntil,
          },
          structures: b.buildings.map(({ id, hp }) => ({ id, hp })),
        };
      });
    const advance = ({ ticks, reveal = false }) =>
      page.evaluate(
        ({ ticks, reveal }) => {
          const { model, scene } = window.qa;
          for (let i = 0; i < ticks; i++) {
            model.step(0.05);
            if (reveal && model.battle.revealedTeslas?.[3] !== undefined) {
              for (let j = 0; j < 3; j++) model.step(0.05);
              break;
            }
          }
          scene.sync();
          scene.drawOverlay(0);
        },
        { ticks, reveal },
      );
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.locator('.train-add').tap();
    await page.locator('.modern-army-actions [data-action="heroes"]').tap();
    const champion = page.locator('.hero-section[data-hero="champion"]');
    await champion.getByRole('heading', { name: 'Haste Vial' }).scrollIntoViewIfNeeded();
    await shot('equipment');
    await page.locator('.modal [data-action="close"]').tap();
    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    const framing = await page.evaluate(() => {
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
    await tap('hero-select:champion');
    await fieldTap(14, 17, true);
    await advance({ ticks: 11 });
    const before = await read();
    expect(before.unit.target).toBe(2);
    expect(before.revealedAt).toBeUndefined();
    await shot('before-reveal');
    await advance({ ticks: 1 });
    await tap('hero-select:champion');
    await advance({ ticks: 120, reveal: true });
    const after = await read();
    expect(after.revealedAt).toBeGreaterThan(before.at);
    expect(after.unit.boost.until).toBeGreaterThan(after.at);
    expect(after.unit.target).toBe(baselineDist ? 3 : 2);
    await shot('after-reveal');
    await advance({ ticks: 45 });
    const contact = await read();
    const targetId = baselineDist ? 3 : 2;
    expect(contact.structures.find(({ id }) => id === targetId).hp).toBeLessThan(
      before.structures.find(({ id }) => id === targetId).hp,
    );
    await shot('defense-contact');
    await advance({ ticks: 1 });
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const seek = (at) =>
      page.evaluate(
        ({ at, framing }) => {
          const { model, scene } = window.qa;
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          scene.sync();
          scene.cameras.main.useBounds = false;
          scene.cameras.main.setZoom(framing.zoom).setScroll(framing.x, framing.y);
          scene.drawOverlay(0);
        },
        { at, framing },
      );
    const duration = await page.evaluate(() => window.qa.model.replay.duration);
    await seek(duration);
    const scout = duration - (await read()).at;
    for (const snapshot of [contact, before, after, contact]) {
      await seek(scout + snapshot.at);
      expect(await read()).toEqual(snapshot);
    }
    await shot('replay-contact');
    expect(errors).toEqual([]);
    console.log({
      label,
      before: before.unit.target,
      after: after.unit.target,
      revealAt: after.revealedAt,
      contact: contact.structures,
    });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
