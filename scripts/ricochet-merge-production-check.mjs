// Exercise Ricochet Cannon merge preview and construction in packaged phone Chromium.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const artifacts = 'output/rea-cloud-playtest/ricochet-merge';
const now = Date.now();
const baseline = process.argv.includes('--baseline');

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
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { maxLevelFor } = await modules.ssrLoadModule('/src/game/data.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = new GameModel(initialSave());
  fixture.state.buildings = [
    makeBuilding(1, 'townhall', 33, 32, 16),
    makeBuilding(2, 'cannon', 22, 21, 21),
    makeBuilding(3, 'cannon', 30, 20, 21),
    { ...makeBuilding(4, 'cannon', 31, 13, 21), geared: true },
    makeBuilding(5, 'cannon', 36, 21, 21),
    makeBuilding(6, 'builder', 25, 29, 1),
    makeBuilding(7, 'camp', 25, 34, 1),
    makeBuilding(8, 'barracks', 32, 26, 3),
    ...[8, 14, 20, 26].map((x, i) =>
      makeBuilding(11 + i, 'goldstorage', x, 10, maxLevelFor('goldstorage', 16)),
    ),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.army = emptyArmy();
  fixture.state.spells = emptySpells();
  fixture.state.gold = 12_000_000;
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.train('swordsman');
  fixture.train('giant');
  fixture.state.troopLevels = {
    ...Object.fromEntries(Object.keys(emptyArmy()).map((kind) => [kind, 1])),
    giant: 10,
  };
  expect(fixture.state.army.swordsman).toBe(1);
  expect(fixture.resourceCap('gold')).toBeGreaterThanOrEqual(fixture.state.gold);
  expect(validateSave(fixture.state)).toBe(true);
  save = JSON.stringify(fixture.state);
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
    // The loopback QA hook reads state. The loadout and combat use only player controls.
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.clock.setFixedTime(now);
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
        const { model } = window.qa;
        const defenses = (list) =>
          list
            .filter(({ kind }) => ['cannon', 'ricochetcannon'].includes(kind))
            .map(({ id, x, y, level, kind, geared, constructing, upgradeStart, upgradeEnd }) => ({
              id,
              x,
              y,
              level,
              kind,
              geared,
              constructing,
              upgradeStart,
              upgradeEnd,
            }));
        const merged = model.battle?.buildings.find(({ kind }) => kind === 'ricochetcannon');
        return {
          xp: model.state.xp,
          gold: model.state.gold,
          busy: model.busy,
          home: defenses(model.state.buildings),
          battle: model.battle && defenses(model.battle.buildings),
          firedAt: merged && model.battle.nativeDefenses?.[merged.id]?.firedAt,
        };
      });
    const shot = (name) =>
      page.screenshot({ path: `${artifacts}/${name}.png`, animations: 'disabled' });
    const boot = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };
    const merge = page.getByRole('button', { name: 'Merge into Ricochet Cannon' });
    const before = await read();
    await tapField(23.5, 22.5);
    await expect(page.locator('.building-context h2')).toHaveText('Cannon');
    await merge.tap();
    if (baseline) {
      await expect.poll(async () => (await read()).gold).toBe(0);
      expect((await read()).home.map(({ id }) => id)).toEqual([4, 5, 100]);
      await shot('01-baseline-committed');
      console.log('Baseline: first tap consumed the two Cannons and the full price.');
    } else {
      await expect(page.getByRole('heading', { name: 'Review defense merge' })).toBeVisible();
      await expect(page.locator('.merge-components')).toContainText('22, 21');
      await expect(page.locator('.merge-components')).toContainText('30, 20');
      await expect(page.locator('.merge-components')).not.toContainText('31, 13');
      await expect(page.locator('.merge-quote')).toContainText('12,000,000');
      expect(await read()).toEqual(before);
      await shot('02-preview');
      await tap('merge-cancel');
      await expect(merge).toBeFocused();
      expect(await read()).toEqual(before);
      await merge.tap();
      await tap('merge-confirm');
      await expect.poll(async () => (await read()).gold).toBe(0);
      const pending = await read();
      expect(pending.home.map(({ id }) => id)).toEqual([4, 5, 100]);
      const construction = pending.home.at(-1);
      expect(construction).toMatchObject({
        kind: 'ricochetcannon',
        x: 22,
        y: 21,
        level: 1,
        constructing: true,
      });
      expect(construction.upgradeEnd - construction.upgradeStart).toBe(604_800_000);
      expect(pending.busy).toBe(1);
      await shot('03-construction');
      await page.reload();
      await boot();
      expect(await read()).toEqual(pending);
      await page.clock.setFixedTime(construction.upgradeEnd + 1);
      await page.reload();
      await boot();
      const complete = await read();
      expect(complete).toMatchObject({ gold: 0, busy: 0, xp: before.xp + 777 });
      expect(complete.home.at(-1)).toMatchObject({
        id: 100,
        kind: 'ricochetcannon',
        x: 22,
        y: 21,
        level: 1,
      });
      expect(complete.home.at(-1).constructing).toBe(false);
      expect(complete.home.at(-1).upgradeEnd).toBeUndefined();
      await page.reload();
      await boot();
      expect(await read()).toEqual(complete);
      await page.locator('.attack-btn').tap();
      await tap('practice');
      await expect(page.locator('.prep-banner')).toBeVisible();
      expect((await read()).battle).toEqual(complete.home);
      await page.waitForFunction(() => !window.qa.scene.battleArtPending());
      await tap('troop:giant');
      await tapField(21, 26, true);
      await expect
        .poll(async () => (await read()).firedAt ?? 0, { timeout: 20000 })
        .toBeGreaterThan(0);
      await shot('04-practice');
      await tap('surrender');
      await tap('end');
      await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
      await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
      expect((await read()).battle).toEqual(complete.home);
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
