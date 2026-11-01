import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 960 },
])
  for (const upgraded of [false, true])
    test(`siege Army previews explain routes and death blasts, upgraded=${upgraded} at ${viewport.width}`, async ({
      page,
    }) => {
      test.setTimeout(180000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize(viewport);
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.evaluate((upgraded) => {
        const m = window.__game.model;
        m.state.troopLevels = {
          ...m.state.troopLevels,
          wallwrecker: upgraded ? 6 : 1,
          battleblimp: upgraded ? 6 : 1,
          stoneslammer: upgraded ? 6 : 1,
        };
        m.changed();
      }, upgraded);
      await page.locator('.train-add').click();
      await page.evaluate(() => window.__game.game.loop.sleep());
      for (const profile of [
        {
          name: 'Wall Wrecker',
          target: 'Walls (10× damage)',
          tactic: 'open a ground route',
          facts: {
            'Movement destination': 'Town Hall',
            'Wall damage multiplier': '10×',
            'Damage per ram vs walls': upgraded ? '8,710' : '3,250',
            'Damage per hit': upgraded ? '871' : '325',
            'Can receive healing': 'No',
            'Fresh ram charge': '0.75 s',
            'Ram recovery': '0.55 s',
            'Attack targets': 'Ground only',
            Movement: 'Ground',
          },
        },
        {
          name: 'Battle Blimp',
          target: 'Any building',
          tactic: 'bombs buildings along its flight',
          facts: {
            'Movement destination': 'Town Hall',
            'Damage on destruction': upgraded ? '1,200' : '700',
            'Death blast radius': '3 tiles',
            'Death blast delay': '0.7 s',
            'Damage per hit': upgraded ? '450' : '150',
            'Can receive healing': 'No',
            'Attack targets': 'Ground only',
            Movement: 'Air · ignores walls',
          },
        },
        {
          name: 'Stone Slammer',
          target: 'Defenses',
          tactic: 'other troops distract Air Defenses',
          facts: {
            'Damage on destruction': '500',
            'Death blast radius': '3 tiles',
            'Death blast delay': '0.416 s',
            'Primary damage per hit': upgraded ? '2,050' : '1,000',
            'Primary damage per second': upgraded ? '820' : '400',
            'Secondary blast damage': upgraded ? '350–700' : '100–200',
            'Secondary blast radius': '3 tiles',
            'Full secondary damage within': '2 tiles',
            'Secondary minimum damage at': '3 tiles',
            'Wall damage multiplier': '25×',
            'Can receive healing': 'No',
            'Attack targets': 'Ground only',
            Movement: 'Air · ignores walls',
          },
        },
      ]) {
        await page.getByRole('button', { name: `About ${profile.name}`, exact: true }).click();
        const row = (label: string) =>
          page
            .locator('.troop-stats > div')
            .filter({ has: page.getByText(label, { exact: true }) })
            .locator('dd');
        await expect(row('Favorite target')).toHaveText(profile.target);
        await expect(row('Contact damage vs walls')).toHaveCount(0);
        const labels = await page.locator('.troop-stats dt').allTextContents();
        expect(new Set(labels).size).toBe(labels.length);
        for (const [label, value] of Object.entries(profile.facts))
          await expect(row(label)).toHaveText(value);
        if (profile.tactic)
          await expect(page.locator('.troop-tactic')).toContainText(profile.tactic);
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
          path: `output/playtest/siege-${profile.name.replaceAll(' ', '-').toLowerCase()}-${upgraded}-${viewport.width}.png`,
          animations: 'disabled',
        });
        const train = page
          .locator('.troop-info-body')
          .getByRole('button', { name: 'Train troops', exact: true });
        await train.scrollIntoViewIfNeeded();
        expect((await train.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await train.click();
        await expect(
          page.getByRole('button', { name: `About ${profile.name}`, exact: true }),
        ).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
