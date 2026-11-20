import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const artifacts = 'output/rea-cloud-playtest/starter-loot';
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
    ],
    army: { ...emptyArmy(), archer: 70 },
    spells: emptySpells(),
    gold: 1000,
    starter: { counts: { TH2_Battle_LootGold: 3900 }, claimed: [0] },
  });
  fixture.settings.sound = false;
  fixture.settings.music = false;
  const model = new GameModel(fixture);
  expect(model.capacity).toBe(70);
  expect(model.starterTierIssue(1)).toBe('200 points');
  expect(validateSave(fixture)).toBe(true);
  save = JSON.stringify(fixture);
} finally {
  await modules.close();
}
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
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
      page.screenshot({ animations: 'disabled', path: `${artifacts}/${name}.png` });

    const ready = () => expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
    const read = () =>
      page.evaluate(() => {
        const { model } = window.qa;
        const battle = model.battle;
        return {
          loot: battle?.lootTaken?.gold,
          remaining: battle?.remaining.archer,
          progress: model.state.starter.counts.TH2_Battle_LootGold,
          multiplayer: model.state.starter.counts.TH5_Win_GoldTarget,
          claimed: model.state.starter.claimed,
          gold: model.state.gold,
          log: model.state.raidLog?.length ?? 0,
        };
      });
    const openPass = async () => {
      await page.locator('.left-tools [data-action="achievements"]').tap();
      await tap('starter');
    };
    const grabber = page.locator('[data-challenge="TH2_Battle_LootGold"]');
    const multiplayer = page.locator('[data-challenge="TH5_Win_GoldTarget"]');
    const tier = page.locator('.starter-track [data-tier="1"]');
    await openPass();
    await expect(grabber).toContainText('3,900 / 4,000');
    await expect(multiplayer).toContainText('Needs multiplayer raid loot');
    await expect(tier).toContainText('200 points');
    await tap('close');

    await page.locator('.attack-btn').tap();
    await tap('attack:0');
    await expect(page.locator('.battle-enemy h2')).toHaveText('Payback');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await tap('troop:archer');
    const point = await page.evaluate(() => {
      const { scene, model } = window.qa;
      const point = scene.screenFor(32, 26);
      if (
        model.deployBlocked(32, 26) ||
        document.elementFromPoint(point.x, point.y) !== scene.game.canvas
      )
        throw Error(`Campaign deployment point is occluded at ${JSON.stringify(point)}`);
      return { x: point.x, y: point.y };
    });
    for (let i = 0; i < 20; i++) await page.touchscreen.tap(point.x, point.y);
    await expect
      .poll(async () => (await read()).loot ?? 0, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(100);
    const live = await read();
    expect(live.remaining).toBeLessThan(70);
    expect(live.progress).toBe(3900);
    await shot('live');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    await shot('result');
    expect(await read()).toMatchObject({ log: 1, progress: 4000, multiplayer: undefined });
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
    await tap('replay-exit');
    const close = page.getByRole('button', { name: 'Close dialog' });
    if (await close.isVisible()) await close.tap();
    if (await page.locator('.result-modal').isVisible()) await tap('home');
    await openPass();
    await expect(grabber).toContainText('4,000 / 4,000');
    await expect(multiplayer).toContainText('Needs multiplayer raid loot');
    const before = await read();
    await tier.getByRole('button', { name: 'Claim', exact: true }).tap();
    await expect(tier).toContainText('Claimed');
    expect(await read()).toMatchObject({
      progress: 4000,
      multiplayer: undefined,
      claimed: [0, 1],
      gold: before.gold + 2000,
    });
    await page.reload();
    await ready();
    await openPass();
    await expect(tier).toContainText('Claimed');
    await expect(tier.getByRole('button', { name: 'Claim' })).toHaveCount(0);
    expect(await read()).toMatchObject({
      log: 1,
      progress: 4000,
      multiplayer: undefined,
      claimed: [0, 1],
      gold: before.gold + 2000,
    });
    await shot('claimed-after-reload');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ observedLoot: live.loot, settled: await read() }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
