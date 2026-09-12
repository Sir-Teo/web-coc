import { expect, test } from '@playwright/test';

for (const [width, height] of [
  [1440, 960],
  [390, 844],
  [844, 390],
])
  test(`Dark Elixir loot, overflow and saved depletion at ${width}×${height}`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async () => {
      const { makeBuilding, makeNpcBuilding } = await import('/src/game/model.ts');
      const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
      const { model: m, scene } = window.__game;
      scene.paused = true;
      m.state.nativeCampaign = freshNativeCampaign();
      m.state.obstacles = [];
      m.state.buildings.push(makeBuilding(m.state.nextId++, 'darkstorage', 2, 2));
      m.state.dark = 9863;
      m.startBattle(0);
      m.discardRecording();
      // Supported entities isolate three-resource presentation. The actual source
      // village retains its guards for unimplemented Town Hall/defense levels.
      Object.assign(m.battle, {
        catalog: 'goblin-v1',
        index: 50,
        buildings: [makeNpcBuilding(1000, 'goblin-townhall', 10, 10)],
        availableLoot: m.campaignLoot(50, 'goblin-v1'),
        lootRoom: { gold: 0, elixir: 0, dark: 137 },
      });
      m.changed();
      scene.sync();
    });
    await expect(page.locator('[aria-label="Dark Elixir remaining"]')).toBeVisible();
    await expect(page.locator('[data-loot="dark"]')).toHaveText('2,000');
    await expect(page.locator('.loot-capacity-note')).toBeVisible();
    const box = await page.locator('.battle-enemy').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThan(height - 90);
    await page.screenshot({ path: `output/playtest/dark-loot-hud-${width}-${browserName}.png` });
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      const hall = m.battle.buildings[0];
      m.damage(hall, hall.maxHp / 2);
      m.finishBattle();
      scene.sync();
    });
    const dark = page.locator('.result-loot > div').filter({ hasText: 'Dark Elixir received' });
    await expect(dark).toBeVisible();
    await expect(dark.locator('b')).toHaveText('137');
    await expect(page.locator('.loot-overflow-note')).toContainText('863 Dark Elixir');
    await page.screenshot({ path: `output/playtest/dark-loot-result-${width}-${browserName}.png` });
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    expect(
      await page.evaluate(() => ({
        dark: window.__game.model.state.dark,
        remaining: window.__game.model.state.nativeCampaign.remaining[50].dark,
        result: window.__game.model.state.raidLog[0].result.dark,
      })),
    ).toEqual({ dark: 10000, remaining: 1000, result: 137 });
    expect(errors).toEqual([]);
  });
