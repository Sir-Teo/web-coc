import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv[2];
const artifacts = 'output/rea-cloud-playtest/archer-first-pose';
await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { GameModel, initialSave, makeBuilding } =
    await modules.ssrLoadModule('/src/game/model.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const fixture = initialSave();
  Object.assign(fixture, {
    tutorial: true,
    trophies: 0,
    obstacles: [],
    buildings: [
      makeBuilding(1, 'townhall', 33, 33, 5),
      makeBuilding(2, 'goldstorage', 18, 18, 2),
      makeBuilding(3, 'camp', 36, 22, 3),
      makeBuilding(4, 'barracks', 28, 28, 2),
      makeBuilding(5, 'builder', 37, 33),
    ],
    army: { ...emptyArmy(), archer: 1 },
    spells: emptySpells(),
    gold: 1000,
  });
  fixture.settings.sound = false;
  fixture.settings.music = false;
  expect(new GameModel(fixture).capacity).toBe(35);
  expect(validateSave(fixture)).toBe(true);
  save = JSON.stringify(fixture);
} finally {
  await modules.close();
}
const server = await preview({
  ...(baseline ? { build: { outDir: baseline } } : {}),
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
    await page.addInitScript((save) => {
      if (!localStorage.getItem('crown-clan-save-v1'))
        localStorage.setItem('crown-clan-save-v1', save);
    }, save);
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
    await page.waitForFunction(() => window.qa?.scene.ready);
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = (name) =>
      page.screenshot({
        animations: 'disabled',
        path: `${artifacts}/${baseline ? 'baseline' : 'patched'}-${name}.png`,
      });

    await page.locator('.attack-btn').tap();

    await tap('practice');
    await page.waitForFunction(
      () =>
        !window.qa.scene.battleArtPending() &&
        window.qa.scene.troopNativePresentation.levelsReady.get('archer')?.has(1),
    );
    await tap('troop:archer');
    const point = await page.evaluate(() => {
      const { scene, model } = window.qa;
      scene.paused = true;
      const point = scene.screenFor(22.5, 13);
      if (
        model.deployBlocked(22.5, 13) ||
        document.elementFromPoint(point.x, point.y) !== scene.game.canvas
      )
        throw Error(`Archer deployment is occluded at ${JSON.stringify(point)}`);
      return point;
    });
    await page.touchscreen.tap(point.x, point.y);
    const pose = () =>
      page.evaluate(() => {
        const { model, scene } = window.qa;
        const u = model.battle.units.find((u) => u.kind === 'archer');
        const view = scene.troopNativePresentation.views.get(u?.id);
        const waypoint = u?.path[0];
        return {
          state: view?.state,
          mirror: view?.sample?.mirror,
          frame: view?.sample?.frame,
          take: view?.sample?.name,
          x: view?.x,
          y: view?.y,
          at: model.battle.elapsed,
          heading: waypoint && waypoint.x - u.x - (waypoint.y - u.y),
        };
      });
    await page.evaluate(() => window.qa.scene.drawOverlay(0));
    expect((await pose()).state).toBe('idle');
    await shot('idle');
    await page.evaluate(() => {
      const { model, scene } = window.qa;
      model.step(0.05);
      // Enter the renderer with no prior position sample, as after a rewind or first visibility.
      scene.troopNativePresentation.clear();
      scene.drawOverlay(0);
    });
    const walk = await pose();
    expect(walk.heading).toBeLessThan(0);
    expect(walk).toMatchObject({ state: 'walk', mirror: baseline ? 1 : -1 });
    await shot('first-walk');
    await page.evaluate(() => {
      const { model, scene } = window.qa;
      const archer = model.battle.units.find((u) => u.kind === 'archer');
      for (let i = 0; i < 240 && !archer.attacking; i++) model.step(0.05);
      scene.drawOverlay(0);
      if (!archer.attacking) throw Error('Archer did not reach its attack phase');
    });
    expect((await pose()).state).toBe('attack');
    await shot('attack');
    await page.evaluate(() => {
      window.qa.scene.paused = false;
    });
    await expect
      .poll(() => page.evaluate(() => window.qa.model.battle.buildings.find((b) => b.id === 2).hp))
      .toBeLessThan(
        await page.evaluate(() => window.qa.model.battle.buildings.find((b) => b.id === 2).maxHp),
      );
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await page.getByRole('button', { name: 'Pause', exact: true }).tap();
    await page.evaluate(() => {
      const { model, scene } = window.qa;
      model.seekReplay(model.replay.duration);
      while (model.replay.seeking) model.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
    });
    // Use the tick recorded for the live screenshot rather than interpolating a slider pixel.
    await page.evaluate((at) => {
      const { model, scene } = window.qa;
      const scout = model.replay.time - model.battle.elapsed;
      model.seekReplay(scout + at);
      while (model.replay.seeking) model.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
    }, walk.at);
    const replay = await pose();
    expect(replay).toMatchObject({
      state: walk.state,
      mirror: walk.mirror,
      take: walk.take,
      frame: walk.frame,
    });
    expect(replay.x).toBeCloseTo(walk.x, 6);
    expect(replay.y).toBeCloseTo(walk.y, 6);
    await shot('replay-first-walk');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ baseline: !!baseline, walk, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
