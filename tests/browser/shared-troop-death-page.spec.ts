import { expect, test, type Page } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { expectCancelledTroopDecode, watchTroopImageDecodes } from './image-decode-watch';

const KINDS = ['miner', 'healer', 'witch', 'golem', 'apprenticewarden'];
const SHARED = 'troop:shared:characters:mesh:2';
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
test.describe.configure({ timeout: 180000 });

async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const { scene } = window.__game;
    scene.paused = true;
    scene.troopNativePresentation.clear();
    scene.troopNativePresentation.releaseExcept();
    if (window.__imageDecodes) window.__imageDecodes.length = 0;
  });
}
async function warm(page: Page, kinds: string[]) {
  await page.evaluate(
    (kinds) => window.__game.scene.troopNativePresentation.prefetch(kinds, () => 1),
    kinds,
  );
  await page.waitForFunction(
    (kinds) =>
      kinds.every((kind) =>
        window.__game.scene.troopNativePresentation.levelsReady.get(kind)?.has(1),
      ),
    kinds,
  );
}
async function expectShared(page: Page) {
  expect(
    await page.evaluate((key) => {
      const { scene, game } = window.__game;
      const sources = Object.values(scene.textures.list)
        .flatMap((texture) => texture.source ?? [])
        .filter((source) =>
          source.image?.src?.includes('/garrison-death-native/texture/texture-2.'),
        );
      const wrappers = new Set(sources.map((source) => source.glTexture));
      return {
        key: scene.textures.exists(key),
        sources: sources.length,
        wrappers: wrappers.size,
        bytes: [...wrappers].reduce((sum, t) => sum + t.width * t.height * 4, 0),
        error: game.renderer.gl.getError(),
      };
    }, SHARED),
  ).toEqual({ key: true, sources: 1, wrappers: 1, bytes: 22_016, error: 0 });
}

test('five troop packs share one skull page and preserve it while another troop stays warm', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  // Paging can replace texture slots: verify the served graphs, as well as the raw witness.
  let served = 0;
  for (const kind of readdirSync('public/assets/troops-native')) {
    if (!existsSync(`public/assets/troops-native/${kind}/graph.json`)) continue;
    const response = await page.request.get(`/assets/troops-native/${kind}/graph.json`);
    expect(response.ok(), kind).toBe(true);
    const texture = (await response.json()).scenes.characters?.textures?.['2'];
    if (texture) {
      expect(texture, kind).toMatchObject({
        path: 'assets/garrison-death-native/texture/texture-2.png',
        width: 128,
        height: 43,
      });
      served++;
    }
    await response.dispose();
  }
  expect(served).toBeGreaterThan(0);
  await warm(page, KINDS);
  await expectShared(page);
  await page.evaluate(() => {
    const presentation = window.__game.scene.troopNativePresentation;
    presentation.clear();
    presentation.releaseExcept(new Set(['witch']));
  });
  await expectShared(page);
  expect(
    await page.evaluate(() => [...window.__game.scene.troopNativePresentation.packs.keys()]),
  ).toEqual(['witch']);
  await warm(page, ['golem']);
  await page.evaluate(() =>
    window.__game.scene.troopNativePresentation.releaseExcept(new Set(['golem'])),
  );
  await expectShared(page);
  await page.evaluate(async () => {
    const { game } = window.__game;
    const extension = game.renderer.gl.getExtension('WEBGL_lose_context');
    await new Promise<void>((resolve) => {
      game.canvas.addEventListener(
        'webglcontextlost',
        () => setTimeout(() => extension.restoreContext(), 50),
        { once: true },
      );
      game.canvas.addEventListener(
        'webglcontextrestored',
        () => game.events.once('postrender', resolve),
        { once: true },
      );
      extension.loseContext();
    });
  });
  await expectShared(page);
  await page.evaluate(() => window.__game.scene.troopNativePresentation.releaseExcept());
  expect(await page.evaluate((key) => window.__game.scene.textures.exists(key), SHARED)).toBe(
    false,
  );
  await warm(page, ['healer']);
  await expectShared(page);
  expect(errors).toEqual([]);
});

test('a released troop decode cannot resurrect the skull page after its last owner leaves', async ({
  page,
  browserName,
}) => {
  await watchTroopImageDecodes(page, ['/garrison-death-native/']);
  const path = '**/assets/garrison-death-native/texture/texture-2.png';
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = 0;
  let cancelled = 0;
  page.on('requestfailed', (request) => {
    if (request.url().endsWith('/garrison-death-native/texture/texture-2.png')) cancelled++;
  });
  await boot(page);
  await page.route(path, async (route) => {
    requested++;
    await gate;
    await route.continue();
  });
  try {
    await page.evaluate(() =>
      window.__game.scene.troopNativePresentation.prefetch(['miner', 'healer'], () => 1),
    );
    await expect.poll(() => requested).toBeGreaterThan(0);
    await page.evaluate(() => window.__game.scene.troopNativePresentation.releaseExcept());
    await expectCancelledTroopDecode(page, path);
    release();
    if (browserName === 'chromium') await expect.poll(() => cancelled).toBeGreaterThan(0);
    await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    expect(await page.evaluate((key) => window.__game.scene.textures.exists(key), SHARED)).toBe(
      false,
    );
    await page.unroute(path);
    await warm(page, ['miner']);
    await expectShared(page);
  } finally {
    release();
  }
});

test('cancelling one troop load keeps the skull page needed by a retained pending pack', async ({
  page,
}) => {
  const path = '**/assets/garrison-death-native/texture/texture-2.png';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await boot(page);
  await page.route(path, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.evaluate(() =>
      window.__game.scene.troopNativePresentation.prefetch(['miner', 'healer'], () => 1),
    );
    await page.waitForFunction(() => {
      const pending = window.__game.scene.troopNativePresentation.pendingLevels;
      return ['miner#1', 'healer#1'].every((key) => pending.has(key));
    });
    await page.evaluate(() =>
      window.__game.scene.troopNativePresentation.releaseExcept(new Set(['healer'])),
    );
    release();
    await warm(page, ['healer']);
    await expectShared(page);
    expect(
      await page.evaluate(() => [...window.__game.scene.troopNativePresentation.packs.keys()]),
    ).toEqual(['healer']);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
