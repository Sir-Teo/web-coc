import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv.includes('--baseline');
const artifacts = 'output/rea-cloud-playtest/tome-goblin-bomb';
await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { initialSave, makeBuilding } = await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy } = await modules.ssrLoadModule('/src/game/army.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = initialSave();
  fixture.tutorial = true;
  fixture.settings.sound = false;
  fixture.settings.music = false;
  fixture.settings.manualHeroAbilities = true;
  fixture.nextId = 100;
  fixture.obstacles = [];
  fixture.buildings = [
    makeBuilding(1, 'townhall', 33, 34, 12),
    makeBuilding(2, 'builder', 32, 23, 1),
    makeBuilding(3, 'herohall', 32, 27, 6),
    makeBuilding(4, 'cannon', 18, 21, 5),
    makeBuilding(5, 'camp', 25, 29, 7),
  ];
  fixture.heroes = { warden: { level: 20 } };
  fixture.heroLineup = ['warden'];
  const { freshNativeCampaign } = await modules.ssrLoadModule('/src/game/native-campaign.ts');
  fixture.nativeCampaign = freshNativeCampaign();
  fixture.nativeCampaign.stars.fill(1);
  fixture.army = { ...emptyArmy(), giant: 6 };
  const { TROOP_KEYS } = await modules.ssrLoadModule('/src/game/data.ts');
  fixture.troopLevels = Object.fromEntries(
    TROOP_KEYS.map((kind) => [kind, kind === 'giant' ? 8 : 1]),
  );
  expect(validateSave(fixture)).toBe(true);
  save = JSON.stringify(fixture);
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
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    const boot = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await boot();
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = (name) =>
      page.screenshot({
        path: `${artifacts}/${baseline ? 'baseline' : 'patched'}-${name}.png`,
        animations: 'disabled',
      });
    const read = () =>
      page.evaluate(() => {
        const { model } = window.qa;
        const battle = model.battle;
        const boss = battle?.buildings.find(({ npc }) => npc === 'goblin-boss-th');
        const hero = battle?.nativeHeroes?.find(({ kind }) => kind === 'warden');
        const weapon = battle?.late?.goblinBuildings?.weapons[boss?.id];
        return {
          at: battle?.elapsed,
          abilityAt: hero?.abilityAt,
          shots: weapon?.shots ?? [],
          hits: weapon?.hits ?? [],
          units:
            battle?.units.map(({ id, hp, native }) => ({
              id,
              hp,
              shield: native?.effects?.shield,
            })) ?? [],
          impacts: window.protectedImpacts ?? [],
          log: model.state.raidLog?.map(({ id, result }) => ({ id, result })) ?? [],
          replay: model.replay,
        };
      });
    await page.locator('.attack-btn').tap();
    await tap('attack:89');
    await expect(page.locator('.battle-enemy h2')).toHaveText("M.O.M.M.A's Madhouse");
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.evaluate(() => {
      const { model } = window.qa;
      const boss = model.battle.buildings.find(({ npc }) => npc === 'goblin-boss-th');
      const stepLate = model.stepLate.bind(model);
      window.protectedImpacts = [];
      model.stepLate = (phase, dt) => {
        const b = model.battle;
        if (phase !== 'projectiles' || !b?.started || b.finished || model.replay)
          return stepLate(phase, dt);
        const before = b.units.map(({ id, x, y, hp, native }) => ({
          id,
          x,
          y,
          hp,
          shield: native?.effects?.shield,
        }));
        const known = new Set(
          b.late?.goblinBuildings?.weapons[boss.id]?.hits.map(({ index }) => index),
        );
        const bombs = new Map(
          b.late?.goblinBuildings?.projectiles
            .filter(({ sourceId }) => sourceId === boss.id)
            .map(({ index, damage }) => [index, damage]),
        );
        stepLate(phase, dt);
        for (const hit of b.late?.goblinBuildings?.weapons[boss.id]?.hits ?? []) {
          if (known.has(hit.index)) continue;
          for (const unit of before) {
            if (
              unit.hp <= 0 ||
              unit.shield?.percent !== 1 ||
              unit.shield.until <= hit.at ||
              Math.hypot(unit.x - hit.x, unit.y - hit.y) > 0.97
            )
              continue;
            const after = b.units.find(({ id }) => id === unit.id);
            window.protectedImpacts.push({
              ...hit,
              unit: unit.id,
              bombDamage: bombs.get(hit.index),
              loss: unit.hp - after.hp,
            });
          }
        }
      };
    });
    const field = async () => {
      const point = await page.evaluate(() => {
        const { model, scene } = window.qa;
        const boss = model.battle.buildings.find(({ npc }) => npc === 'goblin-boss-th');
        let nearest;
        for (let x = 8; x < 41; x += 0.25)
          for (let y = 8; y < 41; y += 0.25) {
            if (model.deployBlocked(x, y)) continue;
            const p = scene.screenFor(x, y);
            if (p.y < 185 || p.y > 425 || document.elementFromPoint(p.x, p.y) !== scene.game.canvas)
              continue;
            const grid = scene.gridAtScreen(Math.round(p.x), Math.round(p.y));
            if (model.deployBlocked(grid.x, grid.y)) continue;
            const distance = Math.hypot(grid.x - boss.x - 2, grid.y - boss.y - 2);
            if (!nearest || distance < nearest.distance) nearest = { x: p.x, y: p.y, distance };
          }
        return nearest;
      });
      expect(point).toBeDefined();
      return page.touchscreen.tap(point.x, point.y);
    };
    await shot('scouting');
    await tap('troop:giant');
    await field();
    await field();
    const warden = page.locator('[data-action="hero-select:warden"]');
    await warden.tap();
    await field();
    await expect(warden).toHaveAccessibleName(/Activate ability/);
    await expect
      .poll(async () => (await read()).shots.length, { timeout: 20_000 })
      .toBeGreaterThan(0);
    await warden.tap();
    await expect
      .poll(async () => (await read()).impacts.length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const live = await read();
    const impact = live.impacts[0];
    expect(impact.bombDamage).toBeGreaterThanOrEqual(330);
    expect(impact.loss).toBeCloseTo(baseline ? impact.bombDamage : 0, 6);
    await shot('shielded-impact');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    const settled = await read();
    expect(settled.log).toHaveLength(1);
    await page.reload();
    await boot();
    expect((await read()).log).toEqual(settled.log);
    await tap('battle-log');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await tap('replay-pause');
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await expect(slider).toBeVisible();
    await slider.press('Home');
    await expect.poll(async () => (await read()).replay.time).toBe(0);
    expect((await read()).hits).toEqual([]);
    await slider.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await read();
    expect(replay.hits).toContainEqual(
      live.hits.find(({ index }) => index === live.impacts[0].index),
    );
    expect(replay.units).toEqual(settled.units);
    expect(replay.log).toEqual(settled.log);
    await shot('replay');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ baseline, live, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
