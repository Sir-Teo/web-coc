// Play Payback while a Gold Mine upgrade completes, then reload and replay.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const rotate = process.argv.includes('--rotate');
const baselineDist = process.argv.slice(2).find((argument) => argument !== '--rotate');
const townHall = 3;
const label = baselineDist ? 'baseline' : 'current';
const screenshots = 'output/rea-cloud-playtest/upgrade-during-payback';
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
      makeBuilding(1, 'townhall', 22, 21, townHall),
      makeBuilding(2, 'goldmine', 16, 20),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'goldmine', 12, 14),
      makeBuilding(6, 'builder', 26, 31, 1),
      makeBuilding(7, 'camp', 12, 29, 3),
      makeBuilding(8, 'barracks', 12, 24, 2),
    ],
    army: { ...emptyArmy(), swordsman: rotate ? 15 : 30, archer: rotate ? 15 : 0 },
    spells: emptySpells(),
    gold: 800,
    elixir: 800,
    heroLineup: [],
  });
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
    await page.clock.setFixedTime(Date.now());
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((fixture) => {
      if (location.protocol === 'http:' && !localStorage.getItem('crown-clan-save-v1'))
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
      page.screenshot({
        path: `${screenshots}/${label}-th${townHall}${rotate ? '-rotate' : ''}-${name}.png`,
        animations: 'disabled',
      });
    const fieldTap = async (x, y) => {
      const point = await page.evaluate(
        ({ x, y }) => {
          const { scene } = window.qa;
          const point = scene.screenFor(x, y);
          if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
            throw Error(`Field point is occluded at ${JSON.stringify(point)}`);
          return { x: point.x, y: point.y };
        },
        { x, y },
      );
      await page.touchscreen.tap(point.x, point.y);
    };

    const ready = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };

    const resize = async (width, height) => {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(
        ({ width, height }) => {
          const canvas = window.qa.scene.game.canvas.getBoundingClientRect();
          return canvas.width === width && canvas.height === height;
        },
        { width, height },
      );
    };
    const read = () =>
      page.evaluate(() => {
        const { model } = window.qa;
        const { state, busy } = model;
        const mine = state.buildings.find((b) => b.id === 2);
        return {
          level: mine.level,
          end: mine.upgradeEnd,
          xp: state.xp,
          busy,
          gold: state.gold,
          elixir: state.elixir,
          trophies: state.trophies,
          swordsmen: state.army.swordsman,
          archers: state.army.archer,
          raids: state.stats.raids,
          progress: state.nativeCampaign,
          records: (state.raidLog ?? []).map(({ result, deployed, replay }) => ({
            result,
            deployed,
            hasReplay: !!replay,
          })),
        };
      });
    await ready();
    await page.clock.setFixedTime(Date.now());
    await fieldTap(17.5, 21.5);
    const before = await read();
    await tap('upgrade:2');
    const booked = await read();
    expect(booked).toMatchObject({ level: 1, busy: 1, elixir: before.elixir - 300 });
    expect(booked.end).toBeGreaterThan(Date.now());
    await shot('booked');

    await page.locator('.attack-btn').tap();
    await tap('attack:0');
    await expect(page.locator('.battle-enemy h2')).toHaveText('Payback');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await tap('troop:swordsman');
    const drop = await page.evaluate(() => {
      const { model, scene } = window.qa;
      const hall = model.battle.buildings.find((b) => b.kind === 'townhall');
      scene.cameras.main.centerOn(896 + (hall.x - hall.y) * 32, 112 + (hall.x + hall.y + 3) * 16);
      scene.cameras.main.preRender();
      const point = scene.screenFor(32, 26);
      if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
        throw Error('The deployment point is occluded');
      return { x: point.x, y: point.y };
    });
    expect(drop).toBeTruthy();
    await page.touchscreen.tap(drop.x, drop.y);
    await expect
      .poll(() => page.evaluate(() => window.qa.model.battle.remaining.swordsman))
      .toBe(before.swordsmen - 1);
    expect(await read()).toMatchObject({ level: 1, busy: 1, end: booked.end });
    await page.clock.setFixedTime(booked.end + 1);
    await expect.poll(async () => (await read()).level).toBe(2);
    const completed = await read();
    expect(completed).toMatchObject({ busy: 0, elixir: booked.elixir });
    expect(completed.end).toBeUndefined();
    expect(completed.xp).toBe(booked.xp + 3);
    await expect
      .poll(() => page.evaluate(() => window.qa.model.battle.lootTaken.gold), { timeout: 15000 })
      .toBeGreaterThan(0);
    await shot('live');

    if (rotate) {
      await resize(568, 320);
      const remaining = () =>
        page.evaluate(() => {
          const { swordsman, archer } = window.qa.model.battle.remaining;
          return { swordsman, archer };
        });
      expect(await remaining()).toEqual({ swordsman: 14, archer: 15 });
      await tap('troop:archer');
      await expect(page.locator('.deploy-label')).toContainText('Archer');
      const point = await page.evaluate(() => {
        const { model, scene } = window.qa;
        for (const y of [130, 100, 160, 80, 180])
          for (const x of [284, 210, 360, 140, 428]) {
            if (document.elementFromPoint(x, y) !== scene.game.canvas) continue;
            const tile = scene.gridAtScreen(x, y);
            if (!model.deployBlocked(tile.x, tile.y)) return { x, y };
          }
      });
      expect(point).toBeTruthy();
      await page.touchscreen.tap(point.x, point.y);
      await expect.poll(remaining).toEqual({ swordsman: 14, archer: 14 });
      await shot('landscape-live');
    }

    await tap('surrender');
    await tap('end');
    const result = await page.evaluate(() => window.qa.model.battle.result);
    expect(result.gold).toBeGreaterThan(0);
    if (rotate) {
      await shot('landscape-result');
      const cdp = await page.context().newCDPSession(page);
      const swipe = (type, y) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: y === undefined ? [] : [{ x: 284, y }],
        });
      await swipe('touchStart', 266);
      for (let y = 246; y >= 86; y -= 20) await swipe('touchMove', y);
      await swipe('touchEnd');
      const modal = page.locator('.result-modal');
      await expect.poll(() => modal.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      await resize(320, 568);
    }
    await page.locator('.result-modal [data-action="home"]').tap();
    const settled = await read();
    expect(settled).toMatchObject({
      busy: 0,
      level: 2,
      swordsmen: before.swordsmen - 1,
      archers: before.archers - (rotate ? 1 : 0),
      raids: before.raids + 1,
      trophies: before.trophies,
      elixir: booked.elixir + result.elixir,
      gold: before.gold + result.gold,
      records: [{ result, deployed: { swordsman: 1, archer: rotate ? 1 : 0 }, hasReplay: true }],
    });
    expect(settled.progress.remaining[0]).toMatchObject({
      gold: 500 - result.gold,
      elixir: 500 - result.elixir,
    });
    await page.reload();
    await ready();
    expect(await read()).toEqual(settled);
    await tap('battle-log');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    if (rotate) {
      await resize(568, 320);
      const pause = page.getByRole('button', { name: 'Pause', exact: true });
      if (await pause.isVisible()) await pause.tap();
      const slider = page.getByRole('slider', { name: 'Replay position' });
      await slider.tap({ trial: true });
      const box = await slider.boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { time, duration, seeking } = window.qa.model.replay;
            return !seeking && time > duration * 0.3 && time < duration * 0.7;
          }),
        )
        .toBe(true);
    }
    await tap('replay-skip');
    if (rotate) await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    expect(await page.evaluate(() => window.qa.model.battle.result)).toEqual(result);
    await shot('replay');
    if (rotate) {
      await page.getByRole('button', { name: 'Back to log' }).tap();
      await expect(page.getByRole('button', { name: 'Watch replay', exact: true })).toHaveCount(1);
    }
    await page.reload();
    await ready();
    expect(await read()).toEqual(settled);
    expect(errors).toEqual([]);
    console.log({ cost: before.elixir - booked.elixir, xp: completed.xp - booked.xp, result });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
