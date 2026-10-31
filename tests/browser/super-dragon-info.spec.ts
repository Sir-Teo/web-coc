import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 960 },
])
  for (const max of [false, true])
    test(`Super Dragon flame readout, max=${max} at ${viewport.width}`, async ({ page }) => {
      test.setTimeout(180000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize(viewport);
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.evaluate((max) => {
        const m = window.__game.model;
        m.state.troopLevels = { ...m.state.troopLevels, dragon: max ? 13 : 3 };
        m.changed();
      }, max);
      await page.locator('.train-add').click();
      await page.evaluate(() => window.__game.game.loop.sleep());
      const tile = page
        .locator('.army-tile')
        .filter({ has: page.getByRole('button', { name: 'About Super Dragon', exact: true }) });
      await expect(tile.locator('.shop-count')).toContainText(max ? '192.46' : '107.88');
      await page.getByRole('button', { name: 'About Super Dragon', exact: true }).click();
      const row = (label: string) =>
        page
          .locator('.troop-stats > div')
          .filter({ has: page.getByText(label, { exact: true }) })
          .locator('dd');
      for (const [label, value] of Object.entries({
        'Flames per burst': 'Up to 10',
        'Flame spacing': '0.192 s',
        'First flame charge': '0.32 s',
        'Damage per second': max ? '537' : '301',
        'Damage per flame': max ? '192.46' : '107.88',
        'Burst interval': '3.584s',
        'Attack targets': 'Ground and air',
        'Attack splash': '1.6 tiles',
      }))
        await expect(row(label)).toHaveText(value);
      await expect(row('Damage per hit')).toHaveCount(0);
      await expect(row('Attack interval')).toHaveCount(0);
      await expect(page.locator('.troop-tactic')).toContainText(
        'Changing targets stops the remaining flames',
      );
      await page.locator('.modal').evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((a) => a.finished));
      });
      expect(
        await page
          .locator('.troop-info-body')
          .evaluate((body) =>
            [...body.querySelectorAll('.troop-stats > div')].every(
              (cell) => cell.scrollWidth <= cell.clientWidth,
            ),
          ),
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
      await page.screenshot({
        path: `output/playtest/super-dragon-info-${max}-${viewport.width}.png`,
        animations: 'disabled',
      });
      const train = page
        .locator('.troop-info-body')
        .getByRole('button', { name: 'Train troops', exact: true });
      await train.scrollIntoViewIfNeeded();
      expect((await train.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await train.click();
      await expect(
        page.getByRole('button', { name: 'About Super Dragon', exact: true }),
      ).toBeVisible();
      expect(errors).toEqual([]);
    });
