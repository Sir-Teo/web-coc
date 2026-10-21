import { test, expect } from '@playwright/test';

for (const actor of [
  { name: 'troop', stage: 90, url: '**/assets/troops-native/giant/graph.json', hero: false },
  { name: 'hero', stage: 93, url: '**/assets/characters/king-v1/atlas.json', hero: true },
  {
    name: 'hero image',
    stage: 93,
    url: '**/assets/characters/king-v1/front-right.webp',
    hero: true,
  },
]) {
  test(`failed native ${actor.name} art backs off and recovers without restarting the battle`, async ({
    page,
  }) => {
    const attempts: number[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(actor.url, async (route) => {
      attempts.push(Date.now());
      await route.fulfill({ status: 503, body: 'Temporarily unavailable' });
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const unitId = await page.evaluate(({ stage, hero }) => {
      const { model, scene } = window.__game;
      model.townhall!.level = 13;
      model.startCampaign(stage, false);
      scene.sync();
      model.activeSpell = null;
      model.activeHeroKind = hero ? 'king' : null;
      model.activeTroop = 'giant';
      for (let x = 1; x < 48; x++)
        for (let y = 1; y < 48; y++) {
          const point = scene.screenFor(x, y);
          if (
            model.deployBlocked(x, y) ||
            point.x < 100 ||
            point.x > innerWidth - 100 ||
            point.y < 250 ||
            point.y > innerHeight - 250
          )
            continue;
          if (!model.deploy(x, y)) throw Error('Could not deploy the test unit');
          // Keep combat still but advance the presentation clock while the real scene renders.
          model.step = (dt) => {
            if (model.battle) model.battle.elapsed += dt;
          };
          return model.battle!.units.at(-1)!.id;
        }
      throw Error('No visible deployment ground');
    }, actor);

    await page.waitForFunction(() => window.__game.scene.artSettled);
    await expect.poll(() => attempts.length).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    for (let i = 1; i < attempts.length; i++)
      expect(attempts[i] - attempts[i - 1]).toBeGreaterThanOrEqual(4500);
    if (actor.hero) {
      expect(
        await page.evaluate(() =>
          window.__game.game.textures
            .getTextureKeys()
            .filter((key) => key.startsWith('baked:heroes-native/king/')),
        ),
      ).toEqual([]);
    }

    await page.unroute(actor.url);
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ hero, id }) => {
              const scene = window.__game.scene;
              return hero
                ? scene.heroNativePresentation.drewUnit(id)
                : scene.troopNativePresentation.drewUnit(id);
            },
            { hero: actor.hero, id: unitId },
          ),
        { timeout: 15000 },
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/native-art-retry-${actor.name}.png` });
    expect(errors).toEqual([]);
  });
}
