// Touch-play early readiness and Clan Castle rebuilding while both builders are busy.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const townHall = 3;
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/early-camp-barracks';
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
      makeBuilding(1, 'townhall', 22, 21, townHall),
      makeBuilding(2, 'barracks', 16, 20, 2),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 12, 14, 2),
      makeBuilding(6, 'builder', 26, 31, 1),
    ],
    army: { ...emptyArmy(), archer: 30 },
    spells: emptySpells(),
    gold: 10000000,
    elixir: 10000000,
    troopLevels: { ...Object.fromEntries(Object.keys(emptyArmy()).map((kind) => [kind, 1])), balloon: 8 },
    superBoosts: {},
    heroLineup: [],
    gems: 1000,
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
        const { battle } = window.qa.model;
        const m = window.qa.model;
        const { state } = m;
        const camp = state.buildings.find(b => b.kind === 'camp');
        const barracks = state.buildings.find(b => b.kind === 'barracks');
        const giant = battle?.units.find(u => u.kind === 'giant');
        return {
          camp:camp.level, campEnd:camp.upgradeEnd,
          barracks:barracks.level, barracksEnd:barracks.upgradeEnd,
          capacity:m.capacity, used:m.armySize, giants:state.army.giant,
          busy:m.busy, elixir:state.elixir, placement:m.placement,
          castle:m.clanCastle?.level, castleEnd:m.clanCastle?.upgradeEnd,
          battleCastle:battle?.buildings.some(b=>b.kind==='clancastle'),
          giant:giant && { id:giant.id, hp:giant.maxHp },
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
    const ready = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };
    await ready();
    await fieldTap(17.5,21.5);
    const context = page.locator('.building-context');
    await expect(context.locator('h2')).toHaveText('Barracks');
    await context.locator('[data-action="upgrade:2"]').tap();
    await page.getByRole('button',{name:'Close building'}).tap();
    await fieldTap(14.5,16.5);
    await expect(context.locator('h2')).toHaveText('Army Camp');
    await context.locator('[data-action="upgrade:4"]').tap();
    await page.getByRole('button',{name:'Close building'}).tap();
    const pending = await read();
    expect(pending).toMatchObject({camp:2,barracks:2,capacity:30,used:30,busy:2});
    expect(pending.barracksEnd).toBeLessThan(pending.campEnd);
    await page.locator('.shop-btn').tap();
    await tap('tab:Army');
    const castle = page.locator('[data-action="build:clancastle"]');
    if (baselineDist) {
      await castle.tap();
      await expect(page.locator("#toast")).toContainText("All builders are busy");
      expect((await read()).placement).toBeNull();
      await castle.scrollIntoViewIfNeeded();
      await shot('castle-blocked');
      await tap('close-drawer');
    } else {
      await expect(castle).toBeEnabled();
      await castle.tap();
      expect((await read()).placement).toBe('clancastle');
      await fieldTap(12.5,21.5);
      const built = await read();
      expect(built).toMatchObject({castle:1,castleEnd:undefined,busy:2,elixir:pending.elixir-10000});
      await shot('castle-rebuilt');
      await page.getByRole('button',{name:'Close building'}).tap();
    }
    const rebootAt = async at => {
      await page.goto('about:blank');
      await page.clock.setFixedTime(at);
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
      await ready();
    };
    const openArmy = async () => {
      await page.locator('.train-add').tap();
      await page.locator('#army-search').fill('Giant');
    };
    await rebootAt(pending.barracksEnd+1);
    expect(await read()).toMatchObject({barracks:3,camp:2,capacity:30,used:30,castle:baselineDist?undefined:1});
    await openArmy();
    await expect(page.locator('[data-action="train:giant"]')).toBeDisabled();
    await shot('giant-unlocked-full');
    await rebootAt(pending.campEnd+1);
    expect(await read()).toMatchObject({barracks:3,camp:3,capacity:35,used:30});
    await openArmy();
    await tap('train:giant');
    expect(await read()).toMatchObject({giants:1,used:35});
    await expect(page.locator('[data-action="train:giant"]')).toBeDisabled();
    await shot('army-full');
    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.evaluate(() => { window.qa.scene.paused = true; });
    await tap('troop:giant');
    const deployPoint = await page.evaluate(() => {
      const { model, scene } = window.qa;
      for (let x = 5.5; x < 35; x++)
        for (let y = 5.5; y < 35; y++) {
          if (model.deployBlocked(x, y)) continue;
          const point = scene.screenFor(x, y);
          if (point.y > innerHeight * 0.3 && point.y < innerHeight * 0.65 &&
              document.elementFromPoint(point.x, point.y) === scene.game.canvas)
            return { x: point.x, y: point.y };
        }
      throw Error('No visible deployment tile');
    });
    await page.touchscreen.tap(deployPoint.x, deployPoint.y);
    await steps(30);
    const live = await read();
    expect(live.giant).toBeDefined();
    expect(live.battleCastle).toBe(!baselineDist);
    await shot('deployment');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.getByRole('button', { name: 'First deployment' }).tap();
    await steps(90);
    expect(await read()).toEqual(live);
    await shot('replay');
    expect(errors).toEqual([]);
    console.log({ label, pending, live, replay: await read() });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise(resolve=>server.httpServer.close(resolve));
}
