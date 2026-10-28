import { expect, test } from '@playwright/test';

const cases = [
  {
    name: 'Super Wall Breaker',
    target: 'Walls (40× damage)',
    tactic: 'both attack and death damage receive the Wall bonus',
    facts: {
      'Contact damage vs walls': '5,560',
      'Death damage vs walls': '4,200',
      'Attack splash': '0.8 tiles',
      'Death blast radius': '1.6 tiles',
    },
  },
  {
    name: 'Super Bowler',
    target: 'Any building',
    tactic: 'boulders bounce through clustered buildings and ground troops',
    facts: { 'Boulder landings': '3', 'Bounce distance': '3 tiles', 'Attack splash': '0.6 tiles' },
  },
  {
    name: 'Super Barbarian',
    target: 'Any building',
    tactic: 'opening Rage',
    facts: {
      'Opening Rage': '8 s',
      'Rage damage bonus': '+70%',
      'Rage speed bonus': '+1.5 tiles/s',
    },
  },
  {
    name: 'Sneaky Goblin',
    target: 'Resources (2× damage)',
    tactic: 'before the cloak ends',
    facts: { 'Opening invisibility': '5 s' },
  },
  {
    name: 'Super Archer',
    target: 'Any building',
    tactic: 'pierce several targets',
    facts: { 'Extra arrow travel': '4 tiles', 'Piercing radius': '0.3 tiles' },
  },
  {
    name: 'Super Wizard',
    target: 'Any building',
    tactic: 'Lightning branches',
    facts: { 'Chain targets': '10', 'Chain radius': '3 tiles', 'Branch damage': '40%' },
  },
  {
    name: 'Super Minion',
    target: 'Any building',
    tactic: 'Long Shots',
    facts: { 'Long Shot attacks': '8', 'Long Shot range': '9.75 tiles' },
  },
  {
    name: 'Baby Dragon',
    target: 'Any building',
    tactic: 'Ground allies do not suppress it',
    facts: {
      'Tantrum damage bonus': '+100%',
      'Tantrum attack rate': '+50%',
      'Tantrum ally radius': '4.5 tiles',
    },
  },
  {
    name: 'Rocket Balloon',
    target: 'Defenses',
    tactic: 'opening speed boost',
    facts: { 'Boosters duration': '4 s' },
  },
  {
    name: 'Dragon Rider',
    target: 'Defenses',
    tactic: 'delayed death blast',
    facts: { 'Death blast delay': '0.6 s' },
  },
  { name: 'Minion', target: 'Any building', tactic: 'single-target damage', facts: {} },
  { name: 'Lava Hound', target: 'Air Defense', tactic: 'Fly over Walls', facts: {} },
  { name: 'Headhunter', target: 'Heroes (4× damage)', tactic: 'Spread your deployment', facts: {} },
  {
    name: 'Balloon',
    target: 'Defenses',
    tactic: 'Bombs damage nearby buildings',
    facts: { 'Attack splash': '1.2 tiles' },
  },
  { name: 'Wall Breaker', target: 'Walls (40× damage)', tactic: 'Both deal 40× damage', facts: {} },
];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 960 },
])
  test(`source troop guide stays usable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('.train-add').click();
    for (const c of cases) {
      await page.getByRole('button', { name: `About ${c.name}`, exact: true }).click();
      await expect(page.locator('.troop-info-hero h2')).toHaveText(c.name);
      const row = (label: string) =>
        page
          .locator('.troop-stats > div')
          .filter({ has: page.getByText(label, { exact: true }) })
          .locator('dd');
      await expect(row('Favorite target')).toHaveText(c.target);
      for (const [label, value] of Object.entries(c.facts))
        await expect(row(label)).toHaveText(value);
      await expect(page.locator('.troop-tactic')).toContainText(c.tactic);
      if (c.name !== 'Balloon')
        await expect(page.locator('.troop-tactic')).not.toContainText('sending Balloons');
      await page.locator('.modal').evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((a) => a.finished));
      });
      const layout = await page.locator('.troop-info-body').evaluate((body) => ({
        cellsFit: [...body.querySelectorAll('.troop-stats > div')].every(
          (el) => el.scrollWidth <= el.clientWidth,
        ),
        documentWidth: document.documentElement.scrollWidth,
      }));
      expect(layout.cellsFit).toBe(true);
      expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width);
      const close = await page
        .getByRole('button', { name: 'Close dialog', exact: true })
        .boundingBox();
      expect(close!.width).toBeGreaterThanOrEqual(44);
      expect(close!.height).toBeGreaterThanOrEqual(44);
      if (
        [
          'Super Minion',
          'Baby Dragon',
          'Super Barbarian',
          'Sneaky Goblin',
          'Super Archer',
          'Super Wizard',
          'Super Bowler',
          'Super Wall Breaker',
        ].includes(c.name)
      )
        await page.screenshot({
          path: `output/playtest/troop-guide-${c.name.replaceAll(' ', '-').toLowerCase()}-${viewport.width}.png`,
        });
      const train = page
        .locator('.troop-info-body')
        .getByRole('button', { name: 'Train troops', exact: true });
      await train.scrollIntoViewIfNeeded();
      const box = await train.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      await train.click();
      await expect(
        page.getByRole('button', { name: `About ${c.name}`, exact: true }),
      ).toBeVisible();
    }
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.troopLevels = { ...m.state.troopLevels, wallbreaker: 14 };
      m.changed();
    });
    await page.getByRole('button', { name: 'About Super Wall Breaker', exact: true }).click();
    await expect(page.locator('.troop-info-hero .eyebrow')).toContainText('LEVEL 14');
    for (const [label, value] of [
      ['Contact damage vs walls', '23,320'],
      ['Death damage vs walls', '16,520'],
    ])
      await expect(
        page
          .locator('.troop-stats > div')
          .filter({ has: page.getByText(label, { exact: true }) })
          .locator('dd'),
      ).toHaveText(value);
    await page.screenshot({
      path: `output/playtest/troop-guide-super-wall-breaker-14-${viewport.width}.png`,
    });
    await page
      .locator('.troop-info-body')
      .getByRole('button', { name: 'Train troops', exact: true })
      .click();
    await page.getByRole('button', { name: 'About Minion', exact: true }).click();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.locator('.troop-info-body')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
