// Exercise the Giant Arrow unlock, equip, activation and replay using packaged phone Chromium.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const artifacts = 'output/rea-cloud-playtest/giant-arrow-unlock';
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
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = new GameModel(initialSave());
  fixture.state.buildings = [
    makeBuilding(1, 'townhall', 33, 32, 9),
    makeBuilding(2, 'blacksmith', 26, 23, 1),
    makeBuilding(3, 'builder', 25, 29, 1),
    makeBuilding(4, 'herohall', 14, 30, 3),
    makeBuilding(5, 'airdefense', 22, 21, 1),
    makeBuilding(6, 'elixirstorage', 30, 20, 8),
    makeBuilding(7, 'elixirstorage', 35, 20, 8),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.army = emptyArmy();
  fixture.state.spells = emptySpells();
  fixture.state.elixir = 1_200_000;
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.state.heroes = { queen: { level: 1 } };
  fixture.state.heroLineup = ['queen'];
  expect(fixture.resourceCap('elixir')).toBeGreaterThanOrEqual(1_200_000);
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
        const b = model.battle;
        const smith = model.state.buildings.find(({ id }) => id === 2);
        const queen = b?.nativeHeroes?.find(({ kind }) => kind === 'queen');
        return {
          smith: { level: smith.level, start: smith.upgradeStart, end: smith.upgradeEnd },
          elixir: model.state.elixir,
          gear: model.gear.loadouts.queen,
          arrowLevel: model.gear.levels['piercing-arrow'],
          battleGear: queen?.items.map(({ slug }) => slug),
          arrow: b?.nativeGiantArrows?.map(({ id, damage }) => ({ id, damage })),
          airDefense: b?.buildings.find(({ id }) => id === 5)?.hp,
          actions: model.state.raidLog?.[0]?.replay?.actions,
        };
      });
    const shot = (name) =>
      page.screenshot({ path: `${artifacts}/${name}.png`, animations: 'disabled' });
    const boot = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };
    const selectSmith = async () => {
      await tapField(27.5, 24.5);
      await expect(page.locator('.building-context h2')).toHaveText('Blacksmith');
    };
    const arrowDetail = async () => {
      await selectSmith();
      await tap('blacksmith');
      await tap('blacksmith-hero:queen');
      await tap('native-item:piercing-arrow');
    };
    const before = await read();
    await arrowDetail();
    const detail = page.locator('.equipment-detail');
    await expect(detail).toContainText('Giant Arrow');
    await expect(page.locator('[data-action="native-equip:piercing-arrow,0"]')).toHaveCount(0);
    if (baseline) await expect(detail).toContainText('Not owned');
    else await expect(detail).toContainText('Requires Blacksmith level 2');
    expect(await read()).toEqual(before);
    await detail.locator('.equipment-detail-heading').scrollIntoViewIfNeeded();
    await shot(baseline ? '01-baseline-locked' : '02-locked-requirement');
    await tap('close');
    await selectSmith();
    await expect(page.locator('[data-action="upgrade:2"]')).toContainText('1,200,000');
    await tap('upgrade:2');
    await expect.poll(async () => (await read()).smith.end ?? 0).toBeGreaterThan(0);
    const pending = await read();
    expect(pending.elixir).toBe(0);
    expect(pending.smith.level).toBe(1);
    expect(pending.smith.end - pending.smith.start).toBe(86_400_000);
    expect(pending.arrowLevel).toBeUndefined();
    await page.reload();
    await boot();
    expect(await read()).toEqual(pending);
    await page.clock.setFixedTime(pending.smith.end + 1);
    await page.reload();
    await boot();
    const complete = await read();
    expect(complete.smith.level).toBe(2);
    expect(complete.elixir).toBe(0);
    expect(complete.arrowLevel).toBe(1);
    await arrowDetail();
    await tap('native-equip:piercing-arrow,0');
    await expect(page.locator('.equipped-label')).toContainText('slot 1');
    await detail.locator('.equipped-label').scrollIntoViewIfNeeded();
    await shot(baseline ? '01-baseline-equipped' : '03-equipped');
    await page.reload();
    await boot();
    expect((await read()).gear[0]).toBe('piercing-arrow');
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner')).toBeVisible();
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await tap('hero-select:queen');
    await tapField(18.5, 22, true);
    await expect(page.locator('[data-action="hero-select:queen"]')).toHaveAccessibleName(
      /Activate ability/,
    );
    await tap('hero-select:queen');
    await expect.poll(async () => (await read()).arrow?.[0]?.damage ?? 0).toBe(750);
    await expect.poll(async () => (await read()).airDefense).toBe(0);
    await shot(baseline ? '01-baseline-battle' : '04-air-defense-hit');
    await tap('surrender');
    await tap('end');
    const actions = (await read()).actions;
    expect(actions.filter(({ type }) => type === 'ability')).toEqual([
      expect.objectContaining({ type: 'ability', hero: 'queen' }),
    ]);
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await expect(slider).toBeVisible();
    const { width, height } = await slider.evaluate((el) => ({
      width: el.offsetWidth,
      height: el.offsetHeight,
    }));
    await slider.tap({ position: { x: width - 8, y: height / 2 } });
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await read();
    expect(replay.battleGear[0]).toBe('piercing-arrow');
    expect(replay.airDefense).toBe(0);
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        baseline,
        smith: complete.smith,
        battleGear: replay.battleGear,
        airDefense: replay.airDefense,
      }),
    );
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
