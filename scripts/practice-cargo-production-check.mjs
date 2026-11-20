// Exercise local practice preparation, exactly-once release, replay, and Ladder isolation.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const artifacts = 'output/rea-cloud-playtest/practice-cargo';

await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let save, pinned;
try {
  const { GameModel, initialSave, makeBuilding } =
    await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { siegeCargoCapacity } = await modules.ssrLoadModule('/src/game/siege-cargo.ts');
  pinned = siegeCargoCapacity(1);
  expect(pinned).toBe(10);
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = new GameModel(initialSave());
  fixture.state.buildings = [
    makeBuilding(1, 'townhall', 33, 33, 15),
    makeBuilding(2, 'cannon', 18, 18, 1),
    makeBuilding(3, 'cannon', 24, 18, 1),
    makeBuilding(4, 'workshop', 29, 28, 7),
    makeBuilding(5, 'builder', 37, 33, 1),
    makeBuilding(6, 'clancastle', 24, 32, 1),
    makeBuilding(7, 'camp', 28, 34, 1),
    makeBuilding(8, 'barracks', 36, 28, 4),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.army = emptyArmy();
  fixture.state.spells = emptySpells();
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.train('battledrill');
  expect(fixture.state.army.battledrill).toBe(1);
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
        const { battle, replay, state } = window.qa.model;
        return {
          at: battle?.elapsed,
          units: battle?.units.map(({ id, hp, kind, level }) => ({ id, hp, kind, level })),
          army: state.army,
          spells: state.spells,
          replay,
          cargo: battle?.siegeCargo,
          ladder: battle?.ladder,
          trophies: state.trophies,
          actions: state.raidLog?.[0]?.replay?.actions,
        };
      });
    const shot = (name) => page.screenshot({ path: `${artifacts}/${name}.png` });
    const village = await read();
    await page.locator('.attack-btn').tap();
    await tap('practice-cargo');
    await expect(page.getByRole('heading', { name: 'Practice siege cargo' })).toBeVisible();
    const start = page.getByRole('button', { name: 'Start practice' });
    await expect(start).toBeDisabled();
    await tap('practice-cargo-add:giant');
    for (let i = 0; i < 5; i++) await tap('practice-cargo-add:archer');
    const capacity = page.locator('.practice-cargo-capacity');
    await expect(capacity).toHaveText('10 / 10 troop housing');
    await expect(page.getByRole('button', { name: 'Add Barbarian' })).toBeDisabled();
    await tap('practice-cargo-back');
    expect((await read()).army).toEqual(village.army);
    await tap('practice-cargo');
    await expect(capacity).toHaveText('0 / 10 troop housing');
    await tap('practice-cargo-add:giant');
    await tap('practice-cargo-add:swordsman');
    await tap('practice-cargo-add:swordsman');
    await tap('practice-cargo-add:archer');
    await tap('practice-cargo-remove:swordsman');
    await expect(capacity).toHaveText('7 / 10 troop housing');
    await shot('01-loadout');
    await start.tap();
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await tap('troop:battledrill');
    await tapField(13, 18, true);
    const endSiege = page.getByRole('button', { name: 'End Battle Drill', exact: true });
    await expect(endSiege).toBeVisible();
    await expect.poll(async () => (await read()).at).toBeGreaterThan(0.8);
    const before = await read();
    expect(before.units).toHaveLength(1);
    const drill = before.units[0];
    expect(drill.kind).toBe('battledrill');
    expect(drill.hp).toBeGreaterThan(0);
    await shot('02-siege');
    await endSiege.tap();
    await expect(endSiege).toHaveCount(0);
    await expect.poll(async () => (await read()).at).toBeGreaterThan(before.at + 1);
    const survivors = (state) =>
      state.units.filter(({ hp }) => hp > 0).map(({ kind, level }) => [kind, level]);
    const payload = [
      ['swordsman', 1],
      ['archer', 1],
      ['giant', 1],
    ];
    const live = await read();
    expect(survivors(live)).toEqual(payload);
    await shot('03-ended');
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await tap('replay-pause');
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await expect(slider).toBeEnabled();
    const seek = async (time) => {
      const { width, height, duration } = await slider.evaluate((element) => ({
        width: element.offsetWidth,
        height: element.offsetHeight,
        duration: Number(element.max),
      }));
      await slider.tap({ position: { x: 8 + ((width - 16) * time) / duration, y: height / 2 } });
      await expect
        .poll(async () => {
          const { replay } = await read();
          return !replay.seeking && Math.abs(replay.time - time) < 0.2;
        })
        .toBe(true);
      return read();
    };
    const recorded = (await read()).actions.filter(({ type }) => type === 'siege-end');
    expect(recorded).toHaveLength(1);
    const duration = Number(await slider.getAttribute('max'));
    const completed = await seek(duration);
    const scouting = completed.replay.time - completed.at;
    expect(survivors(completed)).toEqual(payload);
    const preRelease = await seek(Math.max(0, scouting + before.at - 0.3));
    expect(preRelease.units).toHaveLength(1);
    expect(preRelease.units[0].id).toBe(drill.id);
    expect(preRelease.units[0].hp).toBeGreaterThan(0);
    const postRelease = await seek(duration);
    expect(survivors(postRelease)).toEqual(payload);
    expect(postRelease.units.map(({ id }) => id)).toEqual(live.units.map(({ id }) => id));
    await expect(endSiege).toHaveCount(0);
    await shot('04-replay');
    console.log(
      JSON.stringify(
        {
          pinned,
          siegeEndActions: recorded.length,
          before: preRelease.units,
          after: postRelease.units,
        },
        null,
        2,
      ),
    );
    await tap('replay-exit');
    const close = page.getByRole('button', { name: 'Close dialog' });
    if (await close.isVisible()) await close.tap();
    const returned = await read();
    expect(returned.army).toEqual(village.army);
    expect(returned.trophies).toBe(village.trophies);
    await page.reload();
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.waitForFunction(() => window.qa?.scene.ready);
    const reloaded = await read();
    expect(reloaded.army).toEqual(village.army);
    expect(reloaded.trophies).toBe(village.trophies);
    expect(reloaded.actions.filter(({ type }) => type === 'siege-end')).toHaveLength(1);
    await page.locator('.attack-btn').tap();
    await tap('ladder');
    await expect.poll(async () => !!(await read()).ladder, { timeout: 30000 }).toBe(true);
    const ranked = await read();
    expect(ranked.cargo).toBeUndefined();
    expect(ranked.army).toEqual(village.army);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
