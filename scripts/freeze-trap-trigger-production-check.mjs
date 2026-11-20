import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv.includes('--baseline');
const artifacts = 'output/rea-cloud-playtest/freeze-trap-trigger';
await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { initialSave, makeBuilding } = await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
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
    makeBuilding(1, 'townhall', 20, 20, 12),
    makeBuilding(2, 'builder', 16, 20, 1),
    makeBuilding(3, 'barracks', 12, 23, 9),
    makeBuilding(4, 'camp', 12, 30, 7),
    makeBuilding(5, 'camp', 18, 30, 7),
    makeBuilding(6, 'goldstorage', 30, 20, 4),
    makeBuilding(7, 'elixirstorage', 30, 25, 4),
    makeBuilding(8, 'laboratory', 30, 30, 7),
    makeBuilding(9, 'spellfactory', 35, 25, 6),
    makeBuilding(10, 'darkspellfactory', 35, 30, 4),
  ];
  fixture.army = { ...emptyArmy(), dragon: 2 };
  fixture.spells = { ...emptySpells(), skeleton: 1 };
  fixture.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, k === 'dragon' ? 4 : 1]));
  fixture.nativeCampaign = freshNativeCampaign();
  fixture.nativeCampaign.stars.fill(1);
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
    let trapId;
    const read = () =>
      page.evaluate((trapId) => {
        const { model } = window.qa;
        const { battle, state } = model;
        const trap = battle?.traps[trapId];
        const cast = battle?.late?.freezeTrap?.casts[trapId];
        return {
          trophies: state.trophies,
          raids: state.stats.raids,
          log: state.raidLog?.length ?? 0,
          at: battle?.elapsed,
          trap,
          cast,
          source: battle?.units.find(({ id }) => id === trap?.targetId)?.kind,
          skeletons:
            battle?.units.filter(({ kind }) => kind.startsWith('spellskeleton')).length ?? 0,
          reserve: battle?.remaining.dragon,
          replay: model.replay,
        };
      }, trapId);
    await page.locator('.attack-btn').tap();
    // The source layout is stage 65. Runtime indices start at zero.
    await tap('attack:64');
    await expect(page.locator('.battle-enemy h2')).toHaveText('Keep Your Cool');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    const layout = await page.evaluate(() => {
      const { model, scene } = window.qa;
      const traps = model.battle.buildings.filter(({ npc }) => npc === 'freeze-trap');
      const usable = (point) =>
        point.y >= 200 &&
        point.y <= 410 &&
        document.elementFromPoint(point.x, point.y) === scene.game.canvas;
      for (const trap of traps) {
        const x = trap.x + 1;
        const y = trap.y + 1;
        const castPoint = scene.screenFor(x, y);
        if (!usable(castPoint)) continue;
        for (let dx = -1.75; dx <= 1.75; dx += 0.125)
          for (let dy = -1.75; dy <= 1.75; dy += 0.125) {
            if (Math.hypot(dx, dy) > 1.8) continue;
            if (
              [-0.12, 0, 0.12].some((jx) =>
                [-0.12, 0, 0.12].some((jy) => model.deployBlocked(x + dx + jx, y + dy + jy)),
              )
            )
              continue;
            const point = scene.screenFor(x + dx, y + dy);
            if (usable(point))
              return {
                trapId: trap.id,
                count: traps.length,
                visible: model.visibleBuilding(trap),
                castPoint: { x: castPoint.x, y: castPoint.y },
                deployPoint: { x: x + dx, y: y + dy },
              };
          }
      }
    });
    expect(layout).toMatchObject({ count: 12, visible: false });
    trapId = layout.trapId;
    await shot('scouting');
    const home = await read();
    await tap('spell:skeleton');
    await page.touchscreen.tap(layout.castPoint.x, layout.castPoint.y);
    await expect.poll(async () => (await read()).skeletons).toBeGreaterThan(0);
    await page.waitForFunction(() => window.qa.model.battle.elapsed >= 1.4);
    const summoned = await read();
    if (baseline) expect(summoned.source).toMatch(/^spellskeleton/);
    else expect(summoned.trap).toBeUndefined();
    expect(summoned.reserve).toBe(home.reserve);
    await shot('skeletons');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    await tap('raid-again');
    await expect(page.locator('.battle-enemy h2')).toHaveText('Keep Your Cool');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    expect((await read()).trap).toBeUndefined();
    await tap('troop:dragon');
    const deployPoint = await page.evaluate(({ x, y }) => {
      const { model, scene } = window.qa;
      const point = scene.screenFor(x, y);
      const actual = scene.gridAtScreen(Math.round(point.x), Math.round(point.y));
      if (model.deployBlocked(actual.x, actual.y)) throw Error('Refreshed deployment is blocked');
      return point;
    }, layout.deployPoint);
    await page.touchscreen.tap(deployPoint.x, deployPoint.y);
    await expect.poll(async () => (await read()).reserve).toBe(home.reserve - 1);
    await expect.poll(async () => (await read()).source).toBe('dragon');
    await expect.poll(async () => (await read()).cast?.hit).toBe(true);
    const triggered = await read();
    expect(triggered.cast.frozen).toContain(triggered.trap.targetId);
    await shot('frozen');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    expect(await read()).toMatchObject({
      trophies: home.trophies,
      raids: home.raids + 2,
      log: home.log + 2,
    });
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await tap('replay-pause');
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await expect(slider).toBeVisible();
    await slider.press('Home');
    await expect.poll(async () => (await read()).replay?.time).toBe(0);
    expect((await read()).trap).toBeUndefined();
    await slider.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    expect(await read()).toMatchObject({
      cast: { hit: true, frozen: triggered.cast.frozen },
      source: triggered.source,
      trophies: home.trophies,
      raids: home.raids + 2,
      log: home.log + 2,
    });
    await shot('replay');
    await page.getByRole('button', { name: 'Back to log' }).tap();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).last().tap();
    await expect(slider).toBeVisible();
    await slider.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const spellReplay = await read();
    expect(spellReplay.source).toBe(summoned.source);
    expect(spellReplay.raids).toBe(home.raids + 2);
    expect(spellReplay.log).toBe(home.log + 2);

    expect(errors).toEqual([]);
    console.log(JSON.stringify({ baseline, layout, deployPoint, summoned, triggered }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
