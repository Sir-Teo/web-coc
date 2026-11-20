// Exercise Angry Jelly unlock, reassignment, and hero target selection.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const artifacts = 'output/rea-cloud-playtest/angry-jelly';
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
    makeBuilding(1, 'townhall', 33, 34, 16),
    {
      ...makeBuilding(2, 'pethouse', 24, 25, 9),
      upgradeStart: now + 60_000 - 604_800_000,
      upgradeEnd: now + 60_000,
    },
    makeBuilding(3, 'builder', 32, 23, 1),
    makeBuilding(4, 'herohall', 32, 27, 3),
    makeBuilding(5, 'cannon', 18, 21, 21),
    makeBuilding(6, 'goldstorage', 25, 20, 15),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.army = emptyArmy();
  fixture.state.spells = emptySpells();
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.state.settings.manualHeroAbilities = true;
  fixture.state.king = { level: 1 };
  fixture.state.heroes = { queen: { level: 1 } };
  fixture.state.heroLineup = ['queen'];
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
        const owner = b?.nativeHeroes?.find(({ kind }) => kind === 'queen');
        const unit = (id) => {
          const u = b?.units.find((unit) => unit.id === id);
          return u && { hp: u.hp, id, target: u.target };
        };
        return {
          houseLevel: model.petHouse.level,
          upgradeEnd: model.petHouse.upgradeEnd,
          level: model.petProgress.levels.jelly,
          assigned: model.petProgress.assigned,
          at: b?.elapsed,
          hero: unit(owner?.unitId),
          jelly: unit(owner?.petId),
          expires: owner?.jellyBrainwashUntil,
          replay: model.replay,
        };
      });
    const shot = (name) =>
      page.screenshot({ path: `${artifacts}/${name}.png`, animations: 'disabled' });
    const boot = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };
    const pets = async () => {
      await tapField(25.5, 26.5);
      await expect(page.locator('.building-context h2')).toHaveText('Pet House');
      await tap('pets');
    };
    const jellyPanel = page.locator('[data-pet="jelly"]');
    await pets();
    await expect(jellyPanel).toContainText('Requires Pet House 10');
    expect((await read()).level).toBeUndefined();
    const initial = await read();
    await page.clock.setFixedTime(initial.upgradeEnd + 1);
    await page.reload();
    await boot();
    expect(await read()).toMatchObject({ houseLevel: 10, level: 1 });
    await pets();
    await tap('pet-assign:jelly,king');
    expect((await read()).assigned).toEqual({ king: 'jelly' });
    await tap('pet-assign:jelly,queen');
    expect((await read()).assigned).toEqual({ queen: 'jelly' });
    await expect(jellyPanel.locator('[data-action="pet-assign:jelly,queen"]')).toBeDisabled();
    await jellyPanel.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await shot('01-assigned');
    await page.reload();
    await boot();
    expect((await read()).assigned).toEqual({ queen: 'jelly' });
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner')).toBeVisible();
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await tap('hero-select:queen');
    await tapField(23, 22.5, true);
    await expect.poll(async () => !!(await read()).jelly).toBe(true);
    await expect.poll(async () => (await read()).hero.target).toBe(baseline ? 6 : 5);
    const deployed = await read();
    expect(deployed.expires).toBe(baseline ? undefined : 25);
    await shot(baseline ? '02-baseline-storage' : '02-brainwashed-defense');
    await expect.poll(async () => (await read()).hero.hp).toBeLessThanOrEqual(0);
    const fallen = await read();
    expect(fallen.expires).toBe(baseline ? undefined : 0);
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await tap('replay-pause');
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await expect(slider).toBeVisible();
    const seek = async (time) => {
      const handle = await page.waitForFunction((time) => {
        const range = document.querySelector('#replay-progress');
        if (!range) return null;
        const { x, y, width, height } = range.getBoundingClientRect();
        const point = { x: x + 8 + ((width - 16) * time) / Number(range.max), y: y + height / 2 };
        return document.elementFromPoint(point.x, point.y) === range ? point : null;
      }, time);
      const point = await handle.jsonValue();
      await handle.dispose();
      await page.touchscreen.tap(point.x, point.y);
      await expect
        .poll(async () => {
          const { replay } = await read();
          return !replay.seeking && Math.abs(replay.time - time) < 0.2;
        })
        .toBe(true);
      return read();
    };
    const duration = Number(await slider.getAttribute('max'));
    await seek(duration);
    const early = await seek(1);
    expect(early.hero.target).toBe(deployed.hero.target);
    expect(early.expires).toBe(deployed.expires);
    const replay = await seek(duration);
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    expect(replay.hero.hp).toBeLessThanOrEqual(0);
    expect(replay.expires).toBe(fallen.expires);
    await shot(baseline ? '03-baseline-replay' : '03-replay');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ baseline, deployed, early, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
