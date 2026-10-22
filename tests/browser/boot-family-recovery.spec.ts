import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { GameModel, initialSave, makeBuilding } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { validateSave } from '../../src/game/save';

async function open(page: Page, kind: 'skeletontrap' | 'xbow', mode = 'ground') {
  const state = initialSave();
  state.tutorial = true;
  state.obstacles = [];
  state.army = emptyArmy();
  state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, kind === 'xbow' ? 9 : 8),
    makeBuilding(2, 'builder', 26, 26),
    makeBuilding(3, kind, 10, 10, 1),
  ];
  if (kind === 'skeletontrap') state.buildings[2].skeletonMode = mode as 'ground' | 'air';
  state.nextId = 4;
  const save = new GameModel(state).state;
  expect(validateSave(save)).toBe(true);
  await page.addInitScript(
    (save) => localStorage.setItem('crown-clan-save-v1', save),
    JSON.stringify(save),
  );
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
}

for (const mode of ['ground', 'air'])
  test(`a home ${mode} Skeleton Trap keeps its portrait while a boot atlas retries`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const path = '/assets/buildings/skeleton-trap-native/1-atlas.png';
    const pattern = '**' + path;
    let attempts = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === path) attempts++;
    });
    await page.route(pattern, (route) =>
      route.fulfill({ status: 503, body: 'Temporary boot atlas outage' }),
    );
    await open(page, 'skeletontrap', mode);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          const sprite = scene.sprites.get(3);
          return {
            texture: sprite?.texture.key,
            visible: sprite?.visible,
            alpha: sprite?.alpha,
            atlas: scene.textures.exists('skeletontrap-native-1'),
          };
        }),
      )
      .toEqual({ texture: `skeletontrap-native-1-${mode}`, visible: true, alpha: 1, atlas: false });
    const failed = attempts;
    await page.unroute(pattern);
    if (mode === 'air') {
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect.poll(() => attempts, { timeout: 2000 }).toBeGreaterThan(failed);
    }
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const { scene } = window.__game;
            return {
              texture: scene.sprites.get(3)?.texture.key,
              atlas: scene.textures.exists('skeletontrap-native-1'),
              failed: scene.failedFamilies.size,
            };
          }),
        { timeout: 20000 },
      )
      .toEqual({ texture: 'skeletontrap-native-1', atlas: true, failed: 0 });
    expect(attempts).toBeGreaterThan(failed);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `output/playtest/boot-skeleton-${mode}-recovered.png` });
  });

test('a home X-Bow does not claim ready until a failed boot page recovers', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const graph = JSON.parse(await readFile('reference/xbow/runtime.json', 'utf8'));
  const path = '/' + Object.values(graph.textures)[0].path;
  const pattern = '**' + path;
  let attempts = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === path) attempts++;
  });
  await page.route(pattern, (route) =>
    route.fulfill({ status: 503, body: 'Temporary boot page outage' }),
  );
  await open(page, 'xbow');
  await expect
    .poll(() =>
      page.evaluate(() => ({
        ready: window.__game.scene.xbowPresentation.artReady,
        alpha: window.__game.scene.sprites.get(3)?.alpha,
      })),
    )
    .toEqual({ ready: false, alpha: 1 });
  const failed = attempts;
  await page.unroute(pattern);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => attempts, { timeout: 2000 }).toBeGreaterThan(failed);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const { scene } = window.__game;
          return {
            ready: scene.xbowPresentation.artReady,
            alpha: scene.sprites.get(3)?.alpha,
            visible: scene.children.list.some(
              (object) => object.visible && object.alpha > 0 && object.getData?.('xbow')?.id === 3,
            ),
          };
        }),
      { timeout: 20000 },
    )
    .toEqual({ ready: true, alpha: 0, visible: true });
  expect(
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      const family = scene.deferredFamilies.find((family) =>
        family.draws(model.buildings.find((building) => building.id === 3)),
      );
      return scene.familyTextures.get(family);
    }),
  ).toContain('xbow-1-ground');
  expect(errors).toEqual([]);
});
