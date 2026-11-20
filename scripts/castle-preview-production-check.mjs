// Exercise the packaged touch and replay paths. The local QA hook only reads scene/model state.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const artifacts = 'output/rea-cloud-playtest/castle-preview';
const code = 'i1x3-2x0-1x1d1x1u1x92-1x0';
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
  const { nativeRow, num } = await modules.ssrLoadModule('/src/game/native-data.ts');
  const castle = nativeRow('buildings', 'Clan Castle', 9);
  pinned = ['HousingSpace', 'HousingSpaceAlt', 'HousingSpaceSiege'].map((key) => num(castle, key));
  expect(pinned).toEqual([45, 2, 1]);
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = new GameModel(initialSave());
  fixture.state.buildings = [
    makeBuilding(1, 'townhall', 33, 33, 15),
    makeBuilding(2, 'cannon', 18, 18, 1),
    makeBuilding(3, 'cannon', 24, 18, 1),
    makeBuilding(4, 'workshop', 29, 28, 7),
    makeBuilding(5, 'builder', 37, 33, 1),
    makeBuilding(6, 'clancastle', 24, 32, 9),
    makeBuilding(7, 'camp', 28, 34, 1),
    makeBuilding(8, 'barracks', 36, 28, 1),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.army = emptyArmy();
  fixture.state.spells = emptySpells();
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
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
    // Use the packaged developer hook on loopback and skip mounting the toolbox.
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.waitForFunction(() => window.qa?.scene.ready);
    await page.unrouteAll();
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
          units: battle?.units.map(({ id, hp, kind }) => ({ id, hp, kind })),
          army: state.army,
          spells: state.spells,
          replay,
          actions: state.raidLog?.[0]?.replay?.actions,
        };
      });
    const shot = (name) => page.screenshot({ path: `${artifacts}/${name}.png` });
    await page.locator('.train-add').tap();
    await tap('army-presets');
    await page
      .locator('#army-code')
      .fill(`https://link.clashofclans.com/en?action=CopyArmy&army=${code}`);
    const preview = page.locator('.army-import-preview');
    await expect(preview).toContainText('1 troop spaces · 0 spell spaces · 1 siege');
    const castle = preview.locator('.recipe-castle');
    await castle.locator('summary').tap();
    for (const [name, count] of [
      ['Barbarian', 2],
      ['Archer', 1],
      ['Giant', 1],
      ['Healing Spell', 1],
    ]) {
      await expect(castle.locator(`[title="${name}"]`)).toHaveText(`×${count}`);
    }
    expect((await read()).army.battledrill).toBe(0);
    await shot('01-preview');
    await tap('army-import');
    const prepared = await read();
    expect(Object.entries(prepared.army).filter(([, count]) => count)).toEqual([
      ['swordsman', 1],
      ['battledrill', 1],
    ]);
    expect(Object.values(prepared.spells).some(Boolean)).toBe(false);
    await tap('close');
    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('practice');
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
    expect((await read()).units.filter(({ hp }) => hp > 0)).toEqual([]);
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
    expect(completed.units.filter(({ hp }) => hp > 0)).toEqual([]);
    const preRelease = await seek(Math.max(0, scouting + before.at - 0.3));
    expect(preRelease.units).toHaveLength(1);
    expect(preRelease.units[0].id).toBe(drill.id);
    expect(preRelease.units[0].hp).toBeGreaterThan(0);
    const postRelease = await seek(duration);
    expect(postRelease.units.filter(({ hp }) => hp > 0)).toEqual([]);
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
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
