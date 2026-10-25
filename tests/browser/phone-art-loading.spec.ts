import { expect, test, type Page } from '@playwright/test';

const watch = (page: Page) => {
  const requested: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => requested.push(new URL(request.url()).pathname));
  page.on('pageerror', (error) => errors.push(error.message));
  return { requested, errors };
};
const mortarLoaded = (page: Page) =>
  page.evaluate(() =>
    window.__game.game.textures.getTextureKeys().some((key) => key.startsWith('mortar:mesh:')),
  );
const boot = async (page: Page, query = '') => {
  await page.goto('/' + query);
  await page.waitForFunction(() => window.__game?.scene.artSettled);
};

test.describe('phone development preview', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test('default boot skips unused art and loads a defense when its battle opens', async ({
    page,
  }) => {
    const { requested, errors } = watch(page);
    await boot(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect(await mortarLoaded(page)).toBe(false);
    expect(requested.some((path) => path.endsWith('/mortar/runtime.json'))).toBe(false);
    expect(requested.some((path) => /\/characters\/walk\/giant/.test(path))).toBe(false);

    await page.evaluate(async () => {
      const { emptyArmy } = await import('/src/game/army.ts');
      const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
      const { model } = window.__game;
      model.state.army = { ...emptyArmy(), swordsman: 20 };
      model.state.nativeCampaign = freshNativeCampaign();
      model.state.nativeCampaign.stars.fill(1);
      model.changed();
      model.startCampaign(40);
    });
    await page.waitForFunction(() => window.__game.scene.artSettled);
    expect(await mortarLoaded(page)).toBe(true);
    expect(requested.some((path) => path.endsWith('/mortar/runtime.json'))).toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.__game.scene.mortarPresentation.towers.size))
      .toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('explicit eager art keeps the full gallery available on a phone', async ({ page }) => {
    const { requested, errors } = watch(page);
    await boot(page, '?eagerart');
    expect(await mortarLoaded(page)).toBe(true);
    expect(
      await page.evaluate(
        () =>
          window.__game.game.textures
            .getTextureKeys()
            .filter((key) => key === 'mortar' || key.startsWith('mortar-level-')).length,
      ),
    ).toBe(18);
    expect(requested.some((path) => path.endsWith('/mortar/runtime.json'))).toBe(true);
    expect(requested.some((path) => /\/characters\/walk\/giant/.test(path))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('explicit lazy art takes precedence over eager art', async ({ page }) => {
    const { requested, errors } = watch(page);
    await boot(page, '?eagerart&lazyart');
    expect(await mortarLoaded(page)).toBe(false);
    expect(requested.some((path) => path.endsWith('/mortar/runtime.json'))).toBe(false);
    expect(errors).toEqual([]);
  });
});

test('desktop development still preloads the visual gallery', async ({ page }) => {
  const { requested, errors } = watch(page);
  await boot(page);
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(false);
  expect(await mortarLoaded(page)).toBe(true);
  expect(requested.some((path) => path.endsWith('/mortar/runtime.json'))).toBe(true);
  expect(errors).toEqual([]);
});
