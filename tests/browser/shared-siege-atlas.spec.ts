import { expect, test, type Page } from '@playwright/test';

const KINDS = ['battledrill', 'flameflinger', 'loglauncher', 'trooplauncher', 'wallwrecker'];
const SHARED = 'troop:battledrill:characters:mesh:8';
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
    window.__game.scene.paused = true;
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
          source.image?.src?.includes('/troops-native/battledrill/characters/texture-8.'),
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
  ).toEqual({ key: true, sources: 1, wrappers: 1, bytes: 3_640_400, error: 0 });
}

test('five siege packs share one GPU page and preserve it while a different machine stays warm', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await boot(page);
  await warm(page, KINDS);
  await expectShared(page);
  await page.evaluate(() => {
    const presentation = window.__game.scene.troopNativePresentation;
    presentation.clear();
    presentation.releaseExcept(new Set(['flameflinger']));
  });
  await expectShared(page);
  expect(
    await page.evaluate(() => [...window.__game.scene.troopNativePresentation.packs.keys()]),
  ).toEqual(['flameflinger']);
  await warm(page, ['wallwrecker']);
  await page.evaluate(() =>
    window.__game.scene.troopNativePresentation.releaseExcept(new Set(['wallwrecker'])),
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
  await warm(page, ['trooplauncher']);
  await expectShared(page);
  expect(errors).toEqual([]);
});

test('a released siege decode cannot resurrect the shared page after its last owner leaves', async ({
  page,
}) => {
  const path = '**/assets/troops-native/battledrill/characters/texture-8.png';
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = 0;
  await page.route(path, async (route) => {
    requested++;
    await gate;
    await route.continue();
  });
  try {
    await boot(page);
    await page.evaluate(() =>
      window.__game.scene.troopNativePresentation.prefetch(
        ['loglauncher', 'trooplauncher'],
        () => 1,
      ),
    );
    await expect.poll(() => requested).toBeGreaterThan(0);
    await page.evaluate(() => window.__game.scene.troopNativePresentation.releaseExcept());
    const done = page.waitForResponse(path);
    release();
    await (await done).finished();
    await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    expect(await page.evaluate((key) => window.__game.scene.textures.exists(key), SHARED)).toBe(
      false,
    );
    await page.unroute(path);
    await warm(page, ['loglauncher']);
    await expectShared(page);
  } finally {
    release();
  }
});
