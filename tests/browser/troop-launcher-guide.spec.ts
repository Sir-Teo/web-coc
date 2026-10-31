import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 960 },
])
  for (const upgraded of [false, true])
    test(`Troop Launcher previews explain friendly barrels, upgraded=${upgraded} at ${viewport.width}`, async ({
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
          trooplauncher: upgraded ? 4 : 1,
        };
        m.changed();
      }, upgraded);
      await page.locator('.train-add').click();
      await page.evaluate(() => window.__game.game.loop.sleep());
      for (const profile of [
        {
          name: 'Troop Launcher',
          target: 'Friendly ground and air troops',
          tactic: 'Deploy a fighting group first',
          facts: {
            'Barrel stock': upgraded ? '7' : '5',
            'Deployment warmup': '0.8 s',
            'Barrel charge': '0.2 s',
            'Barrel flight': '2.2 s',
            'Health loss': '25 HP/s',
            'Can receive healing': 'No',
            'Giants per barrel': '1',
            'Barbarians per barrel': '2',
            'Archers per barrel': upgraded ? '4' : '3',
            'Wall Breakers per barrel': upgraded ? '2' : '1',
            'Payload troop levels': upgraded ? '12' : '9',
            'Healing per second': '1',
            'Healing per barrel': '6',
            'Barrel interval': '6s',
            'Reinforcement range': '80 tiles',
            Hitpoints: upgraded ? '2,600' : '2,000',
          },
        },
      ]) {
        const tile = page
          .locator('.army-tile')
          .filter({ has: page.getByRole('button', { name: 'About Troop Launcher', exact: true }) });
        await expect(tile.locator('.shop-count')).toContainText(`${upgraded ? 7 : 5} barrels`);
        await page.getByRole('button', { name: `About ${profile.name}`, exact: true }).click();
        const row = (label: string) =>
          page
            .locator('.troop-stats > div')
            .filter({ has: page.getByText(label, { exact: true }) })
            .locator('dd');
        await expect(row('Favorite target')).toHaveText(profile.target);
        await expect(page.locator('.troop-info-hero .eyebrow')).toContainText('SUPPORT');
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
          path: `output/playtest/launcher-guide-${profile.name.replaceAll(' ', '-').toLowerCase()}-${upgraded}-${viewport.width}.png`,
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
