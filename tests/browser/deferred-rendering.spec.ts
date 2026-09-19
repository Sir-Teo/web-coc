import { test, expect } from '@playwright/test';

test('deferred cannon artwork keeps complete fallback sprites on screen', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/buildings/cannon-native/**', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  try {
    const cannons = await page.evaluate(() => {
      const { model, scene } = window.__game;
      scene.sync();
      return model.buildings
        .filter((b) => b.kind === 'cannon')
        .map((b) => {
          const sprite = scene.sprites.get(b.id);
          return { texture: sprite.texture.key, visible: sprite.visible, alpha: sprite.alpha };
        });
    });
    expect(cannons.length).toBeGreaterThan(0);
    for (const cannon of cannons)
      expect(cannon).toEqual({ texture: 'cannon', visible: true, alpha: 1 });
    await page.screenshot({ path: 'output/playtest/deferred-rendering.png' });
  } finally {
    release();
  }
  await page.waitForFunction(() => window.__game.scene.heavyArtReady);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { model, scene } = window.__game;
        return model.buildings
          .filter((b) => b.kind === 'cannon')
          .every((b) => scene.sprites.get(b.id).alpha === 0);
      }),
    )
    .toBe(true);
});

test('a failed deferred page does not hide the cannon fallback', async ({ page }) => {
  let failed = '';
  await page.route('**/assets/buildings/cannon-native/**', async (route) => {
    failed ||= route.request().url();
    if (route.request().url() === failed) {
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  const report = await page.evaluate(async () => {
    const { model, scene } = window.__game;
    await scene.loadHeavyArt();
    scene.sync();
    return {
      ready: scene.heavyArtReady,
      cannons: model.buildings
        .filter((b) => b.kind === 'cannon')
        .map((b) => {
          const sprite = scene.sprites.get(b.id);
          return { visible: sprite.visible, alpha: sprite.alpha, texture: sprite.texture.key };
        }),
    };
  });
  expect(failed).not.toBe('');
  expect(report.ready).toBe(false);
  expect(report.cannons.length).toBeGreaterThan(0);
  for (const cannon of report.cannons) {
    expect(cannon.visible).toBe(true);
    expect(cannon.alpha).toBe(1);
    expect(cannon.texture).not.toBe('__MISSING');
  }
});
