import catalog from '../../reference/dark-drill/catalog.json' with { type: 'json' };
import { expect, test } from '@playwright/test';
for (const width of [1440, 390])
  test(`original Drill portraits display in menus at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('[data-action="skip-tutorial"]').click();
    for (let level = 1; level <= 11; level++) {
      await page.evaluate(async (level) => {
        const { makeBuilding } = await import('/src/game/model.ts');
        const { model, scene } = window.__game;
        model.state.obstacles = [];
        model.state.buildings = [
          makeBuilding(1, 'townhall', 20, 20, 8),
          makeBuilding(2, 'builder', 26, 26),
          makeBuilding(3, 'darkdrill', 10, 10, level),
        ];
        model.state.nextId = 4;
        model.selected = 3;
        model.changed();
        scene.sync();
      }, level);
      await expect(page.locator('.context-art')).toHaveAttribute(
        'src',
        `/assets/dark-drill-native/portrait/${level}.png`,
      );
      await page.locator('[data-action="info"]').click();
      const production = catalog.levels[level - 1].production;
      await expect(page.locator('.info-table')).toContainText(
        `${production.per100Hours / 100} / hour`,
      );
      await expect(page.locator('.info-table')).toContainText(
        production.capacity.toLocaleString('en-US'),
      );
      const portrait = page.locator('.info-hero img');
      await expect(portrait).toHaveAttribute(
        'src',
        `/assets/dark-drill-native/portrait/${level}.png`,
      );
      await expect(portrait).toBeVisible();
      await portrait.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        if (!img.naturalWidth) throw Error('Empty original portrait');
      });
      if (level === 3)
        await page.screenshot({
          animations: 'disabled',
          path: `output/playtest/dark-drill-info-${width}-${browserName}.png`,
        });
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    }
  });
