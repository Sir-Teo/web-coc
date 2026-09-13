import { test, expect } from '@playwright/test';

for (const width of [390, 320])
  test(`Air Sweeper Info shows original level five and the TH9 gate at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.townhall.level = 8;
      m.state.obstacles = [];
      m.state.buildings.push(makeBuilding(m.state.nextId++, 'airsweeper', 6, 10, 4));
      m.selected = m.state.buildings.at(-1).id;
      m.changed();
      scene.sync();
    });
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-hero')).toContainText('LEVEL 4 OF 7');
    await expect(page.locator('.info-table')).toContainText('Level 5');
    for (const value of ['900', '950', '3.2 tiles'])
      await expect(page.locator('.info-table')).toContainText(value);
    await expect(page.locator('.info-upgrade')).toContainText('Requires Town Hall 9');
    expect(await page.locator('.info-upgrade button').count()).toBe(0);
    const bounds = await page.locator('.info-table').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `output/playtest/air-sweeper-th9-gate-${width}-${browserName}.png`,
      animations: 'disabled',
    });
  });
