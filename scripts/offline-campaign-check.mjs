// Exercise a first campaign raid after the production worker warms only the village.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';

const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let fixtures;
try {
  const { GameModel, initialSave, makeBuilding } =
    await modules.ssrLoadModule('/src/game/model.ts');
  const { developedSave } = await modules.ssrLoadModule('/tests/fixtures/developed-village.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const { freshNativeCampaign } = await modules.ssrLoadModule('/src/game/native-campaign.ts');
  const late = developedSave();
  late.nativeCampaign = freshNativeCampaign();
  late.nativeCampaign.stars.fill(1, 0, 63);
  const recorded = new GameModel(structuredClone(late));
  const { deploySpots } = await modules.ssrLoadModule('/tests/fixtures/late-defense-battle.ts');
  recorded.startCampaign(63);
  recorded.activeTroop = 'swordsman';
  const [spot] = deploySpots(recorded, 24, 46, 1);
  if (!recorded.deploy(spot.x, spot.y)) throw Error('Late replay fixture failed to deploy');
  for (let i = 0; i < 100; i++) recorded.step(0.05);
  recorded.finishBattle();
  if (!recorded.state.raidLog?.[0]?.replay) throw Error('Missing late replay fixture');
  recorded.returnHome();
  const ladder = new GameModel(initialSave());
  ladder.townhall.level = 18;
  ladder.state.buildings.find((b) => b.kind === 'barracks').level = 18;
  ladder.state.buildings.find((b) => b.kind === 'camp').level = 13;
  for (const [kind, x, y, level] of [
    ['camp', 21, 11, 13],
    ['camp', 28, 8, 13],
    ['camp', 28, 20, 13],
    ['workshop', 32, 14, 7],
    ['spellfactory', 32, 20, 8],
  ])
    ladder.state.buildings.push(makeBuilding(ladder.state.nextId++, kind, x, y, level));
  ladder.state.obstacles = [];
  ladder.state.trophies = 1399;
  // Consecutive offers share Builderopolis, so warming advances the seed normally.
  ladder.state.ladderSeed = 89;
  const roster = { swordsman: 8, electrodragon: 8, balloon: 8, dragonrider: 1, battledrill: 1 };
  for (const kind of Object.keys(ladder.state.army)) ladder.state.army[kind] = 0;
  for (const [kind, count] of Object.entries(roster))
    for (let i = 0; i < count; i++) ladder.train(kind);
  ladder.brew('rage', 2);
  ladder.brew('freeze', 3);
  expect(ladder.armySize).toBe(313);
  expect(ladder.siegeCount).toBe(1);
  expect(ladder.spellHousing).toBe(7);
  expect(ladder.ladderPreview).toEqual({ index: 84, match: { opponent: 1499, win: 38, loss: 12 } });
  fixtures = {
    ladderMiss: structuredClone(ladder.state),
    ladderWarm: ladder.state,
    starter: initialSave(),
    developed: developedSave(),
    late,
    replay: recorded.state,
  };
  for (const [name, fixture] of Object.entries(fixtures)) {
    fixture.tutorial = true;
    fixture.settings.sound = false;
    const state = new GameModel(fixture).state;
    if (!validateSave(state)) throw Error(`Invalid ${name} save fixture`);
    fixtures[name] = JSON.stringify(state);
  }
} finally {
  await modules.close();
}

const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
  logLevel: 'warn',
});
try {
  const { port } = server.httpServer.address();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
  try {
    for (const [name, save] of Object.entries(fixtures)) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      try {
        const page = await context.newPage();
        const misses = new Set();
        const errors = [];
        page.on('requestfailed', (request) => misses.add(new URL(request.url()).pathname));
        page.on('response', (response) => {
          if (response.status() >= 400) misses.add(new URL(response.url()).pathname);
        });
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript((save) => {
          if (!localStorage.getItem('crown-clan-save-v1'))
            localStorage.setItem('crown-clan-save-v1', save);
        }, save);
        const snapshot = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
        const reload = async () => {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
        };
        await page.goto(`http://127.0.0.1:${port}`);
        await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
        await page.waitForFunction(
          () =>
            navigator.serviceWorker.controller &&
            document.documentElement.dataset.offline === 'ready',
          null,
          { timeout: 30000 },
        );
        if ((await snapshot()).mode !== 'village')
          throw Error('Warm-up should stay in the village');
        if (name === 'ladderMiss' || name === 'ladderWarm') {
          const summary = () =>
            page.evaluate(() => {
              const save = JSON.parse(localStorage.getItem('crown-clan-save-v1'));
              return {
                trophies: save.trophies,
                seed: save.ladderSeed,
                army: save.army,
                spells: save.spells,
                raids: save.stats.raids,
                records: (save.raidLog ?? []).map(({ replay, ...record }) => record),
              };
            });
          const start = await summary();
          const title = page.locator('.battle-enemy h2');
          const status = page.locator('.prep-banner [role="status"]');
          const ready = 'Tap a defense to see its range · Deploy to start';
          const homeButton = page.locator('.end-battle[data-action="home"]');
          const enterLadder = async (stake) => {
            await page.locator('.attack-btn').tap();
            await page.locator('.campaign-summary [data-action="ladder"]').tap();
            await expect(title).toHaveText('Builderopolis');
            await expect(page.locator('.ladder-stake')).toContainText(stake);
          };
          const cached = (path) =>
            page.evaluate(async (path) => !!(await caches.match(path)), path);
          const atlas = '/assets/buildings/scattershot-native/texture-45.webp';
          expect(await cached(atlas)).toBe(false);
          if (name === 'ladderWarm') {
            await enterLadder('Defeat −12');
            await expect(status).toHaveText(ready, { timeout: 45000 });
            await expect.poll(() => cached(atlas)).toBe(true);
            await homeButton.tap();
            await expect.poll(async () => (await summary()).seed).toBe(90);
          }
          await context.setOffline(true);
          misses.clear();
          await reload();
          const warmed = name === 'ladderWarm';
          const before = await summary();
          expect(before).toEqual({ ...start, seed: warmed ? 90 : 89 });
          await enterLadder(warmed ? 'Defeat −15' : 'Defeat −12');
          const card = page.locator('[data-action="troop:swordsman"]');
          // Open grass near the upper-right edge at this fixed phone viewport.
          // Use one touch in each profile to test the exact same deployment point.
          const deploySwordsman = async () => {
            await card.tap();
            await page.touchscreen.tap(377, 273);
          };
          if (!warmed) {
            await expect(status).toHaveText('Reconnect to download this village’s art.');
            expect(await cached(atlas)).toBe(false);
            await deploySwordsman();
            expect((await snapshot()).battle).toMatchObject({
              scouting: true,
              remaining: { swordsman: 8 },
              units: 0,
            });
            await homeButton.tap();
            await reload();
            expect(await summary()).toEqual({ ...start, seed: 90 });
          } else {
            await expect(status).toHaveText(ready, { timeout: 45000 });
            await deploySwordsman();
            await expect.poll(async () => (await snapshot()).battle.remaining.swordsman).toBe(7);
            expect((await snapshot()).battle).toMatchObject({ scouting: false, units: 1 });
            await page.locator('[data-action="surrender"]').tap();
            await page.locator('[data-action="end"]').tap();
            await expect(page.locator('.ladder-result')).toContainText('-15 trophies');
            await expect.poll(async () => (await summary()).records.length).toBe(1);
            const settled = await summary();
            expect(settled).toMatchObject({
              seed: 91,
              trophies: 1384,
              raids: start.raids + 1,
              spells: start.spells,
              army: { ...start.army, swordsman: 7 },
            });
            expect(settled.records[0]).toMatchObject({
              ladder: { opponent: 1454, win: 35, loss: 15 },
              deployed: { swordsman: 1 },
            });
            await reload();
            expect(await summary()).toEqual(settled);
            await page.locator('[data-action="battle-log"]').tap();
            await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
            await page.locator('[data-action="replay-skip"]').tap();
            await expect.poll(async () => (await snapshot()).battle.units).toBeGreaterThan(0);
            await expect(page.locator('.replay-status')).toContainText('Replay complete', {
              timeout: 30000,
            });
            const replayed = (await snapshot()).battle;
            expect(replayed.result).toEqual(settled.records[0].result);
            expect(replayed.remaining.swordsman).toBe(7);
            await reload();
            expect(await summary()).toEqual(settled);
          }
          expect(errors).toEqual([]);
          console.log(
            `${name}: Builderopolis ${warmed ? 'deployed offline, settled once, and replayed' : 'cache miss blocked deployment without spending troops or trophies'}`,
          );
          continue;
        }
        misses.clear();
        await context.setOffline(true);
        await reload();
        const home = await snapshot();
        expect(home.army.swordsman).toBe(JSON.parse(save).army.swordsman);
        expect(home.buildings.some((building) => building.type === 'mortar')).toBe(
          name !== 'starter',
        );
        const enter = async (index, title) => {
          await page.locator('.attack-btn').tap();
          await page.locator(`[data-action="attack:${index}"]`).tap();
          await expect(page.locator('.prep-banner')).toBeVisible();
          await expect(page.locator('.battle-enemy h2')).toHaveText(title);
        };
        const troop = page.locator('[data-action="troop:swordsman"]');
        const deploy = async (stock = home.army.swordsman) => {
          await troop.tap();
          // Try visible canvas points via touch. The red boundary excludes some candidates.
          for (const y of [390, 340, 440, 290, 490, 240])
            for (const x of [195, 130, 260, 65, 325]) {
              if ((await snapshot()).battle.remaining.swordsman < stock) return;
              if (
                !(await page.evaluate(
                  ([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS',
                  [x, y],
                ))
              )
                continue;
              await page.touchscreen.tap(x, y);
              await page.waitForTimeout(400);
            }
        };
        if (name === 'replay') {
          const result = JSON.parse(save).raidLog[0].result;
          const campaignProgress = () =>
            page.evaluate(
              () => JSON.parse(localStorage.getItem('crown-clan-save-v1')).nativeCampaign,
            );
          const progress = await campaignProgress();
          expect(progress).toBeDefined();
          await page.locator('[data-action="battle-log"]').tap();
          const record = page.locator('.raid-record').filter({ hasText: 'Bowling Alley' });
          const watch = record.getByRole('button', { name: 'Watch replay' });
          const watchAction = await watch.getAttribute('data-action');
          await watch.tap();
          await expect
            .poll(() => [...misses].some((path) => path.includes('/late-campaign-scene-')))
            .toBe(true);
          const status = page.locator('.replay-status strong');
          await expect(status).toHaveText('Reconnect to load replay art');
          // Wait out the transient toast; the replay controls must still explain the hold.
          await expect(page.locator('#toast.show')).toHaveCount(0, { timeout: 12000 });
          await expect(status).toHaveText('Reconnect to load replay art');
          await page.screenshot({ path: 'output/offline-battle-log-blocked.png' });
          const back = page.getByRole('button', { name: 'Back to log' });
          await back.tap();
          await expect(watch).toHaveAttribute('data-action', watchAction);
          await expect(watch).toBeFocused();
          await expect(page.locator('.raid-record')).toHaveCount(1);

          await watch.tap();
          const lateArt = page.waitForResponse(
            (response) => response.url().includes('/late-campaign-scene-') && response.ok(),
          );
          await context.setOffline(false);
          await lateArt;
          await expect(page.locator('.replay-status')).toContainText('Replay complete', {
            timeout: 45000,
          });
          expect((await snapshot()).battle.result).toEqual(result);
          await page.screenshot({ path: 'output/offline-battle-log-replay.png' });
          await back.tap();
          await expect(watch).toHaveAttribute('data-action', watchAction);
          await reload();
          expect((await snapshot()).resources).toEqual(home.resources);
          expect((await snapshot()).army).toEqual(home.army);
          expect(await campaignProgress()).toEqual(progress);
          await page.locator('[data-action="battle-log"]').tap();
          await expect(page.locator('.raid-record')).toHaveCount(1);
          await expect(watch).toHaveAttribute('data-action', watchAction);
          expect(errors).toEqual([]);
          console.log(
            'replay: an uncached recording returned to the same log entry and played on reconnect',
          );
          continue;
        }
        if (name === 'late') {
          const lateGraphCached = await page.evaluate(async () => {
            for (const cache of await caches.keys())
              if (
                (await (await caches.open(cache)).keys()).some((request) =>
                  new URL(request.url).pathname.includes('/late-campaign-scene-'),
                )
              )
                return true;
            return false;
          });
          expect(lateGraphCached).toBe(false);
          await enter(63, 'Bowling Alley');
          const scoutingHint = page.locator('.prep-banner [role="status"]');
          await expect
            .poll(() => [...misses].some((path) => path.includes('/late-campaign-scene-')))
            .toBe(true);
          await expect(scoutingHint).toHaveText('Reconnect to download this village’s art.');
          await troop.tap();
          await page.touchscreen.tap(195, 390);
          await expect(page.locator('#toast')).toContainText(
            'Reconnect to download this village’s art',
          );
          expect((await snapshot()).battle).toMatchObject({ scouting: true, units: 0 });
          await page.locator('.end-battle[data-action="home"]').tap();
          expect((await snapshot()).army).toEqual(home.army);
          expect((await snapshot()).resources).toEqual(home.resources);
          await page.locator('[data-action="battle-log"]').tap();
          await expect(page.locator('.raid-record')).toHaveCount(0);
          await page.getByRole('button', { name: 'Close dialog' }).tap();

          await enter(63, 'Bowling Alley');
          const lateArt = page.waitForResponse(
            (response) => response.url().includes('/late-campaign-scene-') && response.ok(),
          );
          await context.setOffline(false);
          await lateArt;
          await expect
            .poll(
              async () => {
                await deploy();
                return (await snapshot()).battle.remaining.swordsman;
              },
              {
                timeout: 25000,
              },
            )
            .toBe(home.army.swordsman - 1);
          await expect(page.locator('.battle-enemy h2')).toHaveText('Bowling Alley');
          await expect(troop.locator('.troop-count')).toHaveText(`x${home.army.swordsman - 1}`);
          await page.locator('[data-action="surrender"]').tap();
          await page.locator('[data-action="end"]').tap();
          await page.locator('.result-modal [data-action="home"]').tap();
          const settled = await snapshot();
          await context.setOffline(true);
          misses.clear();
          await reload();
          expect((await snapshot()).army).toEqual(settled.army);
          await enter(63, 'Bowling Alley');
          await expect(scoutingHint).toContainText('Deploy to start', { timeout: 25000 });
          await expect
            .poll(
              async () => {
                await deploy(settled.army.swordsman);
                return (await snapshot()).battle.remaining.swordsman;
              },
              { timeout: 25000 },
            )
            .toBe(settled.army.swordsman - 1);
          expect([...misses].filter((path) => path.includes('/late-campaign-scene-'))).toEqual([]);
          await page.screenshot({ path: 'output/offline-bowling-alley.png' });
          expect(errors).toEqual([]);
          console.log(
            'late: uncached Bowling Alley explained offline scouting, left at no cost, deployed after reconnect, and deployed again after an offline reload',
          );
          continue;
        }

        const paybackAtlases = [
          '/assets/buildings/goblin-native/texture-8.webp',
          '/assets/buildings/goblin-native/texture-37.webp',
        ];
        expect(
          await page.evaluate(
            async (urls) => Promise.all(urls.map(async (url) => (await caches.match(url))?.ok)),
            paybackAtlases,
          ),
        ).toEqual([true, true]);
        await enter(0, 'Payback');
        expect([...misses].filter((url) => paybackAtlases.includes(url))).toEqual([]);
        await deploy();
        if (!(await snapshot()).battle.units)
          throw Error(
            `No offline deployment on ${name}. Toast: ${await page.locator('#toast').textContent()}`,
          );
        await expect(troop.locator('.troop-count')).toHaveText(`x${home.army.swordsman - 1}`);
        await page.locator('[data-action="surrender"]').tap();
        await page.locator('[data-action="end"]').tap();
        const result = (await snapshot()).battle.result;
        expect(result).toBeTruthy();
        await page.locator('.result-modal [data-action="home"]').tap();
        const settled = await snapshot();
        const savedProgress = () =>
          page.evaluate(() => {
            const { nativeCampaign, stats, raidLog } = JSON.parse(
              localStorage.getItem('crown-clan-save-v1'),
            );
            return {
              nativeCampaign,
              raids: stats.raids,
              records: (raidLog ?? []).map(({ result, deployed }) => ({ result, deployed })),
            };
          });
        await expect.poll(async () => (await savedProgress()).records.length).toBe(1);
        const progress = await savedProgress();
        expect(progress.records[0]).toMatchObject({ result, deployed: { swordsman: 1 } });
        await reload();
        expect((await snapshot()).resources).toEqual(settled.resources);
        expect((await snapshot()).army.swordsman).toBe(home.army.swordsman - 1);
        await page.locator('[data-action="battle-log"]').tap();
        await expect(page.locator('.raid-record')).toHaveCount(1);
        await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
        await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
        await page.locator('[data-action="replay-skip"]').tap();
        await expect.poll(async () => (await snapshot()).battle.units).toBeGreaterThan(0);
        await expect(page.locator('.replay-status')).toContainText('Replay complete');
        expect((await snapshot()).battle.result).toEqual(result);
        await page.screenshot({ path: `output/offline-payback-${name}-replay.png` });
        await reload();
        expect(await savedProgress()).toEqual(progress);
        expect((await snapshot()).resources).toEqual(settled.resources);
        expect((await snapshot()).army.swordsman).toBe(home.army.swordsman - 1);
        expect(errors).toEqual([]);
        console.log(`${name}: offline deployment, settlement, reload and replay passed`);
        console.log(`${name}: ${misses.size} distinct unavailable request paths`);
        for (const path of [...misses].slice(0, 12)) console.log(`  ${path}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
