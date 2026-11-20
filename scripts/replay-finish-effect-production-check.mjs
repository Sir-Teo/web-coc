import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv[2];
const artifacts = 'output/rea-cloud-playtest/replay-finish-effect';
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
      makeBuilding(1, 'townhall', 22, 21, 5),
      makeBuilding(2, 'camp', 13, 14, 3),
      makeBuilding(3, 'camp', 13, 24, 3),
      makeBuilding(4, 'barracks', 16, 20, 2),
      makeBuilding(5, 'builder', 32, 29),
      makeBuilding(6, 'goldstorage', 25, 15, 2),
      makeBuilding(7, 'elixirstorage', 28, 21, 4),
      makeBuilding(8, 'spellfactory', 28, 14, 1),
      makeBuilding(9, 'cannon', 19, 21, 1),
    ],
    army: { ...emptyArmy(), archer: 70 },
    spells: { ...emptySpells(), lightning: 1 },
    gold: 1000,
  });
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

    await tap('spell:lightning');
    // Leave enough recorded scouting time for the replay to be paused before the cast.
    await page.waitForFunction(() => window.qa.model.recording.steps.length >= 80);
    const target = await page.evaluate(() => {
      const { scene, model } = window.qa;
      const cannon = model.battle.buildings.find((b) => b.kind === 'cannon');
      const p = scene.screenFor(cannon.x + 1, cannon.y + 1);
      if (document.elementFromPoint(p.x, p.y) !== scene.game.canvas)
        throw Error('The spell target is offscreen');
      return p;
    });
    const cannonHp = () =>
      page.evaluate(() => window.qa.model.battle.buildings.find((b) => b.kind === 'cannon').hp);
    const health = await cannonHp();
    await page.touchscreen.tap(target.x, target.y);
    await expect.poll(cannonHp).toBeLessThan(health);
    await shot('live-impact');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    const endState = () =>
      page.evaluate(() => {
        const { model, scene } = window.qa;
        return {
          complete: model.replay?.complete,
          finished: model.battle.finished,
          grace: scene.frameKey.grace,
          currentFrame:
            scene.frameKey.battle === model.battle &&
            scene.frameKey.finished === model.battle.finished,
          outcome: model.battle.result,
          hp: model.battle.buildings.map((b) => b.hp),
        };
      });
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
    await expect.poll(endState, { timeout: 20_000 }).toMatchObject({
      complete: true,
      finished: true,
      currentFrame: true,
      grace: true,
    });
    const natural = await endState();
    await shot('replay-natural-finish');
    await tap('replay-restart');
    await page.getByRole('button', { name: 'Pause', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.waitForFunction(() => {
      const { model, scene } = window.qa;
      return (
        model.replay.paused && !model.battle.finished && scene.frameKey.battle === model.battle
      );
    });
    const slider = page.getByRole('slider', { name: 'Replay position' });
    const box = await slider.boundingBox();
    await page.touchscreen.tap(box.x + box.width - 2, box.y + box.height / 2);
    await expect.poll(endState).toMatchObject({
      complete: true,
      finished: true,
      currentFrame: true,
      grace: !!baseline,
      outcome: natural.outcome,
      hp: natural.hp,
    });
    await shot('replay-seek-finish');
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({ baseline: !!baseline, naturalGrace: natural.grace, seek: await endState() }),
    );
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
