// Exercise Blimp delivery in a disposable local Practice battle and its recording.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv[2];
const artifacts = 'output/rea-cloud-playtest/blimp-objective';

await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
let save, pinned;
try {
  const { GameModel, initialSave, makeBuilding } =
    await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { siegeCargoCapacity } = await modules.ssrLoadModule('/src/game/siege-cargo.ts');
  pinned = siegeCargoCapacity(1);
  expect(pinned).toBe(10);
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = new GameModel(initialSave());
  fixture.state.buildings = [
    makeBuilding(1, 'townhall', 24, 18, 12),
    makeBuilding(2, 'cannon', 18, 18, 1),
    makeBuilding(3, 'airdefense', 27, 23, 1),
    makeBuilding(4, 'workshop', 29, 28, 2),
    makeBuilding(5, 'builder', 37, 33, 1),
    makeBuilding(6, 'clancastle', 24, 32, 1),
    makeBuilding(7, 'camp', 28, 34, 1),
    makeBuilding(8, 'barracks', 36, 28, 6),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.army = emptyArmy();
  fixture.state.spells = emptySpells();
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.train('battleblimp');
  expect(fixture.state.army.battleblimp).toBe(1);
  expect(validateSave(fixture.state)).toBe(true);
  save = JSON.stringify(fixture.state);
} finally {
  await modules.close();
}

const server = await preview({
  ...(baseline && { build: { outDir: baseline } }),
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
    // The loopback QA hook reads state. The loadout and combat use only player controls.
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.waitForFunction(() => window.qa?.scene.ready);
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const tapField = async (x, y, deploy = false) => {
      const point = await page.evaluate(
        ({ x, y, deploy }) => {
          const { scene, model } = window.qa;
          const screen = scene.screenFor(x, y);
          if (deploy && model.deployBlocked(x, y))
            throw Error('Fixture deployment point is blocked');
          if (document.elementFromPoint(screen.x, screen.y) !== scene.game.canvas)
            throw Error(`Field point occluded at ${JSON.stringify(screen)}`);
          return { x: screen.x, y: screen.y };
        },
        { x, y, deploy },
      );
      await page.touchscreen.tap(point.x, point.y);
    };
    const read = () =>
      page.evaluate(() => {
        const { battle, replay, state } = window.qa.model;
        return {
          at: battle?.elapsed,
          finished: battle?.finished,
          units: battle?.units.map(({ id, hp, kind, level, x, y, target }) => ({
            id,
            hp,
            kind,
            level,
            x,
            y,
            target,
          })),
          army: state.army,
          spells: state.spells,
          replay,
          cargo: battle?.siegeCargo,
          cannonHp: battle?.buildings.find(({ id }) => id === 2)?.hp,
          trophies: state.trophies,
          actions: state.raidLog?.[0]?.replay?.actions,
        };
      });
    const shot = (name) =>
      page.screenshot({ path: `${artifacts}/${baseline ? 'baseline' : 'patched'}-${name}.png` });
    const village = await read();
    await page.locator('.attack-btn').tap();
    await tap('practice-cargo');
    await tap('practice-cargo-add:balloon');
    await tap('practice-cargo-add:archer');
    await expect(page.locator('.practice-cargo-capacity')).toHaveText('6 / 10 troop housing');
    await shot('loadout');
    await tap('practice-cargo-start');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    const cameraPose = await page.evaluate(() => {
      const { scene } = window.qa;
      scene.paused = true;
      const camera = scene.cameras.main;
      const point = scene.screenFor(21, 22);
      const canvas = scene.canvasPoint(point.x, point.y);
      const anchor = camera.getWorldPoint(canvas.x, canvas.y);
      camera.useBounds = false;
      camera.setZoom(0.72).centerOn(anchor.x, anchor.y);
      return { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom };
    });
    const step = (ticks) =>
      page.evaluate((ticks) => {
        const { model, scene } = window.qa;
        for (let i = 0; i < ticks; i++) model.step(0.05);
        scene.sync();
        scene.drawOverlay(0);
      }, ticks);
    await tap('troop:battleblimp');
    await tapField(13.5, 18.5, true);
    await step(60);
    const flight = await read();
    expect(flight.units).toHaveLength(1);
    expect(flight.units[0]).toMatchObject({ kind: 'battleblimp', target: 1 });
    expect(flight.units[0].hp).toBeGreaterThan(0);
    await shot('flight');
    await step(45);
    const objective = await read();
    expect(objective.cannonHp).toBeLessThan(300);
    if (baseline) {
      expect(objective.units).toHaveLength(1);
      expect(objective.units[0].x).toBeLessThan(24);
      expect(objective.units[0].hp).toBeGreaterThan(0);
      expect(objective.cargo.released).toBeUndefined();
      await shot('stalled');
      await page.getByRole('button', { name: 'End Battle Blimp', exact: true }).tap();
      await step(5);
    } else {
      expect(objective.units[0].x).toBeCloseTo(24);
      expect(objective.cargo.released).toBe(true);
    }
    const released = await read();
    expect(released.units[0].hp).toBe(0);
    expect(released.units.slice(1).map(({ kind }) => kind)).toEqual(['archer', 'balloon']);
    expect(released.cargo.released).toBe(true);
    await shot('released');
    await step(12);
    const settled = await read();
    expect(settled.units).toHaveLength(3);
    await shot('cargo-in-action');
    if (!settled.finished) {
      await step(1);
      if (!(await read()).finished) {
        await tap('surrender');
        await tap('end');
      }
    }
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const seek = (at) =>
      page.evaluate(
        ({ at, cameraPose }) => {
          const { model, scene } = window.qa;
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          scene.sync();
          const camera = scene.cameras.main;
          camera.useBounds = false;
          camera.setZoom(cameraPose.zoom).setScroll(cameraPose.x, cameraPose.y);
          scene.drawOverlay(0);
        },
        { at, cameraPose },
      );
    const duration = (await read()).replay.duration;
    await seek(duration);
    const complete = await read();
    expect(complete.actions.filter(({ type }) => type === 'siege-end')).toHaveLength(
      baseline ? 1 : 0,
    );
    const scout = duration - complete.at;
    for (const checkpoint of [released, flight, released]) {
      await seek(scout + checkpoint.at);
      const playback = await read();
      expect(playback.units).toEqual(checkpoint.units);
      expect(playback.cargo).toEqual(checkpoint.cargo);
    }
    await seek(scout + settled.at);
    expect((await read()).units).toEqual(settled.units);
    await shot('replay-released');
    await seek(duration);
    expect((await read()).units).toEqual(complete.units);
    expect(complete.army).toEqual(village.army);
    expect(complete.spells).toEqual(village.spells);
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        baseline: !!baseline,
        objective: objective.units[0],
        cargo: released.units.slice(1),
      }),
    );
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
