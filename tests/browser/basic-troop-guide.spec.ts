import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 960 },
])
  test(`basic troop advice follows combat rules at ${viewport.width}`, async ({ page }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('.train-add').click();
    await page.evaluate(() => window.__game.game.loop.sleep());
    for (const profile of [
      {
        name: 'Barbarian',
        target: 'Any building',
        tactic: 'clear exposed buildings',
        facts: { 'Attack targets': 'Ground only', Movement: 'Ground' },
      },
      {
        name: 'Archer',
        target: 'Any building',
        tactic: 'Shoot over walls',
        facts: { 'Attack targets': 'Ground and air', Movement: 'Ground' },
      },
      {
        name: 'Giant',
        target: 'Defenses',
        tactic: 'draw fire while ranged troops deal damage',
        facts: { 'Attack targets': 'Ground only', Movement: 'Ground' },
      },
      {
        name: 'Goblin',
        target: 'Resources (2× damage)',
        tactic: 'resource damage bonus',
        facts: { 'Attack targets': 'Ground only', Movement: 'Ground' },
      },
      {
        name: 'Wizard',
        target: 'Any building',
        tactic: 'target’s ground or air layer',
        facts: { 'Attack targets': 'Ground and air', 'Attack splash': '0.3 tiles' },
      },
      {
        name: 'Dragon',
        target: 'Any building',
        tactic: 'grouped ground or air defenders',
        facts: { 'Attack targets': 'Ground and air', Movement: 'Air · ignores walls' },
      },
      {
        name: 'P.E.K.K.A',
        target: 'Any building',
        tactic: 'heavy single-target swings',
        facts: { 'Attack targets': 'Ground only', Movement: 'Ground' },
      },
      {
        name: 'Miner',
        target: 'Any building',
        tactic: 'surfaces to attack',
        facts: { 'Attack targets': 'Ground only', Movement: 'Ground · burrows under walls' },
      },
      {
        name: 'Thrower',
        target: 'Any building',
        tactic: 'use their long range',
        facts: { 'Attack targets': 'Ground and air', Movement: 'Ground' },
      },
      {
        name: 'Hog Rider',
        target: 'Defenses',
        tactic: 'wall crossing to reach defenses',
        facts: { 'Attack targets': 'Ground only', Movement: 'Ground · crosses walls' },
      },
      {
        name: 'Valkyrie',
        target: 'Any building',
        tactic: 'sweeping attack',
        facts: { 'Attack targets': 'Ground only', Movement: 'Ground' },
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
      if (profile.tactic) await expect(page.locator('.troop-tactic')).toContainText(profile.tactic);
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
        path: `output/playtest/basic-guide-${profile.name.replaceAll(' ', '-').toLowerCase()}-${viewport.width}.png`,
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
