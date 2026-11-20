// Touch-play the Rocket Balloon eligibility and deployment flow.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const townHall = Number(process.argv[3] ?? 11);
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/rocket-balloon-eligibility';
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
      makeBuilding(1, 'townhall', 34, 31, townHall),
      makeBuilding(2, 'tesla', 25, 20, 8),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 12),
      makeBuilding(6, 'herohall', 34, 39, 8),
      makeBuilding(7, 'darkspellfactory', 30, 36, 7),
    ],
    army: { ...emptyArmy(), giant: 1 },
    spells: emptySpells(),
    dark: 100000,
    troopLevels: { ...Object.fromEntries(Object.keys(emptyArmy()).map((kind) => [kind, 1])), balloon: 8 },
    superBoosts: {},
    heroLineup: [],
  });
  model.addMagicItem('super-potion', 1);
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
    const shot = (name) => page.screenshot({ path: `${screenshots}/${label}-th${townHall}-${name}.png`, animations: 'disabled' });
    const fieldTap = async (x, y) => {
      const point = await page.evaluate(({ x, y }) => {
        const { scene } = window.qa;
        const point = scene.screenFor(x, y);
        if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
          throw Error(`Field point is occluded at ${JSON.stringify(point)}`);
        return { x: point.x, y: point.y };
      }, { x, y });
      await page.touchscreen.tap(point.x, point.y);
    };
    const read = () =>
      page.evaluate(() => {
        const { battle, replay } = window.qa.model;
        const { state } = window.qa.model;
        const unit = battle?.units.find((u) => u.kind === 'rocketballoon');
        return {
          dark: state.dark,
          boost: state.superBoosts?.rocketballoon,
          prepared: state.army.rocketballoon,
          unit: unit && { id: unit.id, level: unit.level },
          replay: replay && { time: replay.time, paused: replay.paused },
        };
      });
    // Match the simulation ticks while issuing every gameplay command via Chromium touch.
    const steps = (count) => page.evaluate((count) => {
      const { model, scene } = window.qa;
      for (let i = 0; i < count; i++) model.step(0.05);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    }, count);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    const openArmy = async () => {
      await page.locator('.train-add').tap();
      await page.locator('#army-search').fill('Rocket Balloon');
    };
    await openArmy();
    const boost = page.locator('[data-action="boost-super:rocketballoon"]');
    const potion = page.locator('[data-action="super-potion:rocketballoon"]');
    const tile = page.locator('.army-tile').filter({ has: page.locator('[data-action="troop-info:rocketballoon"]') });
    await expect(tile).toContainText(`TH${baselineDist ? 11 : 12} · Balloon level 8`);
    await boost.scrollIntoViewIfNeeded();
    await shot('eligibility');
    const blocked = !baselineDist && townHall === 11;
    if (blocked) {
      await expect(boost).toBeDisabled();
      await expect(potion).toBeDisabled();
      await expect(tile.locator('[data-action="train:rocketballoon"]')).toBeDisabled();
      expect((await read()).dark).toBe(100000);
      expect((await read()).boost).toBeUndefined();
      console.log({ label, townHall, blocked, state: await read() });
    } else {
      await boost.tap();
      await expect(tile.locator('.boost-left')).toContainText('Boosted');
      await tile.locator('[data-action="train:rocketballoon"]').tap();
      const prepared = await read();
      expect(prepared.dark).toBe(75000);
      expect(prepared.prepared).toBe(1);
      expect(prepared.boost).toBeGreaterThan(Date.now());
      await shot('prepared');
      await page.waitForFunction(() => {
        const saved = JSON.parse(localStorage.getItem('crown-clan-save-v1') ?? '{}');
        return saved.army?.rocketballoon === 1;
      });
      await page.reload();
      await page.waitForFunction(() => window.qa?.scene.ready);
      expect(await read()).toEqual(prepared);
      await page.locator('.attack-btn').tap();
      await tap('practice');
      await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
      await page.waitForFunction(() => !window.qa.scene.battleArtPending());
      await page.evaluate(() => { window.qa.scene.paused = true; });
      await tap('troop:rocketballoon');
      await fieldTap(17.5, 21.5);
      await steps(30);
      const live = await read();
      expect(live.unit).toBeDefined();
      await shot('deployed');

      await tap('surrender');
      await tap('end');
      await expect(page.locator('.result-modal')).toBeVisible();
      await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
      const pause = page.locator('[data-action="replay-pause"]');
      if ((await pause.getAttribute('aria-label')) === 'Pause' && await pause.isEnabled())
        await pause.tap();
      await tap('replay-jump:-10');
      await steps(3);
      expect((await read()).unit).toBeUndefined();
      await tap('replay-jump:10');
      await steps(90);
      await expect(page.locator('.replay-status')).toContainText('Replay complete');
      const replay = await read();
      expect(replay.unit).toEqual(live.unit);
      await shot('replay');
      console.log(JSON.stringify({ label, townHall, prepared, live, replay }));
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
