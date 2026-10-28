import { expect, test } from '@playwright/test';

for (const c of [
  { kind: 'superminion', original: 'minion', name: 'Super Minion', baseName: 'Minion', width: 390 },
  {
    kind: 'rocketballoon',
    original: 'balloon',
    name: 'Rocket Balloon',
    baseName: 'Balloon',
    width: 1440,
  },
])
  for (const method of ['dark', 'potion'])
    test(`${c.name} level-eight boost via ${method} at ${c.width}px`, async ({ page }) => {
      test.setTimeout(120000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.evaluate(async (c) => {
        const { model: m, scene } = window.__game,
          { makeBuilding } = await import('/src/game/model.ts');
        scene.paused = true;
        m.townhall.level = 12;
        m.state.buildings.find((b) => b.kind === 'barracks').level = 6;
        m.state.buildings.push(makeBuilding(m.state.nextId++, 'darkbarracks', 32, 32, 1));
        m.state.troopLevels = { ...m.state.troopLevels, [c.original]: 7 };
        m.state.dark = 100000;
        m.state.superBoosts = {};
        m.clearArmy();
        m.addMagicItem('super-potion', 1);
        m.changed();
        scene.sync();
      }, c);
      await page.locator('.train-add').click();
      await page.locator('#army-search').fill(c.name);
      const tile = page
          .locator('.army-tile')
          .filter({ has: page.locator(`[data-action="troop-info:${c.kind}"]`) }),
        currency = tile.locator(`[data-action="boost-super:${c.kind}"]`),
        potion = tile.locator(`[data-action="super-potion:${c.kind}"]`);
      await expect(currency).toBeDisabled();
      await expect(potion).toBeDisabled();
      await expect(tile).toContainText(`TH11 · ${c.baseName} level 8`);
      await page.getByRole('button', { name: `About ${c.name}`, exact: true }).click();
      await expect(
        page
          .locator('.troop-stats > div')
          .filter({ has: page.getByText('Boost requirement', { exact: true }) })
          .locator('dd'),
      ).toHaveText(`TH11 · ${c.baseName} level 8`);
      await expect(page.locator('.troop-info-hero p')).toContainText('Super Troop boost');
      await expect(page.locator('.troop-info-hero p')).not.toContainText('Barracks level');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        c.width,
      );
      await page.screenshot({
        path: `output/playtest/super-minimum-${c.kind}-${method}-${c.width}.png`,
      });
      await page
        .locator('.troop-info-body')
        .getByRole('button', { name: 'Train troops', exact: true })
        .click();
      expect(
        await page.evaluate(() => ({
          dark: window.__game.model.state.dark,
          items: window.__game.model.magicItemCount('super-potion'),
        })),
      ).toEqual({ dark: 100000, items: 1 });
      await page.evaluate((original) => {
        const m = window.__game.model;
        m.state.troopLevels = { ...m.state.troopLevels, [original]: 8 };
        m.changed();
      }, c.original);
      await expect(currency).toBeEnabled();
      await expect(potion).toBeEnabled();
      await (method === 'dark' ? currency : potion).click();
      await expect(tile.locator('.boost-left')).toContainText('Boosted');
      const result = await page.evaluate((kind) => {
        const m = window.__game.model;
        return {
          dark: m.state.dark,
          items: m.magicItemCount('super-potion'),
          duration: m.state.superBoosts[kind] - m.clock,
        };
      }, c.kind);
      expect(result).toEqual({
        dark: method === 'dark' ? 75000 : 100000,
        items: method === 'dark' ? 1 : 0,
        duration: 72 * 3600000,
      });
      await tile.locator(`[data-action="train:${c.kind}"]`).click();
      await expect(tile.locator(`[data-army-count="troop:${c.kind}"]`)).toHaveText('1');
      expect(errors).toEqual([]);
    });
