// Prepare troops, advance the boost clock, then touch-play the same Campaign battle.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/eagle-hero-housing';
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
  const { freshNativeCampaign } = await modules.ssrLoadModule('/src/game/native-campaign.ts');
  const campaign = freshNativeCampaign();
  campaign.stars.fill(1);
  Object.assign(model.state, {
    tutorial: true,
    obstacles: [],
    nextId: 100,
    buildings: [
      makeBuilding(1, 'townhall', 23, 20, 12),
      makeBuilding(2, 'herohall', 34, 20, 6),
      makeBuilding(3, 'darkbarracks', 35, 26, 7),
      makeBuilding(4, 'barracks', 40, 25, 10),
      makeBuilding(5, 'builder', 32, 33, 1),
      makeBuilding(6, 'camp', 36, 34, 9),
      makeBuilding(7, 'camp', 28, 37, 9),
      makeBuilding(8, 'camp', 20, 37, 9),
    ],
    army: emptyArmy(),
    spells: emptySpells(),
    nativeCampaign: campaign,
    king: { level: 20 },
    heroes: { queen: { level: 20 } },
    heroLineup: ['king', 'queen'],
  });
  const { TROOP_KEYS } = await modules.ssrLoadModule('/src/game/data.ts');
  model.state.troopLevels = Object.fromEntries(TROOP_KEYS.map((kind) => [kind, kind === 'bowler' ? 4 : 1]));
  model.state.settings.sound = false;
  model.state.settings.music = false;
  model.addMagicItem('super-potion', 1);
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
    const shot = (name) => page.screenshot({ path: `${screenshots}/${label}-${name}.png` });
    await page.locator('.train-add').tap();
    await page.locator('#army-search').fill('Super Bowler');
    await tap('super-potion:superbowler');
    await expect(page.locator('.army-tile .boost-left')).toContainText('Boosted');
    await tap('train-five:superbowler');
    const ready = page.locator('[data-army-count="troop:superbowler"]');
    await expect(ready).toHaveText('5');
    await expect(page.getByRole('button', { name: /Show troops, 150 of/ })).toBeVisible();
    const end = await page.evaluate(() => window.qa.model.state.superBoosts.superbowler);
    await page.clock.setFixedTime(end + 1);
    await expect(page.locator('[data-action="train:superbowler"]')).toBeDisabled();
    await expect(ready).toHaveText('5');
    await shot('boost-expired');

    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('attack:63');
    await expect(page.locator('.battle-enemy h2')).toHaveText('Bowling Alley');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending(), undefined, { timeout: 30000 });
    const point = await page.evaluate(() => {
      const { model, scene } = window.qa;
      const eagles = model.battle.buildings.filter(({ kind }) => kind === 'eagleartillery');
      let best;
      for (let x = 8; x < 41; x += 0.5)
        for (let y = 8; y < 41; y += 0.5) {
          const p = scene.screenFor(x, y);
          if (p.y < 210 || p.y > 420 || document.elementFromPoint(p.x, p.y) !== scene.game.canvas)
            continue;
          const grid = scene.gridAtScreen(Math.round(p.x), Math.round(p.y));
          if (model.deployBlocked(grid.x, grid.y)) continue;
          const distance = Math.min(...eagles.map((e) => Math.hypot(grid.x - e.x - 2, grid.y - e.y - 2)));
          if (distance > 10 && (!best || distance > best.distance)) best = { x: p.x, y: p.y, distance };
        }
      return best;
    });
    expect(point).toBeDefined();
    const deploy = () => page.touchscreen.tap(point.x, point.y);
    const read = () =>
      page.evaluate(() => {
        const { battle, replay } = window.qa.model;
        const eagle = battle.late?.eagleArtillery;
        return {
          at: battle.elapsed,
          bowlers: battle.carriedArmy.superbowler - battle.remaining.superbowler,
          heroes: (battle.nativeHeroes ?? []).filter(({ deployed }) => deployed).map(({ kind }) => kind),
          count: eagle?.deployed,
          towers: Object.values(eagle?.towers ?? {}).map(({ awakeAt, fired }) => ({ awakeAt, fired })),
          replay: replay && { time: replay.time, complete: replay.complete },
        };
      });

    await tap('troop:superbowler');
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: point.y }],
    });
    try {
      await expect.poll(async () => (await read()).bowlers, { timeout: 10000 }).toBe(5);
    } finally {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    }
    await expect.poll(async () => (await read()).count).toBe(150);
    await tap('hero-select:king');
    await deploy();
    await expect.poll(async () => (await read()).heroes).toEqual(['king']);
    await expect.poll(async () => (await read()).count).toBe(baselineDist ? 150 : 175);
    const oneHero = await read();
    expect(oneHero.towers.every(({ awakeAt }) => awakeAt === undefined)).toBe(true);
    await shot('one-hero');

    await tap('hero-select:queen');
    await deploy();
    await expect.poll(async () => (await read()).heroes).toEqual(['king', 'queen']);
    const secondDeploymentAt = (await read()).at;
    await expect.poll(async () => (await read()).at, { timeout: 12000 }).toBeGreaterThan(secondDeploymentAt + 4.5);
    const after = await read();
    expect(after.count).toBe(baselineDist ? 150 : 200);
    expect(after.towers.some(({ awakeAt }) => awakeAt !== undefined)).toBe(!baselineDist);
    expect(after.towers.some(({ fired }) => fired > 0)).toBe(!baselineDist);
    await shot('two-heroes');

    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    const finished = await read();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await tap('replay-pause');
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await slider.press('Home');
    await expect.poll(async () => (await read()).replay?.time).toBe(0);
    expect((await read()).heroes).toEqual([]);
    await slider.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await read();
    expect(replay.heroes).toEqual(finished.heroes);
    expect(replay.count).toBe(finished.count);
    expect(replay.towers).toEqual(finished.towers);
    await shot('replay-end');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ label, oneHero, after, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
