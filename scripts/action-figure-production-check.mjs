// Touch-play Action Figure and a Queen loadout without the item.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const args = process.argv.slice(2);
const baselineDist = args.find((arg) => !arg.startsWith('--'));
const control = args.includes('--control');
const rage = args.includes('--rage');
const healers = args.includes('--healer-formation');
const mirrorExpiry = args.includes('--mirror-expiry');
const mirror = mirrorExpiry || args.includes('--mirror-formation');
const label = `${baselineDist ? 'baseline' : 'patched'}${control ? '-control' : ''}`;
const item = mirror
  ? 'magic-mirror'
  : healers
    ? 'healer-puppet'
    : control
      ? 'archer-puppet'
      : 'action-figure';
const screenshots = `output/rea-cloud-playtest/${mirrorExpiry ? 'magic-mirror-expiry' : mirror ? 'magic-mirror-formation' : healers ? 'healer-puppet-formation' : rage ? 'giant-giant-rage' : 'action-figure'}`;
await mkdir(screenshots, { recursive: true });

const modules = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { GameModel, initialSave, makeBuilding } =
    await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const model = new GameModel(initialSave());
  Object.assign(model.state, {
    tutorial: true,
    obstacles: [],
    nextId: 100,
    buildings: [
      makeBuilding(1, 'townhall', mirrorExpiry ? 42 : 34, mirrorExpiry ? 42 : 31, 16),
      ...(mirrorExpiry
        ? [
            makeBuilding(12, 'goldstorage', 18, 24, 16),
            makeBuilding(13, 'goldstorage', 21, 25, 16),
            makeBuilding(14, 'goldstorage', 24, 25, 16),
            makeBuilding(15, 'elixirstorage', 24, 22, 16),
            makeBuilding(16, 'elixirstorage', 24, 19, 16),
            makeBuilding(17, 'elixirstorage', 27, 23, 16),
            makeBuilding(18, 'elixirstorage', 27, 20, 16),
          ]
        : []),
      mirrorExpiry
        ? makeBuilding(2, 'goldstorage', 21, 21, 16)
        : makeBuilding(2, 'cannon', 21, 21, rage ? 4 : 8),
      ...(rage
        ? [makeBuilding(10, 'giantbomb', 17, 18, 1), makeBuilding(11, 'giantbomb', 19, 18, 3)]
        : []),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 10),
      makeBuilding(6, 'herohall', 34, 39, 8),
      makeBuilding(7, 'spellfactory', 30, 36, 6),
      makeBuilding(8, 'blacksmith', 35, 27, 7),
    ],
    army: { ...emptyArmy(), giant: 1 },
    spells: emptySpells(),
    heroes: { queen: { level: 20 } },
    heroLineup: ['queen'],
    gear: { levels: { [item]: healers || mirror ? 18 : 1 }, loadouts: { queen: [item] } },
  });
  model.brew('freeze');
  expect(model.state.spells.freeze).toBe(1);
  model.state.settings.sound = false;
  model.state.settings.music = false;
  model.state.settings.manualHeroAbilities = true;
  expect(validateSave(model.state)).toBe(true);
  save = JSON.stringify(model.state);
} finally {
  await modules.close();
}

