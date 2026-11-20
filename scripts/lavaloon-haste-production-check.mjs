import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const handoff = args.includes('--hound-handoff');
const baseline = args.find((arg) => !arg.startsWith('--'));
const artifacts = handoff
  ? 'output/rea-cloud-playtest/hound-handoff'
  : 'output/rea-cloud-playtest/lavaloon-haste';
await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { GameModel, initialSave, makeBuilding } =
    await modules.ssrLoadModule('/src/game/model.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const fixture = new GameModel(initialSave());
  Object.assign(fixture.state, {
    tutorial: true,
    obstacles: [],
    nextId: 100,
    buildings: [
      makeBuilding(1, 'townhall', 33, 33, 9),
      makeBuilding(2, 'goldstorage', 20, 19, 1),
      makeBuilding(3, 'airdefense', 21, 16, 1),
      ...(handoff
        ? [
            makeBuilding(12, 'seekingairmine', 16, 13, 2),
            makeBuilding(13, 'seekingairmine', 17, 13, 2),
            makeBuilding(14, 'seekingairmine', 18, 13, 2),
            makeBuilding(16, 'seekingairmine', 25, 16, 2),
            { ...makeBuilding(15, 'skeletontrap', 21, 14, 1), skeletonMode: 'air' },
          ]
        : []),
      makeBuilding(8, 'cannon', 17, 16, 1),
      makeBuilding(9, 'darkbarracks', 35, 26, 6),
      makeBuilding(10, 'darkspellfactory', 30, 36, 3),
      makeBuilding(4, 'camp', 29, 29, 5),
      makeBuilding(11, 'camp', 23, 29, 5),
      makeBuilding(5, 'barracks', 28, 24, 8),
      makeBuilding(6, 'builder', 37, 33),
    ],
    army: emptyArmy(),
    spells: emptySpells(),
  });
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.train('lavahound');
  fixture.train('balloon', 5);
  fixture.train('balloon', 3);
  fixture.train('minion', 4);
  fixture.brew('haste');
  expect(fixture.state.army).toMatchObject({ lavahound: 1, balloon: 8, minion: 4 });
  expect(fixture.state.spells.haste).toBe(1);
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
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
    await page.waitForFunction(() => window.qa?.scene.ready);
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = (name) =>
      page.screenshot({
        animations: 'disabled',
        path: `${artifacts}/${baseline ? 'baseline' : 'patched'}-${name}.png`,
      });

    await page.locator('.train-add').tap();
    await expect(page.locator('.drawer-sheet')).toContainText('Lava Hound');
    await expect(page.locator('.drawer-sheet')).toContainText('Haste');
    await shot('army');
    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await page.waitForFunction(() => {
      const { scene } = window.qa;
      return (
        !scene.battleArtPending() &&
        ['lavahound', 'balloon', 'minion'].every(
          (kind) => scene.troopNativePresentation.levelsReady.get(kind)?.size > 0,
        )
      );
    });
    const tapField = async (x, y, deploy = false) => {
      const point = await page.evaluate(
        ({ x, y, deploy }) => {
          const { scene, model } = window.qa;
          const screen = scene.screenFor(x, y);
          if (deploy && model.deployBlocked(x, y)) throw Error('Placement is blocked');
          if (document.elementFromPoint(screen.x, screen.y) !== scene.game.canvas)
            throw Error(`Field point occluded at ${JSON.stringify(screen)}`);
          return screen;
        },
        { x, y, deploy },
      );
      await page.touchscreen.tap(point.x, point.y);
    };
    const framing = await page.evaluate(() => {
      const { scene } = window.qa;
      scene.paused = true;
      const camera = scene.cameras.main;
      const p = scene.screenFor(21, 21);
      const canvas = scene.canvasPoint(p.x, p.y);
      const anchor = camera.getWorldPoint(canvas.x, canvas.y);
      camera.useBounds = false;
      camera.setZoom(0.72).centerOn(anchor.x, anchor.y);
      return { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom };
    });

    const stepUntil = (mode) =>
      page.evaluate((mode) => {
        const { model, scene } = window.qa;
        const b = model.battle;
        const done = () => {
          if (mode === 'pup-air-attack')
            return b.projectiles?.some(
              (p) =>
                p.native?.kind === 'lavapup' &&
                !p.targetBuilding &&
                b.defenders?.some((d) => d.id === p.targetId && d.mode === 'air'),
            );
          if (mode === 'pups') return b.units.some((u) => u.kind === 'lavapup');
          if (mode === 'cast') return b.units.some((u) => u.native?.effects?.boost);
          if (mode === 'contact') return b.buildings.find((v) => v.id === 3).hp < 800;
          return b.finished;
        };
        for (let i = 0; i < 4000 && !done() && !b.finished; i++) model.step(0.05);
        if (!done()) throw Error(`Unreached phase: ${mode}`);
        scene.sync();
        scene.drawOverlay(0);
      }, mode);
    const read = () =>
      page.evaluate(() => {
        const { battle } = window.qa.model;
        return {
          at: battle.elapsed,
          units: battle.units.map((u) => ({
            id: u.id,
            kind: u.kind,
            level: u.level,
            owner: u.native?.owner,
            defenderTarget: u.defenderTarget,
            target: u.target,
            x: u.x,
            y: u.y,
            hp: u.hp,
            speed: u.native?.effects?.boost?.speed ?? 0,
            damage: u.native?.effects?.boost?.damage ?? 0,
          })),
          buildings: battle.buildings.map(({ id, hp }) => ({ id, hp })),
          remaining: battle.remaining,
          destruction: battle.destruction,
          traps: battle.traps,
          finished: battle.finished,
        };
      });
    await shot('scout');
    await tap('troop:lavahound');
    await tapField(13.5, 14, true);
    let transition, airAttack;
    if (handoff) {
      await stepUntil('pups');
      transition = await read();
      const hound = transition.units.find(({ kind }) => kind === 'lavahound');
      expect(hound.hp).toBeLessThanOrEqual(0);
      const pups = transition.units.filter(({ kind }) => kind === 'lavapup');
      expect(pups.every(({ owner }) => owner === hound.id)).toBe(true);
      expect(pups).toHaveLength(8);
      expect(pups.every(({ level, hp }) => level === 1 && hp === 50)).toBe(true);
      await shot('pup-handoff');
      await stepUntil('pup-air-attack');
      airAttack = await read();
      expect([12, 13, 14].map((id) => airAttack.traps[id].targetId)).toEqual(
        Array(3).fill(hound.id),
      );
      expect(airAttack.traps[16]).toBeUndefined();
      expect(
        airAttack.units.some(
          ({ kind, hp, x, y }) =>
            kind === 'lavapup' && hp > 0 && Math.hypot(x - 25.5, y - 16.5) < 4,
        ),
      ).toBe(true);
      await shot('pup-air-attack');
      // Separate the checkpoint from the next recorded inputs, which run at the same tick otherwise.
      await page.evaluate(() => window.qa.model.step(0.05));
    }
    await tap('troop:balloon');
    for (let i = 0; i < 8; i++) await tapField(13.5, 16 + i * 0.15, true);
    if (!handoff) {
      await tap('spell:haste');
      await tapField(16, 16);
      await stepUntil('cast');
    }
    const cast = await read();
    expect(cast.units.filter((u) => u.kind === 'balloon')).toHaveLength(8);
    if (!handoff) {
      for (const unit of cast.units.filter(({ hp }) => hp > 0)) {
        expect(unit.speed).toBe(baseline ? 1.75 : 3.5);
        expect(unit.damage).toBe(0);
        expect(unit.target).toBe(unit.kind === 'lavahound' ? 3 : 8);
      }
      await shot('haste');
    }
    await stepUntil('contact');
    const contact = await read();
    expect(contact.buildings.find(({ id }) => id === 3).hp).toBeLessThan(800);
    await shot('defense-contact');
    await tap('troop:minion');
    for (let i = 0; i < 4; i++) await tapField(13.5, 19 + i * 0.15, true);
    await stepUntil('finish');
    const result = await read();
    expect(result.destruction).toBe(100);
    expect(result.remaining.minion).toBe(0);
    await shot('results');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const seek = (at) =>
      page.evaluate(
        ({ at, framing }) => {
          const { model, scene } = window.qa;
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          scene.sync();
          const camera = scene.cameras.main;
          camera.useBounds = false;
          camera.setZoom(framing.zoom).setScroll(framing.x, framing.y);
          scene.drawOverlay(0);
        },
        { at, framing },
      );
    const recording = await page.evaluate(() => {
      const { replay, state } = window.qa.model;
      return { duration: replay.duration, version: state.raidLog[0].replay.version };
    });
    expect(recording.version).toBe(baseline && !handoff ? 274 : 275);
    await seek(recording.duration);
    const final = await read();
    expect(final.buildings).toEqual(result.buildings);
    expect(final.units).toEqual(result.units);
    const scout = recording.duration - final.at;
    const checkpoint = transition ?? cast;
    if (handoff) {
      await seek(scout + checkpoint.at - 0.05);
      expect((await read()).units.some(({ kind }) => kind === 'lavapup')).toBe(false);
    }
    await seek(scout + checkpoint.at);
    expect(await read()).toEqual(checkpoint);
    await shot(handoff ? 'replay-pup-handoff' : 'replay-haste');
    if (airAttack) {
      await seek(scout + airAttack.at);
      expect(await read()).toEqual(airAttack);
    }
    await seek(recording.duration);
    expect(await read()).toEqual(final);
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        baseline: !!baseline,
        ...(transition
          ? { handoffAt: transition.at, pups: 8 }
          : { speedBonus: cast.units.find(({ kind }) => kind === 'lavahound').speed }),
        firstAirDefenseDamageAt: contact.at,
        fullClearAt: final.at,
        recording,
      }),
    );
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
