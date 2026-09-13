import { test, expect } from '@playwright/test';

for (const width of [390, 320])
  test(`Wizard Tower source tiers, TH9 gate and level seventeen survive Info and reload at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async () => {
      const { wizardTowerVillage } = await import('/tests/fixtures/wizard-tower-battle.ts');
      const { model: m, scene } = window.__game;
      m.state = wizardTowerVillage(4);
      m.selected = 6;
      m.changed();
      scene.sync();
    });
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-hero')).toContainText('LEVEL 4 OF 17');
    await expect(page.locator('.info-hero img')).toHaveAttribute(
      'src',
      '/assets/buildings/wizard-tower-native/preview-4.png',
    );
    for (const value of ['730', '840', '5 tiles/s', '9 tiles/s'])
      await expect(page.locator('.info-table')).toContainText(value);
    await expect(page.locator('.info-upgrade')).toContainText('550,000');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.state.buildings[5] = makeBuilding(6, 'wizardtower', 18, 18, 6);
      m.selected = 6;
      m.changed();
      scene.sync();
    });
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-hero')).toContainText('LEVEL 6 OF 17');
    await expect(page.locator('.info-hero img')).toHaveAttribute(
      'src',
      '/assets/buildings/wizard-tower-native/preview-6.png',
    );
    await expect(page.locator('.info-upgrade')).toContainText('Requires Town Hall 9');
    expect(await page.locator('.info-upgrade button').count()).toBe(0);
    const bounds = await page.locator('.info-table').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await expect(page.locator('.modal')).toHaveCSS('opacity', '1');
    await expect(page.locator('.modal-backdrop')).toHaveCSS('opacity', '1');
    const hero = await page.locator('.info-hero').evaluate((el) => {
      const box = el.getBoundingClientRect();
      return {
        overflow: el.scrollWidth - el.clientWidth,
        childrenInside: [...el.querySelectorAll('p,.info-levels i')].every((child) => {
          const r = child.getBoundingClientRect();
          return r.left >= box.left && r.right <= box.right;
        }),
        markers: el.querySelectorAll('.info-levels i').length,
        rows: new Set(
          [...el.querySelectorAll('.info-levels i')].map((bar) => bar.getBoundingClientRect().top),
        ).size,
      };
    });
    expect(hero).toEqual({ overflow: 0, childrenInside: true, markers: 17, rows: 1 });
    await page.screenshot({
      path: `output/playtest/wizard-tower-th9-${width}-${browserName}.png`,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m } = window.__game;
      m.state.buildings[5] = makeBuilding(6, 'wizardtower', 18, 18, 17);
      m.changed();
    });
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.evaluate(() => {
      const m = window.__game.model;
      m.selected = 6;
      m.changed();
    });
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-hero')).toContainText('LEVEL 17 OF 17');
    await expect(page.locator('.info-hero img')).toHaveAttribute(
      'src',
      '/assets/buildings/wizard-tower-native/preview-17.png',
    );
    for (const value of ['3,300', '110', '143', '9 tiles/s'])
      await expect(page.locator('.info-table')).toContainText(value);
    expect(
      await page.evaluate(() => window.__game.model.state.buildings.find((b) => b.id === 6).level),
    ).toBe(17);
  });
