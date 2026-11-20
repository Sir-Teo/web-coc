// Exercise the packaged touch and replay paths. The local QA hook only reads scene/model state.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const direct = process.argv.includes('--direct');
const artifacts = `output/rea-cloud-playtest/revive-${direct ? 'direct' : 'edge'}`;
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
  const { defaultSpellLevels, emptyArmy, emptySpells } =
    await modules.ssrLoadModule('/src/game/army.ts');
  const { nativeRow, num, seconds } = await modules.ssrLoadModule('/src/game/native-data.ts');
  const row = nativeRow('spells', 'Revive', 5);
  pinned = {
    radius: num(row, 'TargetingRadius') / 100,
    health: num(row, 'ResurrectHitpointPercentage') / 100,
    delay:
      seconds(row, 'DeployTimeMS') + seconds(row, 'ChargingTimeMS') + seconds(row, 'HitTimeMS'),
  };
  expect(pinned).toMatchObject({ radius: 8, health: 0.8 });
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = new GameModel(initialSave());
  fixture.state.buildings = [
    makeBuilding(1, 'townhall', 33, 33, 18),
    makeBuilding(2, 'cannon', 18, 18, 21),
    makeBuilding(5, 'barracks', 35, 28, 4),
    makeBuilding(6, 'camp', 27, 35, 6),
    makeBuilding(7, 'spellfactory', 29, 28, 8),
    makeBuilding(8, 'builder', 37, 33, 1),
    makeBuilding(9, 'herohall', 21, 32, 3),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.army = emptyArmy();
  fixture.state.spells = emptySpells();
  fixture.state.heroes = { queen: { level: 1 } };
  fixture.state.heroLineup = ['queen'];
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.state.settings.manualHeroAbilities = true;
  fixture.state.spellLevels = { ...defaultSpellLevels(), revive: 5, freeze: 8 };
  fixture.train('giant');
  fixture.brew('revive', 2);
  fixture.brew('freeze');
  expect(fixture.state.army.giant).toBe(1);
  expect(fixture.state.spells.revive).toBe(2);
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
        const queen = battle.units.find((unit) => unit.hero === 'queen');
        const king = battle.units.find((unit) => unit.hero === 'king');
        const cast = battle.nativeSpells?.findLast((cast) => cast.name === 'Revive');
        return {
          at: battle.elapsed,
          kingHp: king?.hp,
          queen: queen && {
            id: queen.id,
            x: queen.x,
            y: queen.y,
            hp: queen.hp,
            maxHp: queen.maxHp,
          },
          cast: cast && {
            id: cast.id,
            x: cast.x,
            y: cast.y,
            firstHit: cast.firstHit,
            target: cast.reviveTargetId,
          },
          remaining: battle.spells.revive,
          replay,
        };
      });
    const saveShot = (name) =>
      page.screenshot({ path: `${artifacts}/${name}.png`, animations: 'disabled' });
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await tap('hero-select:queen');
    await tapField(13, 18, true);
    await expect
      .poll(async () => (await read()).queen?.hp, { timeout: 40000 })
      .toBeLessThanOrEqual(0);
    const fallen = (await read()).queen;
    await saveShot('01-fallen');
    const distance = ({ x, y }) => Math.hypot(x - fallen.x, y - fallen.y);
    let beforeRevival, boundary;
    if (direct) {
      await tap('hero-select:king');
      await tapField(13, 20.5, true);
      await expect
        .poll(async () => (await read()).kingHp, { timeout: 40000 })
        .toBeLessThanOrEqual(0);
    } else {
      await tap('spell:revive');
      await tapField(fallen.x + pinned.radius + 0.5, fallen.y);
      boundary = await read();
      if (boundary.cast) expect(distance(boundary.cast)).toBeGreaterThan(pinned.radius);
      const missResolved = (boundary.cast?.firstHit ?? boundary.at + pinned.delay) + 0.1;
      await expect.poll(async () => (await read()).at).toBeGreaterThan(missResolved);
      expect((await read()).queen.hp).toBeLessThanOrEqual(0);
      await saveShot('02-outside-radius');
    }
    await tap('spell:freeze');
    await tapField(19.5, 19.5);
    if (
      !(await page
        .locator('[data-action="spell:revive"]')
        .evaluate((button) => button.classList.contains('selected')))
    )
      await tap('spell:revive');
    if (direct) {
      const queen = page.locator('[data-action="hero-select:queen"]');
      const king = page.locator('[data-action="hero-select:king"]');
      await expect(queen).toHaveAccessibleName(/Revive Queen/);
      await expect(king).toHaveAccessibleName(/Revive King/);
      await saveShot('02-two-eligible-heroes');
      beforeRevival = (await read()).at;
      await queen.tap();
    } else {
      beforeRevival = (await read()).at;
      await tapField(fallen.x + pinned.radius - 0.5, fallen.y);
    }
    const inside = await read();
    expect(distance(inside.cast)).toBeLessThan(pinned.radius);
    expect(inside.cast.id).not.toBe(boundary?.cast?.id);
    if (direct) {
      expect(inside.cast.target).toBe(fallen.id);
      expect(inside.remaining).toBe(1);
      await expect(page.locator('[data-action="hero-select:queen"]')).toHaveAccessibleName(
        /Reviving/,
      );
    }
    await expect
      .poll(async () => (await read()).queen.hp)
      .toBeCloseTo(fallen.maxHp * pinned.health);
    const restored = await read();
    if (direct) expect(restored.kingHp).toBeLessThanOrEqual(0);
    await saveShot('03-restored');
    await expect.poll(async () => (await read()).at).toBeGreaterThan(inside.cast.firstHit + 0.7);
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
    expect(replayEnd.queen.hp).toBeCloseTo(restored.queen.hp);
    // Transport time includes the scouting interval; battle time begins at deployment.
    const scouting = replayEnd.replay.time - replayEnd.at;
    await seek(beforeRevival + scouting);
    const replayFallen = await read();
    expect(replayFallen.queen.hp).toBeLessThanOrEqual(0);
    if (direct) expect(replayFallen.kingHp).toBeLessThanOrEqual(0);
    await saveShot('04-replay-backward-fallen');
    await seek(end);
    const replayRestored = await read();
    expect(replayRestored.queen.hp).toBeCloseTo(restored.queen.hp);
    if (direct) expect(replayRestored.kingHp).toBeLessThanOrEqual(0);
    await saveShot('05-replay-forward-restored');
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({ pinned, boundary, inside, restored, replayFallen, replayRestored }, null, 2),
    );
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
