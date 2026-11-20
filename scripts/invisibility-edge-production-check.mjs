// Exercise the packaged touch and replay paths. The local QA hook only reads scene/model state.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const artifacts = 'output/rea-cloud-playtest/invisibility-edge';
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
  const row = nativeRow('spells', 'Invisibility', 1);
  pinned = {
    radius: num(row, 'Radius') / 100,
    grants: num(row, 'NumberOfHits'),
    interval: seconds(row, 'TimeBetweenHitsMS'),
    linger: seconds(row, 'InvisibilityTime'),
  };
  expect(flag(row, 'ImmunityWalls')).toBe(true);
  expect(flag(row, 'ImmunitySiegeMachines')).toBe(true);
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = new GameModel(initialSave());
  fixture.state.buildings = [
    makeBuilding(1, 'townhall', 33, 33, 11),
    makeBuilding(2, 'cannon', 14, 18, 1),
    makeBuilding(3, 'cannon', 25, 18, 1),
    makeBuilding(4, 'wall', 20, 19, 1),
    makeBuilding(5, 'barracks', 35, 28, 4),
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
  fixture.brew('invisibility');
  expect(fixture.state.army.giant).toBe(1);
  expect(fixture.state.spells.invisibility).toBe(1);
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
        const grant = (id) => battle.buildingEffects?.[id]?.invisibleUntil ?? 0;
        const spell = battle.nativeSpells?.find((cast) => cast.name === 'Invisibility');
        return {
          at: battle.elapsed,
          target: battle.units.find((unit) => unit.kind === 'giant')?.target,
          near: grant(2),
          outside: grant(3),
          wall: grant(4),
          cast: spell && {
            firstHit: spell.firstHit,
            x: spell.x,
            y: spell.y,
            interval: spell.interval,
            total: spell.total,
          },
          remaining: battle.spells.invisibility,
          replay,
        };
      });
    const saveShot = (name) =>
      page.screenshot({ path: `${artifacts}/${name}.png`, animations: 'disabled' });
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await tap('troop:giant');
    await tapField(11.5, 19.5, true);
    await expect.poll(async () => (await read()).target).toBe(2);
    await saveShot('01-before-cast');
    await tap('spell:invisibility');
    await tapField(20.5, 19.5);
    await expect.poll(async () => (await read()).target).toBe(3);
    const hidden = await read();
    expect(hidden.cast.y).toBeGreaterThan(18);
    expect(hidden.cast.y).toBeLessThan(21);
    expect(hidden.cast.x - 17).toBeLessThan(pinned.radius);
    expect(25 - hidden.cast.x).toBeGreaterThan(pinned.radius);
    expect(hidden.cast).toMatchObject({ total: pinned.grants, interval: pinned.interval });
    expect(hidden.remaining).toBe(0);
    const deadline = hidden.cast.firstHit + (pinned.grants - 1) * pinned.interval + pinned.linger;
    expect(hidden.near).toBeGreaterThan(hidden.at);
    expect(hidden.outside).toBe(0);
    expect(hidden.wall).toBe(0);
    await saveShot('02-concealed-and-retargeted');
    await expect
      .poll(async () => {
        const s = await read();
        return s.at >= deadline + 0.7;
      })
      .toBe(true);
    const revealed = await read();
    expect(revealed.near).toBeCloseTo(deadline, 8);
    expect(revealed.near).toBeGreaterThan(hidden.near);
    expect([2, 3]).toContain(revealed.target);
    await saveShot('03-revealed');
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await tap('replay-pause');
    const slider = page.getByRole('slider', { name: 'Replay position' });
    const seek = async (time) => {
      await expect(slider).toBeEnabled();
      const { width, height, duration } = await slider.evaluate((element) => ({
        width: element.offsetWidth,
        height: element.offsetHeight,
        duration: Number(element.max),
      }));
      // Chromium's range thumb travels between its inset end positions.
      await slider.tap({ position: { x: 8 + ((width - 16) * time) / duration, y: height / 2 } });
      await expect
        .poll(async () => {
          const { replay } = await read();
          return !replay.seeking && Math.abs(replay.time - time) < 0.3;
        })
        .toBe(true);
    };
    const end = Number(await slider.getAttribute('max'));
    await seek(end);
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replayEnd = await read();
    expect(replayEnd.at).toBeGreaterThanOrEqual(deadline);
    expect(replayEnd.target).toBe(revealed.target);
    // The transport includes scouting, but the cast timestamps use the battle clock.
    const scouting = replayEnd.replay.time - replayEnd.at;
    await seek(hidden.cast.firstHit + 1.1 + scouting);
    const replayHidden = await read();
    expect(replayHidden.near).toBeGreaterThan(replayHidden.at);
    expect(replayHidden.target).toBe(3);
    await saveShot('04-replay-backward-concealed');
    await seek(end);
    const replayRevealed = await read();
    expect(replayRevealed.at).toBeGreaterThanOrEqual(replayRevealed.near);
    expect(replayRevealed.target).toBe(revealed.target);
    await saveShot('05-replay-forward-revealed');
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({ pinned, hidden, revealed, replayHidden, replayRevealed }, null, 2),
    );
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
