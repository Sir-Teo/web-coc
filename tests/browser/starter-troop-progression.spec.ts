import { test, expect } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
]) {
  test(`starter research shows native previews, survives reload and completes at ${viewport.width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('#loading').waitFor({ state: 'detached' });
    await useDevelopedVillage(page);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('.train-add').click();
    await page.locator('[data-action="research"]').click();
    const barbarian = page
      .locator('.training-card')
      .filter({ has: page.locator('[data-action="research-start:swordsman"]') });
    const archer = page
      .locator('.training-card')
      .filter({ has: page.locator('[data-action="research-start:archer"]') });
    await expect(barbarian.locator('.research-stats')).toHaveText(/Health 45 → 54.*Damage 9 → 12/);
    await expect(archer.locator('.research-stats')).toHaveText(/Health 22 → 26.*Damage 8 → 10/);
    await expect(page.locator('[data-action="research-start:swordsman"]')).toBeEnabled();
    await expect(page.locator('[data-action="research-start:swordsman"]')).toContainText('10,000');
    await expect(page.locator('[data-action="research-start:archer"]')).toBeEnabled();
    await expect(page.locator('[data-action="research-start:archer"]')).toContainText('20,000');
    await expect(page.locator('[data-action="research-start:giant"]')).toBeDisabled();
    await page.locator('[data-action="research-start:swordsman"]').click();
    await expect(page.locator('[data-research]')).toBeVisible();
    const before = await page.evaluate(async () => {
      const { model: m } = window.__game;
      const { saveGame } = await import('/src/game/save.ts');
      await saveGame(m.state);
      return {
        end: m.state.research.end,
        remaining: m.state.research.end - m.clock,
        gems: m.state.gems,
        elixir: m.state.elixir,
      };
    });
    expect(before.remaining).toBeGreaterThan(1795000);
    expect(before.remaining).toBeLessThanOrEqual(1800000);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('.train-add').click();
    await page.locator('[data-action="research"]').click();
    expect(await page.evaluate(() => window.__game.model.state.research.end)).toBe(before.end);
    await page.locator('[data-action="research-finish"]').click();
    await expect(barbarian.locator('.research-stats')).toHaveText(/Health 54 → 65.*Damage 12 → 15/);
    await expect(page.locator('[data-action="research-start:swordsman"]')).toBeDisabled();
    await expect(page.locator('[data-action="research-start:swordsman"]')).toHaveText(
      'Requires laboratory 3',
    );
    const after = await page.evaluate(() => {
      const { model: m } = window.__game;
      return { level: m.troopLevel('swordsman'), gems: m.state.gems, elixir: m.state.elixir };
    });
    expect(after).toEqual({ level: 2, gems: before.gems - 11, elixir: before.elixir });
    await expect(page.locator('#toast')).not.toHaveClass(/show/);
    await page.locator('.modal').evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((animation) => animation.finished));
    });
    await page.screenshot({
      path: `output/playtest/starter-research-${viewport.width}-${browserName}.png`,
    });
    await page.locator('[data-action="close"]').click();
    await expect(page.locator('[data-action="research"]')).toBeFocused();
    await page.getByRole('button', { name: 'About Barbarian', exact: true }).click();
    const stat = (name: string) =>
      page
        .locator('.troop-stats > div')
        .filter({ has: page.getByText(name, { exact: true }) })
        .locator('dd');
    await expect(stat('Hitpoints')).toHaveText('54');
    await expect(stat('Damage per second')).toHaveText('12');
    await expect(stat('Attack range')).toHaveText('0.4 tiles');
    await expect(stat('Attack interval')).toHaveText('1s');
    await page.locator('.modal').evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((a) => a.finished));
    });
    await page.screenshot({
      path: `output/playtest/starter-stats-${viewport.width}-${browserName}.png`,
    });
  });
}
