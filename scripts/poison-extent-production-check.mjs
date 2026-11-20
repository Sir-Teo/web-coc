import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv[2];
const artifacts = 'output/rea-cloud-playtest/poison-extent';
await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let save, radius;
try {
  const { GameModel, initialSave, makeBuilding } =
    await modules.ssrLoadModule('/src/game/model.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { nativeRow, tiles } = await modules.ssrLoadModule('/src/game/native-data.ts');
  radius = tiles(nativeRow('spells', 'Poison', 1), 'Radius');
  const fixture = initialSave();
  Object.assign(fixture, {
    tutorial: true,
    trophies: 0,
    obstacles: [],
    buildings: [
      makeBuilding(1, 'townhall', 22, 21, 8),
      makeBuilding(2, 'camp', 13, 14, 3),
      makeBuilding(3, 'camp', 13, 24, 3),
      makeBuilding(4, 'barracks', 16, 20, 2),
      makeBuilding(5, 'builder', 32, 29),
      makeBuilding(6, 'goldstorage', 25, 15, 2),
      makeBuilding(7, 'elixirstorage', 28, 21, 4),
      makeBuilding(8, 'darkspellfactory', 28, 14, 1),
    ],
    army: { ...emptyArmy(), archer: 70 },
    spells: { ...emptySpells(), poison: 1 },
    gold: 1000,
  });
  fixture.settings.fullMotion = true;
  fixture.settings.sound = false;
  fixture.settings.music = false;
  expect(new GameModel(fixture).capacity).toBe(70);
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
    await page.route('**/assets/field-spells-native/poison/graph.json', (route) => route.abort());
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
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await tap('spell:poison');
    const point = await page.evaluate(() => {
      const { scene } = window.qa;
      scene.paused = true;
      const p = scene.screenFor(22, 18);
      if (document.elementFromPoint(p.x, p.y) !== scene.game.canvas)
        throw Error('Poison placement is obscured');
      return p;
    });
    await page.touchscreen.tap(point.x, point.y);
    const sample = async () =>
      page.evaluate(() => {
        const { model, scene } = window.qa;
        const b = model.battle;
        const cast = b.nativeSpells.find((s) => s.name === 'Poison');
        const rings = [];
        const draw = scene.overlay.strokeEllipse;
        scene.overlay.strokeEllipse = function (x, y, w, h) {
          rings.push({ x, y, w, h });
          return draw.call(this, x, y, w, h);
        };
        try {
          scene.drawOverlay(0);
        } finally {
          scene.overlay.strokeEllipse = draw;
        }
        if (!cast || rings.length !== 1) throw Error('Could not isolate the Poison range ring');
        return {
          ring: rings[0],
          cast: { x: cast.x, y: cast.y, at: cast.castAt },
          elapsed: b.elapsed,
          reserve: b.spells.poison,
          hp: b.buildings.map((v) => v.hp),
        };
      });
    const step = (count) =>
      page.evaluate((count) => {
        for (let n = 0; n < count; n++) window.qa.model.step(0.05);
      }, count);
    const live = [];
    for (const [count, label] of [
      [20, 'first'],
      [14, 'second'],
    ]) {
      await step(count);
      const frame = await sample();
      expect(frame.reserve).toBe(0);
      expect(frame.cast.x).toBeCloseTo(22, 1);
      expect(frame.cast.y).toBeCloseTo(18, 1);
      const pulse = 1 + Math.sin((frame.elapsed - frame.cast.at) / 0.22) * 0.03;
      expect(frame.ring.w).toBeCloseTo(radius * 64 * Math.SQRT2 * (baseline ? pulse : 1), 5);
      expect(frame.ring.h).toBeCloseTo(radius * 32 * Math.SQRT2 * (baseline ? pulse : 1), 5);
      live.push(frame);
      await shot(`live-${label}`);
    }
    await page.evaluate(() => {
      window.qa.scene.paused = false;
    });
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await page.evaluate((at) => {
      const { model, scene } = window.qa;
      scene.paused = true;
      model.seekReplay(model.replay.duration);
      while (model.replay.seeking) model.step(0.05);
      const scout = model.replay.time - model.battle.elapsed;
      model.seekReplay(scout + at);
      while (model.replay.seeking) model.step(0.05);
      scene.sync();
    }, live[0].elapsed);
    const replay = await sample();
    expect(replay).toEqual(live[0]);
    await shot('replay');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ baseline: !!baseline, radius, live, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
