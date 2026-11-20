// Exercise the Town Hall 17 prerequisite, merge, and completion in packaged phone Chromium.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const artifacts = 'output/rea-cloud-playtest/townhall-merge';
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
    makeBuilding(1, 'townhall', 22, 21, 16),
    {
      ...makeBuilding(2, 'eagleartillery', 18, 23, 6),
      upgradeStart: now + 60_000 - 820_800_000,
      upgradeEnd: now + 60_000,
    },
    makeBuilding(3, 'builder', 25, 29, 1),
    makeBuilding(4, 'builder', 30, 28, 1),
    makeBuilding(5, 'ricochetcannon', 13, 17, 1),
    makeBuilding(6, 'ricochetcannon', 29, 17, 1),
    makeBuilding(7, 'multiarchertower', 13, 29, 1),
    makeBuilding(8, 'multiarchertower', 30, 22, 1),
    makeBuilding(9, 'camp', 25, 34, 1),
    makeBuilding(10, 'barracks', 32, 33, 3),
    ...[8, 14, 20, 26].map((x, i) =>
      makeBuilding(11 + i, 'goldstorage', x, 10, maxLevelFor('goldstorage', 16)),
    ),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.army = emptyArmy();
  fixture.state.spells = emptySpells();
  fixture.state.gold = 16_000_000;
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
        const building = (id) => {
          const b = model.state.buildings.find((b) => b.id === id);
          return b && { level: b.level, start: b.upgradeStart, end: b.upgradeEnd };
        };
        return {
          townhall: building(1),
          eagle: building(2),
          xp: model.state.xp,
          gold: model.state.gold,
          busy: model.busy,
          battle: model.battle?.buildings
            .filter(({ id }) => id === 1 || id === 2)
            .map(({ id, level, kind }) => ({ id, level, kind })),
          artilleryFiredAt: model.battle?.nativeDefenses?.[1]?.firedAt,
          replay: model.state.raidLog?.[0]?.replay?.actions,
        };
      });
    const shot = (name) =>
      page.screenshot({ path: `${artifacts}/${name}.png`, animations: 'disabled' });
    const boot = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };
    const selectHall = async () => {
      await tapField(24, 23);
      await expect(page.locator('.building-context h2')).toHaveText('Town Hall');
    };
    const upgrade = page.locator('.info-upgrade [data-action="upgrade:1"]');
    const before = await read();
    await selectHall();
    await tap('info');
    await expect(page.locator('.info-cost')).toContainText('16,000,000');
    if (baseline) {
      await expect(upgrade).toBeEnabled();
      await shot('01-baseline-enabled');
      await upgrade.tap();
      await expect(page.locator('#toast')).toContainText('Needs Eagle Artillery level 7 to merge');
      expect(await read()).toEqual(before);
      console.log(
        'Baseline showed an enabled Upgrade button for a prerequisite the model refused.',
      );
    } else {
      await expect(upgrade).toBeDisabled();
      await expect(page.locator('.townhall-merge-blocker')).toContainText(
        'Needs Eagle Artillery level 7 to merge',
      );
      expect(await read()).toEqual(before);
      await shot('02-requirement');
      await tap('close');
      await page.clock.setFixedTime(before.eagle.end + 1);
      await page.reload();
      await boot();
      const ready = await read();
      expect(ready.eagle).toEqual({ level: 7 });
      expect(ready.townhall).toEqual({ level: 16 });
      expect(ready.gold).toBe(before.gold);
      expect(ready.xp).toBe(before.xp + 905);
      await selectHall();
      await tap('info');
      await expect(upgrade).toBeEnabled();
      await expect(page.locator('.townhall-merge-consequence')).toContainText('Inferno Artillery');
      await shot('03-ready');
      await upgrade.tap();
      await expect.poll(async () => (await read()).townhall.end).toBeGreaterThan(0);
      const pending = await read();
      expect(pending.gold).toBe(ready.gold - 16_000_000);
      expect(pending.eagle).toBeUndefined();
      expect(pending.townhall.level).toBe(16);
      expect(pending.townhall.end - pending.townhall.start).toBe(864_000_000);
      await page.reload();
      await boot();
      expect(await read()).toEqual(pending);
      await page.clock.setFixedTime(pending.townhall.end + 1);
      await page.reload();
      await boot();
      const complete = await read();
      expect(complete.townhall).toEqual({ level: 17 });
      expect(complete.gold).toBe(pending.gold);
      expect(complete.xp).toBe(ready.xp + 929);
      expect(complete.eagle).toBeUndefined();
      await page.reload();
      await boot();
      expect(await read()).toEqual(complete);
      await page.locator('.attack-btn').tap();
      await tap('practice');
      await expect(page.locator('.prep-banner')).toBeVisible();
      expect((await read()).battle).toEqual([{ id: 1, level: 17, kind: 'townhall' }]);
      await page.waitForFunction(() => !window.qa.scene.battleArtPending());
      await tap('troop:giant');
      await tapField(22, 27, true);
      await expect(page.locator('[data-action="surrender"]')).toBeVisible();
      await expect
        .poll(async () => (await read()).artilleryFiredAt ?? 0, { timeout: 20000 })
        .toBeGreaterThan(0);
      await shot('04-practice');
      await tap('surrender');
      await tap('end');
      await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
      await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
      expect((await read()).battle).toEqual([{ id: 1, level: 17, kind: 'townhall' }]);
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
