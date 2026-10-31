import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 960 },
]) {
  test(`Army previews follow the Power Potion and return to research stats at ${viewport.width}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(() => {
      const m = window.__game.model;
      m.townhall.level = 18;
      m.state.troopLevels = { ...m.state.troopLevels, yeti: 1, giant: 5 };
      m.state.spellLevels = { ...m.state.spellLevels, clone: 1, freeze: 1, heal: 1 };
      m.addMagicItem('power-potion');
      m.changed();
    });
    await page.locator('.train-add').click();
    // Only DOM previews are under test; real combat retains separate potion checks.
    await page.evaluate(() => window.__game.game.loop.sleep());
    const tile = (name: string) =>
      page
        .locator('.army-tile')
        .filter({ has: page.getByRole('button', { name: `About ${name}`, exact: true }) });
    await expect(tile('Yeti').locator('h3')).toHaveText('Yeti ★1');
    await expect(tile('Clone Spell').locator('h3')).toHaveText('Clone ★1');
    expect(await page.evaluate(() => window.__game.model.usePotion('power-potion'))).toBe(true);
    await expect(tile('Yeti').locator('h3')).toHaveText('Yeti ★8');
    await expect(tile('Yeti').locator('.shop-count')).toContainText('4650');
    await expect(tile('Super Giant').locator('h3')).toHaveText('Super Giant ★14');
    await expect(tile('Clone Spell').locator('h3')).toHaveText('Clone ★9');
    await expect(tile('Clone Spell').locator('.shop-count')).toHaveText('48 housing copied');
    const row = (label: string) =>
      page
        .locator('.troop-stats > div')
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator('dd');
    for (const profile of [
      {
        name: 'Yeti',
        level: 8,
        research: 1,
        facts: { Hitpoints: '4,650', 'Yetimite stock': '14', 'Yetimite damage per hit': '92' },
      },
      {
        name: 'Super Giant',
        level: 14,
        research: 5,
        facts: { Hitpoints: '5,600', 'Damage per hit vs walls': '2,050' },
      },
      { name: 'Clone Spell', level: 9, research: 1, facts: { 'Housing copied': '48' } },
      { name: 'Freeze Spell', level: 8, research: 1, facts: { 'Freeze duration': '6s' } },
      {
        name: 'Healing Spell',
        level: 12,
        research: 1,
        facts: { 'Total troop healing': '3,075', 'Total hero healing': '1,691.25' },
      },
    ]) {
      await page.getByRole('button', { name: `About ${profile.name}`, exact: true }).click();
      await expect(page.locator('.troop-info-hero .eyebrow')).toContainText(
        `LEVEL ${profile.level}`,
      );
      await expect(page.locator('.troop-info-body .potion-level')).toContainText(
        `Researched level ${profile.research}`,
      );
      for (const [label, value] of Object.entries(profile.facts))
        await expect(row(label)).toHaveText(value);
      expect(
        await page
          .locator('.troop-info-body')
          .evaluate((body) =>
            [...body.querySelectorAll('.troop-stats > div')].every(
              (cell) => cell.scrollWidth <= cell.clientWidth,
            ),
          ),
      ).toBe(true);
      await page.screenshot({
        path: `output/playtest/power-potion-${profile.name.replaceAll(' ', '-').toLowerCase()}-${viewport.width}.png`,
        animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    }
    // Expiry changes previews without consuming research levels or another item.
    await page.evaluate(() => {
      const m = window.__game.model;
      m.tick(m.clock + 3_600_001);
      m.changed();
    });
    await expect(tile('Yeti').locator('h3')).toHaveText('Yeti ★1');
    await expect(tile('Clone Spell').locator('h3')).toHaveText('Clone ★1');
    await page.getByRole('button', { name: 'About Yeti', exact: true }).click();
    await expect(row('Yetimite stock')).toHaveText('8');
    await expect(page.locator('.troop-info-body .potion-level')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    expect(
      await page.evaluate(() => {
        const m = window.__game.model;
        return [
          m.troopLevel('yeti'),
          m.troopLevel('giant'),
          m.spellLevel('clone'),
          m.magicItemCount('power-potion'),
        ];
      }),
    ).toEqual([1, 5, 1, 0]);
    expect(errors).toEqual([]);
  });
}