const server = await preview({
  ...(baselineDist ? { build: { outDir: baselineDist } } : {}),
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
    await page.addInitScript((fixture) => {
      if (!localStorage.getItem('crown-clan-save-v1'))
        localStorage.setItem('crown-clan-save-v1', fixture);
    }, save);
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await page.waitForFunction(() => window.qa?.scene.ready);
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = (name) =>
      page.screenshot({ path: `${screenshots}/${label}-${name}.png`, animations: 'disabled' });
    const fieldTap = async (x, y, deploy) => {
      const point = await page.evaluate(
        ({ x, y, deploy }) => {
          const { model, scene } = window.qa;
          const point = scene.screenFor(x, y);
          const grid = scene.gridAtScreen(Math.round(point.x), Math.round(point.y));
          if (deploy && model.deployBlocked(grid.x, grid.y)) throw Error('Blocked deployment');
          if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
            throw Error(`Field point is occluded at ${JSON.stringify(point)}`);
          return { x: point.x, y: point.y };
        },
        { x, y, deploy },
      );
      await page.touchscreen.tap(point.x, point.y);
    };
    const read = () =>
      page.evaluate(() => {
        const b = window.qa.model.battle;
        return {
          at: b.elapsed,
          defenseHp: b.buildings.find(({ id }) => id === 2).hp,
          buildingHp: b.buildings.reduce((sum, { hp }) => sum + hp, 0),
          units: b.units.map(({ id, kind, x, y, level, hp, maxHp, native, spent, defeatedAt }) => ({
            id,
            kind,
            x,
            y,
            level,
            hp,
            maxHp,
            owner: native?.owner,
            damageTaken: native?.damageTaken,
            boost: native?.effects?.boost,
            expiresAt: native?.mirrorExpiresAt,
            spent,
            defeatedAt,
          })),
          target: b.defenseTargets[2],
          remainingFreeze: b.spells.freeze,
        };
      });
    const step = (ticks) =>
      page.evaluate((ticks) => {
        const { model, scene } = window.qa;
        for (let i = 0; i < ticks; i++) model.step(0.05);
        scene.sync();
        scene.drawOverlay(0);
      }, ticks);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.locator('.train-add').tap();
    await expect(page.locator('[data-army-count="spell:freeze"]')).toHaveText('1');
    await page.locator('.modern-army-actions [data-action="heroes"]').tap();
    const queen = page.locator('.hero-section[data-hero="queen"]');
    await queen
      .getByRole('heading', {
        name: mirror
          ? 'Magic Mirror'
          : healers
            ? 'Healer Puppet'
            : control
              ? 'Archer Puppet'
              : 'Action Figure',
      })
      .scrollIntoViewIfNeeded();
    await shot('equipment');
    await page.locator('.modal [data-action="close"]').tap();
    await tap('close-drawer');
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    const cameraPose = await page.evaluate(() => {
      const { scene } = window.qa;
      scene.paused = true;
      const camera = scene.cameras.main;
      const point = scene.screenFor(16, 16);
      const canvas = scene.canvasPoint(point.x, point.y);
      const anchor = camera.getWorldPoint(canvas.x, canvas.y);
      camera.useBounds = false;
      camera.setZoom(0.66).centerOn(anchor.x, anchor.y);
      return { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom };
    });
    await tap('hero-select:queen');
    await fieldTap(14, 17, true);
    await step(12);
    const before = await read();
    expect(before.units).toHaveLength(1);
    await step(1);
    await tap('hero-select:queen');
    const summons = await read();
    const giant = summons.units.find(({ kind }) => kind === 'giantgiant');
    const queenUnit = summons.units.find(({ kind }) => kind === 'archerqueen');
    if ((baselineDist && !rage) || control || healers || mirror) expect(giant).toBeUndefined();
    else {
      expect(giant).toMatchObject({ level: 1, maxHp: 800, owner: queenUnit.id });
      expect(giant.x).toBeGreaterThan(queenUnit.x);
      expect(giant.y).toBeGreaterThan(queenUnit.y);
    }
    if (control) expect(summons.units.some(({ kind }) => kind === 'archer')).toBe(true);
    const formation = summons.units.filter(({ kind, owner }) =>
      mirror ? kind === 'archerqueen' && owner === queenUnit.id : kind === 'healer',
    );
    if (mirror) {
      expect(formation).toHaveLength(2);
      if (baselineDist && !mirrorExpiry)
        expect(
          formation.every(({ x, y }) => Math.hypot(x - queenUnit.x, y - queenUnit.y) < 0.4),
        ).toBe(true);
      else {
        expect(new Set(formation.map(({ x, y }) => `${x},${y}`)).size).toBe(2);
        for (const { x, y } of formation)
          expect(
            (x - queenUnit.x) * (22.5 - queenUnit.x) + (y - queenUnit.y) * (22.5 - queenUnit.y),
          ).toBeLessThan(0);
      }
    }
    if (healers) {
      expect(formation.map(({ level }) => level)).toEqual([8, 8, 8]);
      if (baselineDist)
        expect(formation.every(({ x, y }) => x === queenUnit.x && y === queenUnit.y)).toBe(true);
      else {
        expect(new Set(formation.map(({ x, y }) => `${x},${y}`)).size).toBe(3);
        for (const { x, y } of formation)
          expect(
            (x - queenUnit.x) * (22.5 - queenUnit.x) + (y - queenUnit.y) * (22.5 - queenUnit.y),
          ).toBeLessThan(0);
      }
    }
    await step(5);
    if (giant) {
      await page.waitForFunction((id) => {
        const { scene } = window.qa;
        scene.drawOverlay(0);
        return scene.unitSprites.get(id)?.texture.key === 'giant-giant-portrait';
      }, giant.id);
    }
    const after = await read();
    await shot('activation');
    let damaged;
    if (rage) {
      await page.evaluate(() => {
        const { model, scene } = window.qa;
        const giant = model.battle.units.find(({ kind }) => kind === 'giantgiant');
        for (let i = 0; i < 240 && (giant.native.damageTaken ?? 0) < 400 && giant.hp > 0; i++)
          model.step(0.05);
        scene.sync();
        scene.drawOverlay(0);
      });
      damaged = await read();
      const unit = damaged.units.find(({ kind }) => kind === 'giantgiant');
      expect(unit.damageTaken).toBeGreaterThanOrEqual(400);
      expect(unit.hp).toBeGreaterThan(0);
      expect(damaged.units.find(({ kind }) => kind === 'archerqueen').boost).toBeUndefined();
      if (baselineDist) expect(unit.boost).toBeUndefined();
      else {
        expect(unit.boost).toMatchObject({ damage: 0.5, speed: 1.5 });
        expect(unit.boost.until - damaged.at).toBeGreaterThan(19.9);
      }
      await shot('threshold');
    }
    await step(1);
    await tap('spell:freeze');
    await fieldTap(21.7, 21.7, false);
    await step(65);
    const live = await read();
    expect(live.remainingFreeze).toBe(0);
    expect(live.buildingHp).toBeLessThan(before.buildingHp);
    expect(live.units.filter(({ kind }) => kind === 'giantgiant')).toHaveLength(giant ? 1 : 0);
    await shot('defense-contact');
    const expiryFrames = [];
    let expiryCamera;
    const frameCamera = async (x, y) =>
      page.evaluate(
        ({ x, y }) => {
          const { scene } = window.qa;
          const camera = scene.cameras.main;
          const screen = scene.screenFor(x, y);
          const canvas = scene.canvasPoint(screen.x, screen.y);
          const world = camera.getWorldPoint(canvas.x, canvas.y);
          camera.centerOn(world.x, world.y);
          scene.drawOverlay(0);
          return { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom };
        },
        { x, y },
      );
    if (mirrorExpiry) {
      const expiresAt = summons.at + 25;
      const copies = (frame) => frame.units.filter(({ owner }) => owner === queenUnit.id);
      await step(Math.floor((expiresAt - live.at - 0.06) / 0.05));
      const beforeExpiry = await read();
      expect(copies(beforeExpiry)).toHaveLength(2);
      expect(copies(beforeExpiry).every(({ hp }) => hp > 0)).toBe(true);
      const queenAtExpiry = beforeExpiry.units.find(({ id }) => id === queenUnit.id);
      expiryCamera = await frameCamera(queenAtExpiry.x, queenAtExpiry.y);
      await shot('before-expiry');
      await step(40);
      const afterExpiry = await read();
      expect(afterExpiry.at).toBeGreaterThan(expiresAt);
      expect(afterExpiry.units.find(({ id }) => id === queenUnit.id).hp).toBeGreaterThan(0);
      for (const clone of copies(afterExpiry)) {
        if (baselineDist) expect(clone.hp).toBeGreaterThan(0);
        else expect(clone).toMatchObject({ hp: 0, spent: true, defeatedAt: expiresAt });
      }
      expiryFrames.push(beforeExpiry, afterExpiry);
      await shot('after-expiry');
    }
    await step(1);
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const seek = (at, pose = cameraPose) =>
      page.evaluate(
        ({ at, cameraPose }) => {
          const { model, scene } = window.qa;
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          scene.sync();
          scene.cameras.main.useBounds = false;
          scene.cameras.main.setZoom(cameraPose.zoom).setScroll(cameraPose.x, cameraPose.y);
          scene.drawOverlay(0);
        },
        { at, cameraPose: pose },
      );
    const duration = await page.evaluate(() => window.qa.model.replay.duration);
    await seek(duration);
    const scout = duration - (await read()).at;
    for (const frame of [
      ...expiryFrames.slice().reverse(),
      live,
      before,
      after,
      ...expiryFrames,
      ...(damaged ? [damaged] : []),
    ]) {
      await seek(scout + frame.at, expiryFrames.includes(frame) ? expiryCamera : cameraPose);
      expect(await read()).toEqual(frame);
    }
    if (healers) {
      await page.waitForFunction(() => {
        const { model, scene } = window.qa;
        scene.drawOverlay(0);
        const units = model.battle.units.filter(({ kind }) => kind === 'healer');
        return (
          units.length === 3 && units.every(({ id }) => scene.troopNativePresentation.drewUnit(id))
        );
      });
    }
    await shot(mirrorExpiry ? 'replay-after-expiry' : 'replay-activation');
    if (healers) {
      await seek(scout + live.at);
      expect(await read()).toEqual(live);
      await shot('replay-defense-contact');
    }
    expect(errors).toEqual([]);
    console.log({
      label,
      summon: giant,
      archers: summons.units.filter(({ kind }) => kind === 'archer').length,
      ...(healers || mirror ? { formation } : {}),
      defenseHp: live.defenseHp,
      ...(damaged
        ? { thresholdFrame: damaged.units.find(({ kind }) => kind === 'giantgiant') }
        : {}),
    });
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
