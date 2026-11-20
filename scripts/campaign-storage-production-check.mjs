import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv.includes('--baseline');
const artifacts = 'output/rea-cloud-playtest/campaign-storage';
await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { initialSave, makeBuilding } = await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy } = await modules.ssrLoadModule('/src/game/army.ts');
  const { TROOP_KEYS } = await modules.ssrLoadModule('/src/game/data.ts');
  const { freshNativeCampaign } = await modules.ssrLoadModule('/src/game/native-campaign.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = initialSave();
  fixture.tutorial = true;
  fixture.settings.sound = false;
  fixture.settings.music = false;
  fixture.gold = fixture.elixir = 0;
  fixture.nextId = 100;
  fixture.obstacles = [];
  fixture.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 9),
    makeBuilding(2, 'builder', 16, 20, 1),
    makeBuilding(3, 'barracks', 12, 23, 9),
    makeBuilding(4, 'camp', 12, 30, 7),
    makeBuilding(5, 'camp', 18, 30, 7),
    makeBuilding(6, 'goldstorage', 30, 20, 4),
    makeBuilding(7, 'elixirstorage', 30, 25, 4),
    makeBuilding(8, 'laboratory', 30, 30, 7),
  ];
  fixture.army = { ...emptyArmy(), dragon: 5 };
  fixture.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, k === 'dragon' ? 4 : 1]));
  fixture.nativeCampaign = freshNativeCampaign();
  fixture.nativeCampaign.stars.fill(1, 0, 8);
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
    const boot = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await boot();
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = async (name) => {
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await page.screenshot({
        path: `${artifacts}/${baseline ? 'baseline' : 'patched'}-${name}.png`,
        animations: 'disabled',
      });
    };
    const read = () =>
      page.evaluate(() => {
        const { model, scene } = window.qa;
        const { battle, state } = model;
        const poses = (battle?.buildings ?? [])
          .filter(({ kind }) => kind === 'goldstorage' || kind === 'elixirstorage')
          .flatMap(({ id, kind }) => {
            const entries = scene.villageNativePresentation.views.get(id);
            if (!entries) return [];
            return [...entries.values()].flatMap(({ signature }) => {
              const match = /resource=(\d+)/.exec(signature ?? '');
              return match ? [{ kind, frame: Number(match[1]) }] : [];
            });
          });
        return {
          trophies: state.trophies,
          raids: state.stats.raids,
          gold: state.gold,
          elixir: state.elixir,
          best: state.nativeCampaign?.stars[8],
          remaining: state.nativeCampaign?.remaining[8],
          nextOpen: model.campaignOpen(9),
          log: state.raidLog?.map(({ id, result }) => ({ id, result })) ?? [],
          poses,
          replay: model.replay,
        };
      });
    const start = async () => {
      await page.locator('.attack-btn').tap();
      await tap('attack:8');
      await expect(page.locator('.battle-enemy h2')).toHaveText('Maginot Line');
      await page.waitForFunction(() => !window.qa.scene.battleArtPending());
      await expect
        .poll(async () => new Set((await read()).poses.map(({ kind }) => kind)).size)
        .toBe(2);
    };
    const deploy = async (count) => {
      await tap('troop:dragon');
      const point = await page.evaluate(() => {
        const { model, scene } = window.qa;
        let best;
        for (let x = 8; x < 39; x += 0.5)
          for (let y = 8; y < 39; y += 0.5) {
            if (model.deployBlocked(x, y)) continue;
            const p = scene.screenFor(x, y);
            if (p.y < 210 || p.y > 410 || document.elementFromPoint(p.x, p.y) !== scene.game.canvas)
              continue;
            const distance = Math.hypot(x - 22, y - 22);
            if (!best || distance < best.distance) best = { x: p.x, y: p.y, distance };
          }
        return best;
      });
      expect(point).toBeDefined();
      for (let i = 0; i < count; i++) {
        await page.touchscreen.tap(point.x, point.y);
        if (i + 1 < count) await page.waitForTimeout(330);
      }
      await expect(page.locator('.battle-clock')).toContainText('NO TIME LIMIT');
    };
    const initial = await read();
    expect(initial).toMatchObject({
      best: 0,
      remaining: { gold: 8000, elixir: 8000 },
      nextOpen: false,
    });
    await start();
    const full = (await read()).poses;
    expect(full.every(({ frame }) => (baseline ? frame === 0 : frame > 0))).toBe(true);
    await shot('first-scout');
    await deploy(4);
    await expect(page.locator('.result-stars .earned')).toHaveCount(3, { timeout: 70_000 });
    const win = await read();
    expect(win).toMatchObject({
      best: 3,
      nextOpen: true,
      remaining: { gold: 0, elixir: 0 },
      gold: 8000,
      elixir: 8000,
      raids: initial.raids + 1,
      trophies: initial.trophies,
    });
    expect(win.log).toHaveLength(1);
    await shot('first-win');

    await tap('raid-again');
    await expect(page.locator('.battle-enemy h2')).toHaveText('Maginot Line');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await expect
      .poll(async () => new Set((await read()).poses.map(({ kind }) => kind)).size)
      .toBe(2);
    const depleted = (await read()).poses;
    expect(depleted.every(({ frame }) => (baseline ? frame > 0 : frame === 0))).toBe(true);
    await shot('repeat-scout');
    await deploy(1);
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    const repeated = await read();
    expect(repeated).toMatchObject({
      best: 3,
      nextOpen: true,
      remaining: { gold: 0, elixir: 0 },
      gold: 8000,
      elixir: 8000,
      raids: initial.raids + 2,
      trophies: initial.trophies,
    });
    expect(repeated.log.map(({ result }) => [result.stars, result.gold, result.elixir])).toEqual([
      [0, 0, 0],
      [3, 8000, 8000],
    ]);
    await shot('repeat-result');
    await page.reload();
    await boot();
    const reloaded = await read();
    const progress = ({ log, raids, best, nextOpen, remaining, trophies, gold, elixir }) => ({
      log,
      raids,
      best,
      nextOpen,
      remaining,
      trophies,
      gold,
      elixir,
    });
    expect(progress(reloaded)).toEqual(progress(repeated));
    await page.locator('.attack-btn').tap();
    await expect(page.locator('#campaign-stage-8 .campaign-stars')).toHaveText('★★★');
    await expect(page.locator('[data-action="attack:9"]')).toBeEnabled();
    await page.getByRole('button', { name: 'Close dialog' }).tap();

    await tap('battle-log');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).last().tap();
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await expect(slider).toBeVisible();
    await slider.press('Home');
    await expect.poll(async () => (await read()).poses.length).toBeGreaterThan(0);
    if (!baseline) expect((await read()).poses).toEqual(full);
    await shot('replay-start');
    await slider.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    expect(progress(await read())).toEqual(progress(repeated));
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ baseline, full, depleted, repeated: progress(repeated) }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
