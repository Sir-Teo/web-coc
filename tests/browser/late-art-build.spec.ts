import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { GameModel, initialSave, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { validateSave } from '../../src/game/save';
import { freshNativeCampaign } from '../../src/game/native-campaign';

function fixtureSave() {
  const state = initialSave();
  state.obstacles = [];
  state.buildings = [
    makeBuilding(1000, 'townhall', 20, 20, 14),
    makeBuilding(1001, 'eagleartillery', 15, 15, 1),
    makeBuilding(1002, 'scattershot', 25, 15, 1),
    makeBuilding(1003, 'builder', 30, 30, 1),
  ];
  state.nextId = 1004;
  state.tutorial = true;
  state.army = emptyArmy();
  state.spells = emptySpells();
  const fixture = new GameModel(state).state;
  expect(validateSave(fixture)).toBe(true);
  return JSON.stringify(fixture);
}

test.skip(
  !process.env.LATE_ART_BUILD,
  'Run npm run test:late-art:production against an owned preview.',
);

for (const moduleName of ['late-campaign-scene', 'character-graphs']) {
  test(`a failed built ${moduleName} import recovers with a fresh URL`, async ({
    page,
    browserName,
  }) => {
    const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'));
    const entry = manifest[`src/game/${moduleName}.ts`];
    expect(entry.isDynamicEntry).toBe(true);
    const modulePath = '/' + entry.file;
    // Retryable imports must remain outside the service worker's startup shell.
    expect(await readFile('dist/sw.js', 'utf8')).not.toContain(modulePath);
    await page.addInitScript(
      (save) => localStorage.setItem('crown-clan-save-v1', save),
      fixtureSave(),
    );
    const errors: string[] = [];
    const requests: string[] = [];
    const body = JSON.parse(await readFile('reference/eagle-artillery/runtime.json', 'utf8'));
    const expectedTextures = new Set(
      Object.values(body.textures).map((texture) => '/' + texture.path.replace(/\.png$/, '.webp')),
    );
    const loadedTextures = new Set<string>();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.method() === 'GET' && new URL(request.url()).pathname === modulePath)
        requests.push(request.url());
    });
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (response.ok() && expectedTextures.has(path)) loadedTextures.add(path);
    });
    const pattern = '**' + modulePath + '*';
    await page.route(pattern, (route) =>
      route.fulfill({ status: 503, body: 'Temporary chunk outage' }),
    );
    await page.goto('/');
    await expect(page.locator('#toast')).toContainText('retry automatically', { timeout: 30000 });
    expect(requests).toHaveLength(1);
    await page.unroute(pattern);
    const recovered = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === modulePath &&
        response.ok(),
    );
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => requests.length, { timeout: 2000 }).toBeGreaterThan(1);
    const response = await recovered;
    expect(response.headers()['content-type']).toMatch(/javascript/);
    expect(new URL(requests[1]).searchParams.get('art-retry')).toBe('1');
    await expect
      .poll(() => [...loadedTextures].sort(), { timeout: 30000 })
      .toEqual([...expectedTextures].sort());
    await expect(page.locator('#loading')).toBeHidden();
    await page.waitForLoadState('networkidle');
    await page.locator('.shop-btn').click();
    await expect(page.locator('.shop-tile').first()).toBeVisible();
    await page.locator('[data-action="close-drawer"]').click();
    await page.screenshot({ path: `output/playtest/late-built-${moduleName}-${browserName}.png` });
    expect(
      await page.locator('#game canvas').evaluate((canvas: HTMLCanvasElement) => {
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        return !!gl && !gl.isContextLost() && gl.getError() === gl.NO_ERROR;
      }),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('a cold Go to Bat visit downloads shared Ghost coffins through the shipped UI', async ({
  page,
  browserName,
}) => {
  const state = initialSave();
  state.tutorial = true;
  state.buildings = state.buildings.map((building) =>
    building.kind === 'townhall' || building.kind === 'barracks'
      ? makeBuilding(building.id, building.kind, building.x, building.y, 3)
      : building,
  );
  state.army = { ...emptyArmy(), giant: 1 };
  state.nativeCampaign = freshNativeCampaign();
  state.nativeCampaign.stars.fill(1);
  const save = new GameModel(state).state;
  expect(validateSave(save)).toBe(true);
  expect(save.buildings.some((building) => building.kind === 'skeletontrap')).toBe(false);
  await page.addInitScript(
    (save) => localStorage.setItem('crown-clan-save-v1', save),
    JSON.stringify(save),
  );
  const art = JSON.parse(await readFile('reference/skeleton-trap/native.json', 'utf8'));
  const required = new Set(
    [1, 3].map((tier) => '/' + art.tiers[tier].atlas.path.replace(/\.png$/, '.webp')),
  );
  const loaded = new Set<string>();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (response.ok() && required.has(path)) loaded.add(path);
  });
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  expect(loaded.size).toBe(0);
  await page.locator('.attack-btn').click();
  await page.locator('[data-action="attack:75"]').click();
  await expect(page.locator('.battle-enemy h2')).toHaveText('Go to Bat');
  await expect.poll(() => [...loaded].sort(), { timeout: 30000 }).toEqual([...required].sort());
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-action="troop:giant"]')).toBeVisible();
  await page.screenshot({ path: `output/playtest/ghost-trap-built-${browserName}.png` });
  expect(errors).toEqual([]);
});

