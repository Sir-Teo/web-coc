import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv[2];
const artifacts = 'output/rea-cloud-playtest/rocket-boost';
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
  const fixture = new GameModel(initialSave());
  Object.assign(fixture.state, {
    tutorial: true,
    obstacles: [],
    dark: 100000,
    nextId: 100,
    buildings: [
      makeBuilding(1, 'townhall', 33, 33, 12),
      makeBuilding(2, 'goldstorage', 18, 18, 12),
      makeBuilding(3, 'cannon', 40, 34, 13),
      makeBuilding(4, 'camp', 29, 29, 5),
      makeBuilding(5, 'barracks', 28, 24, 8),
      makeBuilding(6, 'builder', 37, 33),
      makeBuilding(7, 'laboratory', 33, 24, 10),
    ],
    army: emptyArmy(),
    spells: emptySpells(),
  });
  fixture.state.troopLevels = {
    ...Object.fromEntries(Object.keys(emptyArmy()).map((kind) => [kind, 1])),
    balloon: 8,
  };
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.boostSuperTroop('rocketballoon');
  fixture.train('rocketballoon');
  expect(fixture.state.army.rocketballoon).toBe(1);
  expect(validateSave(fixture.state)).toBe(true);
  save = JSON.stringify(fixture.state);
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
        window.qa.scene.troopNativePresentation.levelsReady.get('rocketballoon')?.size > 0,
    );
    await tap('troop:rocketballoon');
    const point = await page.evaluate(() => {
      const { scene, model } = window.qa;
      scene.paused = true;
      const camera = scene.cameras.main;
      const project = (x, y) => {
        const point = scene.screenFor(x, y);
        const p = scene.canvasPoint(point.x, point.y);
        return camera.getWorldPoint(p.x, p.y);
      };
      const from = project(13, 13);
      const to = project(40, 34);
      camera.useBounds = false;
      camera.setZoom(0.5).centerOn((from.x + to.x) / 2, (from.y + to.y) / 2);
      const point = scene.screenFor(13, 13);
      if (
        model.deployBlocked(13, 13) ||
        document.elementFromPoint(point.x, point.y) !== scene.game.canvas
      )
        throw Error(`Rocket Balloon placement is unavailable at ${JSON.stringify(point)}`);
      return point;
    });
    await page.touchscreen.tap(point.x, point.y);
    const read = () =>
      page.evaluate(() => {
        const { model, scene } = window.qa;
        const b = model.battle;
        scene.drawOverlay(0);
        const unit = b.units.find((u) => u.kind === 'rocketballoon');
        const boost = unit.native.effects?.boost;
        const view = scene.troopNativePresentation.views.get(unit.id);
        return {
          at: b.elapsed,
          until: boost?.until ?? 0,
          boosted: (boost?.until ?? 0) > b.elapsed + 1e-9,
          speed: boost?.speed ?? 0,
          target: unit.target,
          x: unit.x,
          y: unit.y,
          cannonHp: b.buildings.find((b) => b.id === 3).hp,
          reserve: b.remaining.rocketballoon,
          visibleBody: view?.view.objects.some((o) => o.visible) ?? false,
        };
      });
    const step = (count) =>
      page.evaluate((count) => {
        for (let i = 0; i < count; i++) window.qa.model.step(0.05);
      }, count);
    const deployed = await read();
    expect(deployed).toMatchObject({
      at: 0,
      boosted: !baseline,
      until: baseline ? 0 : 4,
      reserve: 0,
    });
    await shot('deployment');
    await step(78);
    const before = await read();
    await step(1);
    const boosted = await read();
    expect(boosted.at).toBeCloseTo(3.95, 8);
    expect(boosted).toMatchObject({ boosted: true, target: 3, cannonHp: deployed.cannonHp });
    await shot('before-expiry');
    await step(1);
    const boundary = await read();
    expect(boundary.at).toBeCloseTo(4, 8);
    expect(boundary).toMatchObject({ boosted: !!baseline, target: 3 });
    const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const fast = distance(before, boosted);
    const atExpiry = distance(boosted, boundary);
    await shot('expiry');
    const camera = await page.evaluate(() => {
      const { scrollX, scrollY, zoomX, zoomY } = window.qa.scene.cameras.main;
      return { scrollX, scrollY, zoomX, zoomY };
    });
    await step(2);
    const after = await read();
    expect(after.boosted).toBe(false);
    expect(atExpiry).toBeCloseTo(baseline ? fast : distance(boundary, after) / 2, 6);
    expect(fast).toBeGreaterThan(distance(boundary, after) / 2);
    await page.evaluate(() => {
      const b = window.qa.model.battle;
      const target = b.buildings.find((v) => v.id === 3);
      for (let i = 0; i < 600 && target.hp === target.maxHp && !b.finished; i++)
        window.qa.model.step(0.05);
    });
    expect((await read()).cannonHp).toBeLessThan(deployed.cannonHp);
    await shot('attack');
    await page.evaluate(() => {
      window.qa.scene.paused = false;
    });
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await page.evaluate(
      ({ at, camera }) => {
        const { model, scene } = window.qa;
        scene.paused = true;
        model.seekReplay(model.replay.duration);
        while (model.replay.seeking) model.step(0.05);
        const scout = model.replay.time - model.battle.elapsed;
        model.seekReplay(scout + at);
        while (model.replay.seeking) model.step(0.05);
        scene.sync();
        scene.cameras.main.useBounds = false;
        scene.cameras.main.setZoom(camera.zoomX, camera.zoomY);
        scene.cameras.main.setScroll(camera.scrollX, camera.scrollY);
      },
      { at: boundary.at, camera },
    );
    const replay = await read();
    expect(boundary.visibleBody).toBe(true);
    expect(replay).toEqual(boundary);
    await shot('replay-expiry');
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({ baseline: !!baseline, deployed, boosted, boundary, replay, fast, atExpiry }),
    );
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
