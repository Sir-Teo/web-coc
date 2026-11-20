// Exercise the packaged touch and replay paths. The local QA hook only reads scene/model state.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const artifacts = 'output/rea-cloud-playtest/lightning-targets';
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
  const { nativeRow, flag, num, seconds } = await modules.ssrLoadModule('/src/game/native-data.ts');
  const row = nativeRow('spells', 'Lightning', 1);
  pinned = {
    radius: num(row, 'Radius') / 100,
    damage: num(row, 'Damage'),
    stun: seconds(row, 'StunTimeMS'),
    castleImmune: flag(row, 'ImmunityTH_CC'),
  };
  expect(pinned).toEqual({ radius: 2, damage: 150, stun: 0.1, castleImmune: true });
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = new GameModel(initialSave());
  fixture.state.buildings = [
    makeBuilding(1, 'townhall', 33, 33, 11),
    makeBuilding(2, 'clancastle', 19, 17, 1),
    { ...makeBuilding(3, 'skeletontrap', 18, 18, 1), skeletonMode: 'ground' },
    { ...makeBuilding(4, 'skeletontrap', 18, 19, 1), skeletonMode: 'air' },
    makeBuilding(9, 'cannon', 24, 18, 1),
    makeBuilding(5, 'barracks', 35, 28, 6),
    makeBuilding(6, 'camp', 27, 35, 6),
    makeBuilding(7, 'spellfactory', 29, 28, 6),
    makeBuilding(8, 'builder', 37, 33, 1),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.army = emptyArmy();
  fixture.state.spells = emptySpells();
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.train('giant');
  fixture.train('balloon');
  expect(fixture.state.army.balloon).toBe(1);
  fixture.brew('lightning');
  expect(fixture.state.army.giant).toBe(1);
  expect(fixture.state.spells.lightning).toBe(1);
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
        const { battle, replay } = window.qa.model;
        return {
          at: battle.elapsed,
          defenders: (battle.defenders ?? []).map(({ id, x, y, hp, mode }) => ({
            id,
            x,
            y,
            hp,
            mode,
          })),
          buildings: battle.buildings
            .filter(({ id }) => id === 2 || id === 9)
            .map(({ id, x, y, hp }) => ({ id, x, y, hp })),
          cast: battle.nativeSpells?.findLast(({ name }) => name === 'Lightning'),
          remaining: battle.spells.lightning,
          replay,
        };
      });
    const shot = (name) => page.screenshot({ path: `${artifacts}/${name}.png` });
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await tap('troop:giant');
    await tapField(14.5, 18, true);
    await tap('troop:balloon');
    await tapField(14.5, 19, true);
    await expect
      .poll(async () => [...new Set((await read()).defenders.map(({ mode }) => mode))].sort())
      .toEqual(['air', 'ground']);
    await tap('spell:lightning');
    const before = await read();
    expect(before.remaining).toBe(1);
    expect(before.defenders.every(({ hp }) => hp > 0)).toBe(true);
    await tapField(18.8, 19);
    await expect.poll(async () => (await read()).remaining).toBe(0);
    const { cast } = await read();
    expect(cast).toBeDefined();
    const [castle, cannon] = before.buildings;
    const footprintDistance = (building, size) =>
      Math.hypot(
        Math.max(building.x - cast.x, cast.x - building.x - size, 0),
        Math.max(building.y - cast.y, cast.y - building.y - size, 0),
      );
    expect(footprintDistance(castle, 3)).toBeLessThan(pinned.radius);
    expect(footprintDistance(cannon, 3)).toBeGreaterThan(pinned.radius);
    await shot('01-cast');
    await expect.poll(async () => (await read()).at).toBeGreaterThan(cast.firstHit + 0.05);
    const after = await read();
    const byId = (state, id) => state.defenders.find((defender) => defender.id === id);
    const hit = before.defenders.filter(({ id }) => {
      const target = byId(after, id);
      return target?.hp === 0 && Math.hypot(target.x - cast.x, target.y - cast.y) <= pinned.radius;
    });
    expect([...new Set(hit.map(({ mode }) => mode))].sort()).toEqual(['air', 'ground']);
    expect(after.buildings).toEqual(before.buildings);
    await shot('02-after');

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
    const duration = Number(await slider.getAttribute('max'));
    const completed = await seek(duration);
    const scouting = completed.replay.time - completed.at;
    const pending = await seek(scouting + (before.at + cast.firstHit) / 2);
    for (const { id, hp } of hit) expect(byId(pending, id)?.hp).toBe(hp);
    expect(pending.buildings).toEqual(before.buildings);
    const end = await seek(duration);
    expect(end.remaining).toBe(0);
    for (const { id } of hit) expect(byId(end, id)?.hp).toBe(0);
    expect(end.buildings).toEqual(before.buildings);
    await shot('03-replay');
    console.log(JSON.stringify({ pinned, hit, castle, cannon, replay: end.replay }, null, 2));
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
