// Exercise the packaged touch and replay paths. The local QA hook only reads scene/model state.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv[2];
const artifacts = 'output/rea-cloud-playtest/battle-drill';
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
  const row = nativeRow('characters', 'Battle Drill', 1);
  const surface = nativeRow('spells', 'DrillerSurfacing', 1);
  pinned = {
    underground: flag(row, 'IsUnderground'),
    cadence: seconds(row, 'AttackSpeed'),
    radius: num(surface, 'Radius') / 100,
    stun: seconds(surface, 'StunTimeMS'),
  };
  expect(pinned).toEqual({ underground: true, cadence: 1.7, radius: 1.5, stun: 2 });
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = new GameModel(initialSave());
  fixture.state.buildings = [
    makeBuilding(1, 'townhall', 33, 33, 15),
    makeBuilding(2, 'cannon', 18, 18, 1),
    makeBuilding(3, 'cannon', 24, 18, 1),
    makeBuilding(4, 'workshop', 29, 28, 7),
    makeBuilding(5, 'builder', 37, 33, 1),
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

const server = await preview({
  ...(baseline ? { build: { outDir: baseline } } : {}),
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
        const drill = battle.units.find(({ kind }) => kind === 'battledrill');
        return {
          at: battle.elapsed,
          drill: drill && {
            id: drill.id,
            burrowed: drill.native?.burrowed,
            surfaced: drill.native?.surfaced,
            target: drill.native?.attackWindup?.target?.id,
          },
          defenses: battle.buildings
            .filter(({ id }) => id === 2 || id === 3)
            .map(({ id, hp }) => ({ hp, stun: battle.defenseStuns[id] ?? 0 })),
          replay,
        };
      });
    const shot = (name) =>
      page.screenshot({ path: `${artifacts}/${baseline ? 'baseline' : 'patched'}-${name}.png` });
    const capture = async (label, condition) => {
      let state;
      await expect
        .poll(
          async () => {
            state = await read();
            return !!state.drill && condition(state);
          },
          { intervals: [30, 50, 100] },
        )
        .toBe(true);
      await shot(label);
      return state;
    };
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await tap('troop:battledrill');
    await tapField(18.5, 13, true);
    const approach = await capture('01-approach', ({ drill }) => drill.burrowed);
    // Freeze before the encounter so screenshot time cannot overshoot the contact tick.
    await page.evaluate(() => {
      const { model, scene } = window.qa;
      scene.paused = true;
      for (let i = 0; i < 80 && !(model.battle.defenseStuns[2] > model.battle.elapsed); i++) {
        model.step(0.05);
        scene.drawOverlay(0);
      }
    });
    const first = await capture(
      '02-first-surface',
      ({ at, drill, defenses }) =>
        drill.surfaced && drill.target === 2 && defenses[0].stun > at && defenses[0].hp > 0,
    );
    expect(first.defenses[0].stun - first.at).toBeGreaterThan(pinned.stun - 0.4);
    expect(first.defenses[0].stun - first.at).toBeLessThanOrEqual(pinned.stun + 0.05);
    expect(first.defenses[1].stun).toBe(0);
    const pose = () =>
      page.evaluate(() => {
        const { model, scene } = window.qa;
        const drill = model.battle.units.find((u) => u.kind === 'battledrill');
        const owned = scene.troopNativePresentation.views.get(drill?.id);
        const sample = owned?.sample;
        return {
          at: model.battle.elapsed,
          state: owned?.state,
          frame: sample?.frame,
          mirror: sample?.mirror,
          take: sample?.name,
          x: owned?.x,
          y: owned?.y,
        };
      });
    // Lock the scene on the exact hit tick; the deployment and all UI actions use touch.
    await page.evaluate(() => {
      const { model, scene } = window.qa;
      scene.paused = true;
      const cannon = model.battle.buildings.find((b) => b.id === 2);
      if (cannon.hp <= 0) throw Error('Missed the live contact tick');
      for (let i = 0; i < 40 && cannon.hp > 0; i++) {
        model.step(0.05);
        scene.drawOverlay(0);
      }
    });
    const liveStrike = await pose();
    expect(liveStrike).toMatchObject({ state: 'attack', frame: 3, mirror: -1 });
    await shot('02b-live-lethal-strike');
    await page.evaluate(() => {
      window.qa.scene.paused = false;
    });

    const transit = await capture(
      '03-reburrow',
      ({ drill, defenses }) => drill.burrowed && defenses[0].hp === 0,
    );
    const second = await capture(
      '04-second-surface',
      ({ at, drill, defenses }) =>
        drill.surfaced && drill.target === 3 && defenses[1].stun > at && defenses[1].hp > 0,
    );
    expect(second.defenses[1].stun - second.at).toBeGreaterThan(pinned.stun - 0.4);
    expect(second.defenses[1].stun - second.at).toBeLessThanOrEqual(pinned.stun + 0.05);
    expect(second.drill.id).toBe(approach.drill.id);
    expect(transit.drill.id).toBe(approach.drill.id);
    await expect.poll(async () => (await read()).defenses.map(({ hp }) => hp)).toEqual([0, 0]);
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
    expect(completed.defenses.map(({ hp }) => hp)).toEqual([0, 0]);
    const replayFirst = await seek(scouting + first.at + 0.3);
    expect(replayFirst.drill).toMatchObject({ id: first.drill.id, surfaced: true, target: 2 });
    expect(replayFirst.defenses[0].stun).toBe(first.defenses[0].stun);
    const replayTransit = await seek(scouting + (transit.at + second.at) / 2);
    expect(replayTransit.drill).toMatchObject({ id: transit.drill.id, burrowed: true });
    expect(replayTransit.defenses[0].hp).toBe(0);
    const replaySecond = await seek(scouting + second.at + 0.3);
    expect(replaySecond.drill).toMatchObject({ id: second.drill.id, surfaced: true, target: 3 });
    expect(replaySecond.defenses[1].stun).toBe(second.defenses[1].stun);
    await shot('05-replay-second-surface');
    // The touch slider has already exercised rewind. Seek to the exact recorded contact tick
    // so both screenshots sample the same frame rather than adjacent timeline pixels.
    await page.evaluate((time) => {
      const { model, scene } = window.qa;
      model.seekReplay(time);
      while (model.replay.seeking) model.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
    }, scouting + liveStrike.at);
    const replayStrike = await pose();
    expect(replayStrike).toMatchObject({
      state: liveStrike.state,
      frame: liveStrike.frame,
      mirror: baseline ? 1 : liveStrike.mirror,
    });
    expect(replayStrike.x).toBeCloseTo(liveStrike.x, 6);
    expect(replayStrike.y).toBeCloseTo(liveStrike.y, 6);
    if (!baseline) expect(replayStrike.take).toBe(liveStrike.take);
    await shot('06-replay-lethal-strike');

    console.log(
      JSON.stringify(
        { pinned, approach, first, transit, second, liveStrike, replayStrike },
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
