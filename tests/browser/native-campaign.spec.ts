import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`native Payback wins, persists and replays through the UI at ${viewport.width}`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.settings.reducedMotion = true;
      m.state.gold = m.state.elixir = 0;
      m.changed();
    });
    await page.locator('.attack-btn').click();
    await expect(page.locator('.campaign-card')).toHaveCount(90);
    // Scouting thumbnails must conceal native Tesla placements as well as traps.
    const thumbnails = await page.evaluate(async () => {
      const { NATIVE_CAMPAIGN } = await import('/src/game/native-campaign.ts');
      return NATIVE_CAMPAIGN.map((s, i) => ({
        actual:
          document.querySelectorAll('.campaign-card')[i].querySelectorAll('svg.campaign-map rect')
            .length - 1,
        expected: s.buildings.filter(([id]) => id !== 1000019).length,
      }));
    });
    expect(thumbnails.every((t) => t.actual === t.expected)).toBe(true);
    await expect(page.locator('.campaign-card').first()).toContainText('Payback');
    await expect(page.locator('[data-action="attack:1"]')).toBeEnabled();
    await expect(page.locator('[data-action="attack:2"]')).toBeDisabled();
    await expect(page.locator('[data-action="attack:37"]')).toHaveText('Coming soon');
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/native-campaign-map-${viewport.width}-${browserName}.png`,
    });
    await page.locator('[data-action="attack:0"]').click();
    await expect(page.locator('.battle-enemy h2')).toHaveText('Payback');
    await expect(page.locator('[data-loot="gold"]')).toHaveText('500');
    await expect(page.locator('#battle-timer')).toHaveText('∞');
    const native = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      return {
        buildings: m.battle.buildings.map((b) => [b.npc, b.x, b.y, b.hp]),
        scenery: scene.campaignScenery.length,
        textures: m.battle.buildings.map((b) => scene.sprites.get(b.id).texture.key),
        catalog: m.battle.catalog,
        point: scene.screenFor(32, 26),
      };
    });
    expect(native.catalog).toBe('goblin-v1');
    expect(native.buildings).toEqual([
      ['goblin-townhall', 30, 20, 400],
      ['tutorial-cannon', 23, 24, 250],
    ]);
    expect(native.scenery).toBe(14);
    expect(native.textures).toEqual(['goblin-townhall-v1', 'cannon']);
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/native-payback-${viewport.width}-${browserName}.png`,
    });
    for (let i = 0; i < 5; i++) {
      await page.mouse.click(native.point.x, native.point.y);
      await page.waitForTimeout(400);
    }
    expect(await page.evaluate(() => window.__game.model.battle.remaining.swordsman)).toBe(7);
    await page.evaluate(() => window.advanceTime(60000));
    await expect(page.locator('#result-title')).toHaveText('Victory!');
    const result = await page.evaluate(() => {
      const m = window.__game.model;
      return {
        result: m.battle.result,
        native: m.state.nativeCampaign,
        legacy: m.state.stars,
        record: m.state.raidLog[0].catalog,
      };
    });
    expect(result.result).toEqual({
      gold: 500,
      elixir: 500,
      trophies: 0,
      stars: 3,
      destruction: 100,
    });
    expect(result.native.remaining[0]).toEqual({ gold: 0, elixir: 0, dark: 0 });
    expect(result.legacy.every((s) => s === 0)).toBe(true);
    expect(result.record).toBe('goblin-v1');
    await page.locator('[data-action="home"]').click();
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('#loading').waitFor({ state: 'detached' });
    expect(await page.evaluate(() => window.__game.model.state.nativeCampaign)).toEqual(
      result.native,
    );
    await page.locator('[data-action="battle-log"]').click();
    await expect(page.locator('.raid-record h3').first()).toHaveText('Payback');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).click();
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await slider.focus();
    await slider.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    expect(await page.evaluate(() => window.__game.model.battle.result)).toEqual(result.result);
    expect(await page.evaluate(() => window.__game.model.state.nativeCampaign)).toEqual(
      result.native,
    );
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/native-payback-replay-${viewport.width}-${browserName}.png`,
    });
    expect(errors).toEqual([]);
  });
}

test('native scenery and Goblin Huts survive large-map and home transitions', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate(() => window.__game.model.startCampaign(1));
  await expect(page.locator('.battle-enemy h2')).toHaveText('Goblin Forest');
  await page.waitForFunction(
    () => window.__game.scene.renderedBattle === window.__game.model.battle,
  );
  expect(
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      const hut = model.battle.buildings.find((b) => b.npc === 'goblin-hut');
      return {
        texture: scene.sprites.get(hut.id).texture.key,
        hp: hut.hp,
        homeFlags: scene.homeDecorations.some((im) => im.visible),
      };
    }),
  ).toEqual({ texture: 'goblin-hut-v1', hp: 250, homeFlags: false });
  await page.screenshot({ path: `output/playtest/native-forest-${browserName}.png` });
  await page.locator('[data-action="home"]').click();
  await expect.poll(() => page.evaluate(() => window.__game.scene.campaignScenery.length)).toBe(0);
  expect(
    await page.evaluate(() => window.__game.scene.homeDecorations.every((im) => im.visible)),
  ).toBe(true);
  await page.evaluate(async () => {
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const m = window.__game.model;
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.startCampaign(49);
  });
  await expect(page.locator('.battle-enemy h2')).toHaveText('Sherbet Towers');
  await page.waitForFunction(
    () => window.__game.scene.renderedBattle === window.__game.model.battle,
  );
  const large = await page.evaluate(() => {
    const { model, scene } = window.__game;
    return {
      count: model.battle.buildings.length,
      scenery: scene.campaignScenery.length,
      expectedScenery: model.battle.scenery.length,
      zoom: scene.viewZoom,
      missing: scene.campaignScenery.filter((im) => im.texture.key === '__MISSING').length,
    };
  });
  expect(large.count).toBe(430);
  expect(large.scenery).toBe(large.expectedScenery);
  expect(large.missing).toBe(0);
  expect(large.zoom).toBeGreaterThan(0);
  await page.screenshot({ path: `output/playtest/native-sherbet-${browserName}.png` });
  expect(errors).toEqual([]);
});
