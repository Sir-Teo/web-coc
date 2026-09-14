import { test, expect } from '@playwright/test';

// Late Goblin Map art (about 40 MB) must not slow the home village's boot. It loads for the first
// battle that needs it, and that battle holds deployments until the art can render.
test.describe.configure({ timeout: 120_000 });

const LATE_ART =
  /\/assets\/(characters-native|buildings\/(eagle-artillery|scattershot|monolith|spell-tower|tornado-trap|freeze-trap|late-goblin|builder-hut)-native)\//;

test('late campaign art loads on first use and holds deployment until it renders', async ({
  page,
}) => {
  const requested: string[] = [];
  const errors: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(LATE_ART, async (route) => {
    requested.push(new URL(route.request().url()).pathname);
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  expect(requested).toEqual([]);
  expect(await page.evaluate(() => window.__game.scene.lateAssetsReady)).toBe(false);
  await page.evaluate(async () => {
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const { emptyArmy } = await import('/src/game/army.ts');
    const m = window.__game.model;
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.state.army = { ...emptyArmy(), archer: 10 };
    m.changed();
  });

  // No Flight Zone's Dragon and Balloons use boot-time art.
  await page.locator('.attack-btn').click();
  await page.locator('[data-action="attack:56"]').click();
  await expect(page.locator('.battle-enemy h2')).toHaveText('No Flight Zone');
  await page.waitForTimeout(300);
  expect(requested).toEqual([]);
  await page.locator('[data-action="home"]').click();
  await expect(page.locator('.battle-enemy')).toHaveCount(0);

  // Bowling Alley's Eagle Artillery requests the late art; taps wait while it loads.
  await page.locator('.attack-btn').click();
  await page.locator('[data-action="attack:63"]').click();
  await expect(page.locator('.battle-enemy h2')).toHaveText('Bowling Alley');
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  // A legal deployment point on screen, clear of the scouting banner and troop tray.
  const spot = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    for (let y = 24.5; y < 46; y += 0.5)
      for (let x = 24.5; x < 46; x += 0.5) {
        const point = scene.screenFor(x, y);
        const open = [-1, 0, 1].every((dx) =>
          [-1, 0, 1].every((dy) => !m.deployBlocked(x + dx, y + dy)),
        );
        if (
          open &&
          point.x > 300 &&
          point.x < innerWidth - 300 &&
          point.y > 300 &&
          point.y < innerHeight - 240
        )
          return point;
      }
    throw Error('No legal deployment point on screen');
  });
  await page.mouse.click(spot.x, spot.y);
  await expect(page.locator('#toast')).toContainText('Loading village art');
  const held = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const eagle = m.battle.buildings.find((b) => b.kind === 'eagleartillery');
    return {
      units: m.battle.units.length,
      started: m.battle.started,
      ready: scene.lateAssetsReady,
      fallbackAlpha: scene.sprites.get(eagle.id).alpha,
    };
  });
  expect(held).toEqual({ units: 0, started: false, ready: false, fallbackAlpha: 0 });

  release();
  await page.waitForFunction(() => window.__game.scene.lateAssetsReady, null, { timeout: 60_000 });
  // One rendered frame applies the late presentation to the waiting battle.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const rendered = await page.evaluate(() => {
    const { model: m, scene, game } = window.__game;
    const eagle = m.battle.buildings.find((b) => b.kind === 'eagleartillery');
    const objects = scene.children.list as {
      visible?: boolean;
      alpha?: number;
      texture?: { key: string };
      getData?: (key: string) => { id: number } | undefined;
    }[];
    return {
      body: objects.some((o) => o.getData?.('eagleArtillery')?.id === eagle.id),
      missing: objects.filter((o) => o.visible && o.alpha && o.texture?.key === '__MISSING').length,
      gl: game.renderer.gl.getError(),
    };
  });
  expect(rendered).toEqual({ body: true, missing: 0, gl: 0 });
  await page.mouse.click(spot.x, spot.y);
  await expect
    .poll(() => page.evaluate(() => window.__game.model.battle.units.length))
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'output/playtest/late-assets-deferred.png' });
  expect(errors).toEqual([]);
});
