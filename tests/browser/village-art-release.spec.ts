import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const prefix = 'village:townhall:';
async function townHallPack(page: Page) {
  const catalogue = JSON.parse(await readFile('reference/full-client/village-art.json', 'utf8'));
  const response = await page.request.get('/' + catalogue.buildings.townhall.path);
  expect(response.ok()).toBe(true);
  return response.json();
}
async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.waitForFunction(() =>
    window.__game.scene.villageNativePresentation.levelsReady
      .get('townhall')
      ?.has(window.__game.model.townhallLevel),
  );
}
async function scout(page: Page) {
  return page.evaluate(() => {
    const { model, scene } = window.__game;
    model.state.stars = Array(12).fill(3);
    model.startBattle(10);
    scene.sync();
    return model.battle!.buildings.find((b) => b.kind === 'townhall')!.level;
  });
}
async function returnHome(page: Page) {
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.returnHome();
    scene.sync();
  });
}

test('leaving a village releases its exclusive pages and keeps shared home pages warm', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const pack = await townHallPack(page);
  const townHallPages = new Set(
    Object.values(pack.scenes).flatMap((graph) =>
      Object.values(graph.textures).map((texture) => '/' + texture.path),
    ),
  );
  const requests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (townHallPages.has(path)) requests.push(path);
  });
  await boot(page);
  const home = await page.evaluate((prefix) => {
    const { scene } = window.__game;
    const textures = Object.entries(scene.textures.list).filter(([key]) => key.startsWith(prefix));
    window.__homeTownHallTextures = new Map(textures);
    return textures.map(([key]) => key);
  }, prefix);
  const level = await scout(page);
  expect(level).toBeGreaterThan(1);
  await page.waitForFunction(
    (level) =>
      window.__game.scene.villageNativePresentation.levelsReady.get('townhall')?.has(level),
    level,
  );
  const exclusive = await page.evaluate(
    ({ prefix, home }) =>
      Object.keys(window.__game.scene.textures.list).filter(
        (key) => key.startsWith(prefix) && !home.includes(key),
      ),
    { prefix, home },
  );
  expect(exclusive.length).toBeGreaterThan(0);
  await returnHome(page);
  await expect
    .poll(() =>
      page.evaluate(
        (keys) => keys.filter((key) => window.__game.scene.textures.exists(key)),
        exclusive,
      ),
    )
    .toEqual([]);
  expect(
    await page.evaluate(() =>
      [...window.__homeTownHallTextures].every(
        ([key, texture]) => window.__game.scene.textures.get(key) === texture,
      ),
    ),
  ).toBe(true);
  const fetched = requests.length;
  await scout(page);
  await page.waitForFunction(
    (level) =>
      window.__game.scene.villageNativePresentation.levelsReady.get('townhall')?.has(level),
    level,
  );
  expect(requests.length).toBe(fetched);
  expect(errors).toEqual([]);
});

for (const revisit of [false, true]) {
  test(`a late village page ${revisit ? 'belongs to the newer visit' : 'stays released after returning home'}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await boot(page);
    const pack = await townHallPack(page);
    const homeLevel = await page.evaluate(() => window.__game.model.townhallLevel);
    const pagePath = Object.values(pack.scenes)
      .flatMap((graph) => Object.values(graph.textures))
      .find((texture) => texture.levels?.includes(3) && !texture.levels.includes(homeLevel))?.path;
    if (!pagePath) throw Error('No exclusive Town Hall 3 page');
    const path = '/' + pagePath;
    await page.evaluate((path) => {
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function () {
        const loaded = decode.call(this);
        return this.src.endsWith(path)
          ? loaded.then(() => {
              window.__releasedVillageDecoded = true;
            })
          : loaded;
      };
    }, path);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    const pattern = '**' + path;
    await page.route(pattern, async (route) => {
      requested = true;
      await gate;
      await route.continue();
    });
    try {
      await scout(page);
      await expect.poll(() => requested).toBe(true);
      await returnHome(page);
      expect(
        await page.evaluate(() =>
          window.__game.scene.villageNativePresentation.pendingLevels.has('townhall#3'),
        ),
      ).toBe(false);
      if (revisit) await scout(page);
      release();
      await page.waitForFunction(() => window.__releasedVillageDecoded);
      if (revisit) {
        await page.waitForFunction(() =>
          window.__game.scene.villageNativePresentation.levelsReady.get('townhall')?.has(3),
        );
        expect(await page.evaluate(() => window.__game.model.battle?.started)).toBe(false);
      } else {
        expect(
          await page.evaluate(
            (path) =>
              Object.entries(window.__game.scene.textures.list).some(
                ([key, texture]) =>
                  key.startsWith('village:townhall:') &&
                  texture.source.some((source) => source.image.src?.endsWith(path)),
              ),
            path,
          ),
        ).toBe(false);
      }
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });
}
