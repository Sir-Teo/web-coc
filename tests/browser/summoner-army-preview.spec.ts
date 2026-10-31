import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 960 },
])
  for (const upgraded of [false, true])
    test(`summoner Army previews show their real role, upgraded=${upgraded} at ${viewport.width}`, async ({
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
          furnace: upgraded ? 4 : 1,
          ruinwitch: upgraded ? 4 : 1,
          siegebarracks: upgraded ? 6 : 1,
        };
        m.changed();
      }, upgraded);
      await page.locator('.train-add').click();
      await page.evaluate(() => window.__game.game.loop.sleep());
      for (const profile of [
        {
          name: 'Furnace',
          target: 'None',
          tactic: 'health auras can extend its lifetime',
          facts: {
            'Firemite stock': upgraded ? '22' : '19',
            'Base lifetime': '60 s',
            'Health loss': upgraded ? '30 HP/s' : '25.5 HP/s',
            'Firemite hitpoints': upgraded ? '325' : '250',
            'Firemite damage per jump': upgraded ? '80' : '50',
            'Firemite targets': 'Ground and air',
          },
        },
        {
          name: 'Ruin Witch',
          target: 'Rubble',
          tactic: 'Destroy buildings first',
          facts: {
            'Knights per rubble pile': '1',
            'Lifetime Knight limit': '8',
            'Vacuum time': '4 s',
            'Summon windup': '2 s',
            'Knight hitpoints': upgraded ? '4,000' : '3,100',
            'Knight DPS': upgraded ? '345' : '255',
            'Knight targets': 'Ground only',
            'Knight damage vs walls': upgraded ? '1,035' : '765',
            'Knight health loss': '80 HP/s',
          },
        },
        {
          name: 'Siege Barracks',
          target: 'None',
          tactic: 'Deploy on a safe edge',
          facts: { 'Base lifetime': '30 s', 'First release delay': '1.3 s' },
        },
      ]) {
        const tile = page.locator('.army-tile').filter({
          has: page.getByRole('button', { name: `About ${profile.name}`, exact: true }),
        });
        await expect(tile.locator('.troop-info-button')).toContainText(/summoner/i);
        await expect(tile.locator('.shop-count')).toContainText('Summons');
        await page.getByRole('button', { name: `About ${profile.name}`, exact: true }).click();
        const row = (label: string) =>
          page
            .locator('.troop-stats > div')
            .filter({ has: page.getByText(label, { exact: true }) })
            .locator('dd');
        await expect(page.locator('.troop-info-hero .eyebrow')).toContainText(/summoner/i);
        await expect(row('Favorite target')).toHaveText(profile.target);
        await expect(row('Attack targets')).toHaveText('None');
        for (const label of [
          'Damage per second',
          'Damage per hit',
          'Attack range',
          'Attack interval',
        ])
          await expect(row(label)).toHaveCount(0);
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
          path: `output/playtest/summoner-${profile.name.replaceAll(' ', '-').toLowerCase()}-${upgraded}-${viewport.width}.png`,
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
