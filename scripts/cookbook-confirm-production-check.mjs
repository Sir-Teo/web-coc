// Exercise recipe confirmation and the resulting army in packaged phone Chromium.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const artifacts = 'output/rea-cloud-playtest/cookbook-equipment';
const recipe = 'EV_TH10_HotHogSummer';
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
    makeBuilding(1, 'townhall', 33, 33, 10),
    makeBuilding(2, 'barracks', 34, 24, maxLevelFor('barracks', 10)),
    makeBuilding(3, 'darkbarracks', 26, 24, maxLevelFor('darkbarracks', 10)),
    makeBuilding(4, 'spellfactory', 18, 24, maxLevelFor('spellfactory', 10)),
    makeBuilding(5, 'darkspellfactory', 10, 24, maxLevelFor('darkspellfactory', 10)),
    makeBuilding(10, 'builder', 38, 33, 1),
    makeBuilding(11, 'herohall', 9, 33, maxLevelFor('herohall', 10)),
    makeBuilding(12, 'blacksmith', 16, 33, maxLevelFor('blacksmith', 10)),
    ...[8, 14, 20, 26].map((x, i) => makeBuilding(6 + i, 'camp', x, 12, maxLevelFor('camp', 10))),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.army = emptyArmy();
  fixture.state.spells = emptySpells();
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.state.king = { level: 1 };
  fixture.state.heroes = { queen: { level: 1 } };
  fixture.state.heroLineup = ['king', 'queen'];
  fixture.train('swordsman', 3);
  expect(fixture.state.army.swordsman).toBe(3);
  expect(fixture.capacity).toBe(240);
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
        const composition = (units) =>
          Object.fromEntries(Object.entries(units).filter(([, count]) => count));
        return {
          army: composition(model.state.army),
          spells: composition(model.state.spells),
          lineup: model.state.heroLineup,
          gear: model.gear.loadouts,
          battleGear: model.battle?.nativeHeroes?.map(({ kind, items }) => [
            kind,
            items.map(({ slug }) => slug),
          ]),
          remaining: model.battle && composition(model.battle.remaining),
          replay: model.state.raidLog?.[0]?.replay?.actions,
        };
      });
    const shot = (name) =>
      page.screenshot({ path: `${artifacts}/${name}.png`, animations: 'disabled' });
    await page.locator('.train-add').tap();
    await tap('army-presets');
    await tap('cookbook');
    const old = await read();
    expect(old.army).toEqual({ swordsman: 3 });
    await tap(`recipe-use:${recipe}`);
    await expect(page.getByRole('heading', { name: 'Confirm recipe changes' })).toBeVisible();
    expect(await read()).toEqual(old);
    await shot(baseline ? '01-baseline-confirmation' : '02-confirmation');
    await tap('recipe-confirm-cancel');
    await expect(page.locator('#modal-title')).toHaveText('Cookbook');
    await expect(page.locator(`[data-action="recipe-use:${recipe}"]`)).toBeFocused();
    expect(await read()).toEqual(old);
    await tap(`recipe-use:${recipe}`);
    if (!baseline) {
      await expect(page.getByText(/keeps Barbarian Puppet in place of Spiky Ball/)).toBeVisible();
      await expect(
        page.getByText(/keeps Invisibility Vial in place of Action Figure/),
      ).toBeVisible();
    }
    await tap('recipe-confirm-use');
    await expect(page.locator('#toast')).toContainText('Recipe Hot Hog Summer set as active army!');
    const prepared = await read();
    expect(prepared.army).toEqual({ hogrider: 16, valkyrie: 16, wizard: 8 });
    const king = baseline ? ['earthquake-boots'] : ['barbarian-puppet', 'earthquake-boots'];
    const queen = baseline ? ['archer-puppet'] : ['invisibility-vial', 'archer-puppet'];
    expect(prepared.gear.king).toEqual(king);
    expect(prepared.gear.queen).toEqual(queen);
    await tap('close');
    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('attack:0');
    await expect(page.locator('.battle-enemy h2')).toHaveText('Payback');
    expect((await read()).battleGear).toEqual([
      ['king', king],
      ['queen', queen],
    ]);
    await tap('troop:hogrider');
    await tapField(32, 26, true);
    await expect.poll(async () => (await read()).remaining?.hogrider).toBe(15);
    await tap('hero-select:king');
    await tapField(32, 26, true);
    await tap('hero-select:queen');
    await tapField(32, 26, true);
    await shot(baseline ? '01-baseline-battle' : '03-first-deployment');
    await tap('surrender');
    await tap('end');
    await expect(page.getByRole('button', { name: 'Watch replay', exact: true })).toBeVisible();
    expect((await read()).replay.filter(({ type }) => type === 'troop')).toEqual([
      expect.objectContaining({ type: 'troop', kind: 'hogrider' }),
    ]);
    expect(
      (await read()).replay.filter(({ type }) => type === 'hero').map(({ hero }) => hero),
    ).toEqual(['king', 'queen']);
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
    expect((await read()).battleGear).toEqual([
      ['king', king],
      ['queen', queen],
    ]);
    console.log(JSON.stringify({ baseline, king, queen }));
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