test('a failed home coffin atlas retries after boot through the shipped UI', async ({
  page,
  browserName,
}) => {
  const state = initialSave();
  state.tutorial = true;
  state.army = emptyArmy();
  state.obstacles = [];
  state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 8),
    makeBuilding(2, 'builder', 26, 26),
    makeBuilding(3, 'skeletontrap', 10, 10, 1),
  ];
  state.buildings[2].skeletonMode = 'air';
  state.nextId = 4;
  const save = new GameModel(state).state;
  expect(validateSave(save)).toBe(true);
  await page.addInitScript(
    (save) => localStorage.setItem('crown-clan-save-v1', save),
    JSON.stringify(save),
  );
  const path = '/assets/buildings/skeleton-trap-native/1-atlas.webp';
  const pattern = '**' + path;
  let requests = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === path) requests++;
  });
  await page.route(pattern, (route) =>
    route.fulfill({ status: 503, body: 'Temporary boot atlas outage' }),
  );
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await page.waitForLoadState('networkidle');
  expect(requests).toBeGreaterThan(0);
  const failed = requests;
  await page.unroute(pattern);
  const recovered = page.waitForResponse(
    (response) => new URL(response.url()).pathname === path && response.ok(),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => requests, { timeout: 2000 }).toBeGreaterThan(failed);
  expect((await recovered).headers()['content-type']).toMatch(/^image\//);
  await page.waitForLoadState('networkidle');
  await page.locator('.shop-btn').click();
  await expect(page.locator('.shop-tile').first()).toBeVisible();
  await page.locator('[data-action="close-drawer"]').click();
  await page.screenshot({ path: `output/playtest/boot-coffin-built-${browserName}.png` });
  expect(errors).toEqual([]);
});

test('a removed built art chunk keeps the release reload path', async ({ page }) => {
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'));
  const modulePath = '/' + manifest['src/game/late-campaign-scene.ts'].file;
  const starter = initialSave();
  starter.tutorial = true;
  await page.addInitScript((save) => {
    if (!sessionStorage.getItem('late-reload-seeded')) {
      localStorage.setItem('crown-clan-save-v1', save);
      sessionStorage.setItem('late-reload-seeded', 'yes');
    }
  }, JSON.stringify(starter));
  let requests = 0;
  let navigations = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await page.route('**' + modulePath + '*', (route) => {
    if (route.request().method() === 'GET') requests++;
    // The failed GET and its status probe identify the removed release. Reload can fetch
    // the current file; the browser's failed module map belongs to the old document.
    return requests === 1
      ? route.fulfill({ status: 404, body: 'Old release chunk' })
      : route.continue();
  });
  await page.locator('#import-file').setInputFiles({
    name: 'late-village.json',
    mimeType: 'application/json',
    buffer: Buffer.from(fixtureSave()),
  });
  await page.locator('[data-action="import-confirm"]').click();
  await expect.poll(() => navigations, { timeout: 15000 }).toBe(2);
  await expect.poll(() => requests, { timeout: 15000 }).toBeGreaterThan(1);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await page.waitForLoadState('networkidle');
  expect(navigations).toBe(2);
  expect(errors).toEqual([]);
});

test.describe('recovered art with the real service worker', () => {
  test.use({ serviceWorkers: 'allow' });
  test('a verified retry remains available at the ordinary URL after an offline reload', async ({
    page,
    context,
    browserName,
  }) => {
    const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'));
    const modulePath = '/' + manifest['src/game/late-campaign-scene.ts'].file;
    await page.addInitScript(
      (save) => localStorage.setItem('crown-clan-save-v1', save),
      fixtureSave(),
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.waitForFunction(
      () =>
        navigator.serviceWorker.controller && document.documentElement.dataset.offline === 'ready',
    );
    await page.waitForLoadState('networkidle');
    expect(
      await page.evaluate(async (url) => {
        for (const name of await caches.keys()) await (await caches.open(name)).delete(url);
        if (await caches.match(url)) throw Error('The canonical chunk was not removed');
        return (await fetch(url + '?art-retry=1')).ok;
      }, modulePath),
    ).toBe(true);
    await expect
      .poll(() => page.evaluate(async (url) => !!(await caches.match(url)), modulePath))
      .toBe(true);
    // WebKit's offline emulation can reject navigation before the worker handles it.
    // Make this context's preview host unavailable instead, including worker requests.
    await context.addCookies([{ name: 'late-art-offline', value: 'yes', url: page.url() }]);
    expect((await context.request.get('/index.html?offline-proof')).status()).toBe(503);
    const module = page.waitForResponse(
      (response) => new URL(response.url()).pathname === modulePath,
    );
    await page.reload();
    expect((await module).fromServiceWorker()).toBe(true);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.locator('.shop-btn').click();
    await expect(page.locator('.shop-tile').first()).toBeVisible();
    await page.locator('[data-action="close-drawer"]').click();
    await page.screenshot({ path: `output/playtest/late-built-offline-${browserName}.png` });
    expect(errors).toEqual([]);
  });
});
