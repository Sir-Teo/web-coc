import { expect, test } from '@playwright/test';
for (const width of [1440, 390])
  test(`original Archer Tower portraits display in menus at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('[data-action="skip-tutorial"]').click();
    for (let level = 1; level <= 21; level++) {
      await page.evaluate(async (level) => {
        const { makeBuilding } = await import('/src/game/model.ts');
        const { model, scene } = window.__game;
        model.state.obstacles = [];
        model.state.buildings = [
          makeBuilding(1, 'townhall', 20, 20, 8),
          makeBuilding(2, 'builder', 26, 26),
          makeBuilding(3, 'archertower', 10, 10, level),
        ];
        model.state.nextId = 4;
        model.selected = 3;
        model.changed();
        scene.sync();
      }, level);
      await expect(page.locator('.context-art')).toHaveAttribute(
        'src',
        `/assets/archer-tower-native/portrait/${level}.png`,
      );
      await page.locator('[data-action="info"]').click();
      const portrait = page.locator('.info-hero img');
      await expect(portrait).toHaveAttribute(
        'src',
        `/assets/archer-tower-native/portrait/${level}.png`,
      );
      await expect(portrait).toBeVisible();
      await portrait.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        if (!img.naturalWidth) throw Error('Empty original portrait');
        const r = img.getBoundingClientRect();
        if (r.left < 0 || r.right > innerWidth) throw Error('Portrait exceeds viewport');
      });
      if (level === 7) {
        await expect(page.locator('.info-table')).toContainText('Level 8');
        await page.screenshot({
          animations: 'disabled',
          path: `output/playtest/archer-tower-info-${width}-${browserName}.png`,
        });
      }
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    }
    await page.locator('.shop-btn').click();
    await page.getByRole('tab', { name: 'Defenses', exact: true }).click();
    const shop = page
      .locator('.shop-tile')
      .filter({ has: page.locator('[data-action="build:archertower"]') })
      .locator('img');
    await expect(shop).toHaveAttribute('src', '/assets/archer-tower-native/portrait/1.png');
    await shop.scrollIntoViewIfNeeded();
    await expect(shop).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/archer-tower-shop-${width}-${browserName}.png`,
    });
  });
