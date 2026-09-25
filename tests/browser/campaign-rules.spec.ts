import { test, expect } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`finite loot, unlimited scouting, overflow and replay at ${viewport.width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('#loading').waitFor({ state: 'detached' });
    await useDevelopedVillage(page);
    await page.locator('[data-action="skip-tutorial"]').click();
    const trophies = await page.evaluate(async () => {
      const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
      const m = window.__game.model;
      m.state.nativeCampaign = freshNativeCampaign();
      m.state.nativeCampaign.remaining[0] = { gold: 400, elixir: 300, dark: 0 };
      m.state.nativeCampaign.remaining[1] = { gold: 0, elixir: 0, dark: 0 };
      m.state.nativeCampaign.stars[0] = 1;
      m.state.gold = m.resourceCap('gold');
      m.state.elixir = m.resourceCap('elixir');
      m.state.spells.lightning = 0;
      m.changed();
      return m.state.trophies;
    });
    await page.locator('.attack-btn').click();
    await expect(page.locator('.campaign-rules')).toContainText('No time limit');
    await expect(page.locator('.campaign-loot').first()).toContainText('400');
    await expect(page.locator('.campaign-card').nth(1)).toContainText('Loot depleted');
    await expect(page.locator('[data-action="attack:1"]')).toBeEnabled();
    await expect(page.locator('[data-action="attack:2"]')).toBeDisabled();
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/campaign-map-${viewport.width}-${browserName}.png`,
    });
    await page.locator('[data-action="attack:0"]').click();
    await expect(page.locator('#battle-timer')).toHaveText('∞');
    await expect(page.locator('[data-loot="gold"]')).toHaveText('400');
    await expect(page.locator('.loot-capacity-note')).toBeVisible();
    await page.evaluate(() => window.advanceTime(360000));
    expect(await page.evaluate(() => window.__game.model.battle.started)).toBe(false);
    await page.locator('[data-action="troop:swordsman"]').click();
    const point = await page.evaluate(() => {
      const { scene, model } = window.__game;
      const b = model.battle.buildings.find((b) => b.kind === 'townhall');
      // Center this target for reliable real pointer input at every viewport.
      scene.cameras.main.centerOn(896 + (b.x - b.y) * 32, 112 + (b.x + b.y + 3) * 16);
      scene.cameras.main.preRender();
      return scene.screenFor(32, 26);
    });
    await page.mouse.click(point.x, point.y);
    await expect
      .poll(() => page.evaluate(() => window.__game.model.battle.remaining.swordsman))
      .toBe(11);
    await page.evaluate(() => window.advanceTime(10000));
    await expect
      .poll(() => page.evaluate(() => window.__game.model.battle.lootTaken.gold))
      .toBeGreaterThan(0);
    await page.evaluate(() => window.advanceTime(310000));
    expect(await page.evaluate(() => window.__game.model.battle.finished)).toBe(false);
    await expect(page.locator('#battle-timer')).toHaveText('∞');
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/campaign-untimed-${viewport.width}-${browserName}.png`,
    });
    await page.locator('[data-action="surrender"]').click();
    await page.locator('[data-action="end"]').click();
    await expect(page.locator('.loot-overflow-note')).toContainText('Storages full');
    await expect(page.locator('.result-loot')).not.toContainText('Trophies');
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/campaign-overflow-${viewport.width}-${browserName}.png`,
    });
    const saved = await page.evaluate(() => {
      const m = window.__game.model;
      return {
        inventory: m.state.nativeCampaign,
        result: m.battle.result,
        trophies: m.state.trophies,
      };
    });
    expect(saved.trophies).toBe(trophies);
    expect(saved.inventory.remaining[0].gold).toBeLessThan(400);
    expect(saved.result.gold).toBe(0);
    await page.locator('[data-action="home"]').click();
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('#loading').waitFor({ state: 'detached' });
    expect(await page.evaluate(() => window.__game.model.state.nativeCampaign)).toEqual(
      saved.inventory,
    );
    await page.locator('[data-action="battle-log"]').click();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).click();
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await slider.focus();
    await slider.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    expect(await page.evaluate(() => window.__game.model.battle.result)).toEqual(saved.result);
    expect(await page.evaluate(() => window.__game.model.state.nativeCampaign)).toEqual(
      saved.inventory,
    );
    await expect(page.locator('#battle-timer')).toHaveText('∞');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test('campaigns depleted of loot stay attackable and show a clean zero-loot result', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const m = window.__game.model;
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.remaining[0] = { gold: 0, elixir: 0, dark: 0 };
    m.changed();
  });
  await page.locator('.attack-btn').click();
  await page.locator('[data-action="attack:0"]').click();
  await expect(page.locator('[data-loot="gold"]')).toHaveText('0');
  await expect(page.locator('.loot-capacity-note')).toHaveCount(0);
  await page.evaluate(() => window.__game.model.finishBattle());
  await expect(page.locator('.result-loot')).toContainText('Gold received');
  await expect(page.locator('.loot-overflow-note')).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.model.battle.result.gold)).toBe(0);
});
