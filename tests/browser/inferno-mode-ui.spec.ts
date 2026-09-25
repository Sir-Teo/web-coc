import { expect, test } from '@playwright/test';
for (const width of [1440, 390])
  test(`Inferno mode controls and source stats at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model, scene } = window.__game;
      model.state.obstacles = [];
      model.state.buildings = [
        makeBuilding(1, 'townhall', 20, 20, 8),
        makeBuilding(2, 'builder', 26, 26),
        makeBuilding(3, 'inferno', 10, 10, 8),
      ];
      model.state.nextId = 4;
      model.selected = 3;
      model.changed();
      scene.sync();
    });
    await page.getByRole('button', { name: 'Switch Inferno Tower to multi-target mode' }).click();
    await expect(page.locator('.context-art')).toHaveAttribute(
      'src',
      '/assets/inferno-native/portrait/8-multi.png',
    );
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-table')).toContainText('Multi-target');
    await expect(page.locator('.info-table')).toContainText('10 tiles');
    await expect(page.locator('.info-table')).toContainText('Damage per second per target');
    await expect(page.locator('.info-hero img')).toHaveAttribute(
      'src',
      '/assets/inferno-native/portrait/8-multi.png',
    );
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/inferno-mode-info-${width}-${browserName}.png`,
    });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Switch Inferno Tower to single-target mode' }).click();
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-table')).toContainText('80 → 210 → 2,100');
    await expect(page.locator('.info-table')).toContainText('9 tiles');
  });
