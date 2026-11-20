// Compare a Queen and her Greedy Raven through Recall and redeployment.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/greedy-raven-recall';
await mkdir(screenshots, { recursive: true });

const modules = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { GameModel, initialSave, makeBuilding } = await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const model = new GameModel(initialSave());
  Object.assign(model.state, {
    tutorial: true,
    obstacles: [],
    nextId: 100,
    buildings: [
      makeBuilding(1, 'townhall', 30, 30, 18),
      makeBuilding(2, 'goldstorage', 25, 20, 18),
      makeBuilding(3, 'pethouse', 34, 23, 12),
      makeBuilding(4, 'herohall', 27, 35, 12),
      makeBuilding(5, 'builder', 32, 36, 1),
      makeBuilding(6, 'spellfactory', 36, 33, 7),
    ],
    army: { ...emptyArmy(), archer: 1 },
    spells: { ...emptySpells(), recall: 1 },
    heroes: { queen: { level: 20 } },
    heroLineup: ['queen'],
    pets: { levels: { crow: 1 }, assigned: { queen: 'crow' } },
  });
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
    const shot = (name) => page.screenshot({ path: `${screenshots}/${label}-${name}.png` });
    const fieldTap = async (x, y, deploy) => {
      const point = await page.evaluate(({ x, y, deploy }) => {
        const { model, scene } = window.qa;
        const point = scene.screenFor(x, y);
        const grid = scene.gridAtScreen(Math.round(point.x), Math.round(point.y));
        if (deploy && model.deployBlocked(grid.x, grid.y)) throw Error('Blocked deployment');
        if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
          throw Error(`Field point is occluded at ${JSON.stringify(point)}`);
        return { x: point.x, y: point.y };
      }, { x, y, deploy });
      await page.touchscreen.tap(point.x, point.y);
    };
    const read = () =>
      page.evaluate(() => {
        const { battle, replay } = window.qa.model;
        const owner = battle.nativeHeroes.find(({ kind }) => kind === 'queen');
        const hero = battle.units.find(({ id }) => id === owner.unitId);
        return {
          at: battle.elapsed,
          hero: hero && { id: hero.id, hp: hero.hp, x: hero.x, y: hero.y },
          retainedHp: owner.recalledHp,
          abilityUsed: !!owner.abilityUsed,
          petId: owner.petId,
          ravens: battle.units.filter(({ kind }) => kind === 'greedyraven').map((u) => ({
            id: u.id, hp: u.hp, recalled: !!u.native.recalled, attacks: u.native.attacks ?? 0,
            target: u.target,
          })),
          replay: replay && { time: replay.time, complete: replay.complete },
        };
      });

    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await tap('hero-select:queen');
    await fieldTap(18, 21.5, true);
    await expect.poll(async () => (await read()).ravens.length).toBe(1);
    const original = (await read()).ravens[0].id;
    await tap('hero-select:queen');
    await expect.poll(async () => (await read()).abilityUsed).toBe(true);
    await tap('spell:recall');
    const queen = (await read()).hero;
    await fieldTap(queen.x, queen.y, false);
    await expect.poll(async () => (await read()).retainedHp).toBeGreaterThan(0);
    const returned = await read();
    expect(returned.hero).toBeUndefined();
    expect(returned.ravens.filter(({ recalled }) => !recalled)).toHaveLength(baselineDist ? 0 : 1);
    expect(returned.petId).toBe(baselineDist ? null : original);
    await expect(page.locator('[data-action="hero-select:queen"]')).toHaveAccessibleName(/Deploy Queen/);
    if (!baselineDist) {
      await expect.poll(async () => (await read()).ravens[0].attacks).toBeGreaterThan(returned.ravens[0].attacks);
      expect((await read()).ravens[0].target).toBe(2);
    }
    await tap('hero-select:queen');
    await shot('queen-in-tray');
    await fieldTap(18, 21.5, true);
    await expect.poll(async () => (await read()).hero?.id).toBeGreaterThan(0);
    const redeployed = await read();
    expect(redeployed.abilityUsed).toBe(true);
    expect(redeployed.hero.hp).toBe(returned.retainedHp);
    expect(redeployed.ravens.filter(({ recalled }) => !recalled)).toHaveLength(1);
    expect(redeployed.petId === original).toBe(!baselineDist);
    await shot('redeployed');

    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    const finished = await read();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await tap('replay-pause');
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await slider.press('Home');
    await expect.poll(async () => (await read()).replay?.time).toBe(0);
    expect((await read()).hero).toBeUndefined();
    expect((await read()).ravens).toEqual([]);
    await slider.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await read();
    expect(replay.hero).toEqual(finished.hero);
    expect(replay.ravens).toEqual(finished.ravens);
    expect(replay.petId).toBe(finished.petId);
    expect(replay.abilityUsed).toBe(true);
    await shot('replay-end');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ label, returned, redeployed, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
