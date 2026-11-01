import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 960 },
])
  for (const upgraded of [false, true])
    test(`Battle Drill previews explain surfacing destruction and stuns, upgraded=${upgraded} at ${viewport.width}`, async ({
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
          battledrill: upgraded ? 6 : 1,
        };
        m.changed();
      }, upgraded);
      await page.locator('.train-add').click();
      await page.evaluate(() => window.__game.game.loop.sleep());
      for (const profile of [
        {
          name: 'Battle Drill',
          target: 'Defenses',
          tactic: 'Burrow beneath walls to reach defenses',
          facts: {
            'Surfacing stun': '2 s',
            'Surfacing radius': '1.5 tiles',
            'Walls in surfacing radius': 'Destroyed',
            'Can receive healing': 'No',
            'Fresh drill charge': '1.5 s',
            'Drill recovery': '0.2 s',
            'Damage per second': upgraded ? '640' : '430',
            'Damage per hit': upgraded ? '1,088' : '731',
            Movement: 'Ground · burrows under walls',
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
        await expect(page.locator('.troop-tactic')).not.toContainText('diminishing effectiveness');
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
          path: `output/playtest/battle-drill-guide-${profile.name.replaceAll(' ', '-').toLowerCase()}-${upgraded}-${viewport.width}.png`,
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
