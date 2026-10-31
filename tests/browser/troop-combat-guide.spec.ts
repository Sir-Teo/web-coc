import { expect, test } from '@playwright/test';

const cases = [
  {
    name: 'Witch',
    target: 'Any building',
    tactic: 'the Skeletons fight on the ground',
    facts: {
      'Skeletons per wave': '4',
      'Skeleton limit': '6',
      'Skeleton hitpoints': '30',
      'Skeleton DPS': '25',
      'Skeleton targets': 'Ground only',
      'Attack targets': 'Ground and air',
    },
  },
  {
    name: 'Super Witch',
    target: 'Any building',
    tactic: 'only one of her Big Boys can be alive at a time',
    facts: {
      'Big Boys at a time': '1',
      'Big Boy hitpoints': '4,100',
      'Big Boy DPS': '350',
      'Big Boy damage per hit': '700',
      'Big Boy targets': 'Ground only',
      'Attack targets': 'Ground and air',
    },
  },
  {
    name: 'Healer',
    target: 'Friendly ground troops',
    tactic: 'Additional Healers have diminishing effectiveness',
    facts: {
      'Full-strength Healers per group': '2',
      'Healers adding healing per group': 'Up to 7',
      'Healing per second': '36',
      'Hero healing per second': '19.8',
      'Healing radius': '1.5 tiles',
      Movement: 'Air · ignores walls',
    },
  },
  {
    name: 'Druid',
    target: 'Friendly ground and air troops',
    tactic: "The Bear keeps the Druid's health percentage",
    facts: {
      'Recipients per chain': 'Up to 4',
      'Healing bounce range': '4.5 tiles',
      'Transforms after': '30 s',
      'Bear maximum hitpoints': '1,900',
      'Bear damage per second': '150',
      'Bear favorite target': 'Defenses',
      'Healing per second': '80',
      'Hero healing per second': '84',
      Movement: 'Ground · crosses walls',
    },
  },
  {
    name: 'Inferno Dragon',
    target: 'Any building',
    tactic: 'Protect it from Air Defenses',
    facts: {
      'Second tier DPS': '110',
      'Maximum DPS': '1100',
      'Damage ramps after': '1.7 / 3.2 s',
      'Pause after a kill': '0.6 s',
      'Attack targets': 'Ground and air',
    },
  },
  {
    name: 'Super Miner',
    target: 'Any building',
    tactic: 'Changing targets restarts the ramp',
    facts: {
      'Second tier DPS': '160',
      'Maximum DPS': '280',
      'Damage ramps after': '1.5 / 3 s',
      'Death bomb delay': '1 s',
      'Attack targets': 'Ground only',
      Movement: 'Ground · burrows under walls',
    },
  },
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
  {
    name: 'Lava Hound',
    target: 'Air Defense',
    tactic: 'draw Air Defense fire',
    facts: {
      'Pups on defeat': '8',
      'Pup hitpoints': '50',
      'Pup DPS': '35',
      'Pup targets': 'Ground and air',
      'Attack targets': 'Ground only',
      Movement: 'Air · ignores walls',
    },
  },
  {
    name: 'Ice Hound',
    target: 'Air Defense',
    tactic: 'Ice Pups whose shots also chill',
    facts: {
      'Pups on defeat': '6',
      'Pup hitpoints': '50',
      'Pup DPS': '35',
      'Pup targets': 'Ground and air',
      'Pup chill duration': '2 s',
      'Pup chill slow': '50%',
      'Attack targets': 'Ground only',
      Movement: 'Air · ignores walls',
    },
  },
  {
    name: 'Headhunter',
    target: 'Heroes (4× damage)',
    tactic: 'Spread your deployment',
    facts: { 'Attack targets': 'Ground and air', Movement: 'Ground · crosses walls' },
  },
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
]) {
  for (const [index, group] of [
    cases.slice(0, Math.ceil(cases.length / 2)),
    cases.slice(Math.ceil(cases.length / 2)),
  ].entries())
    test(`source troop guide group ${index + 1} stays usable at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      test.setTimeout(180000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize(viewport);
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.locator('.train-add').click();
      // Dialog layout and source stats do not depend on the village's animation loop.
      await page.evaluate(() => window.__game.game.loop.sleep());
      for (const c of group) {
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
            'Lava Hound',
            'Ice Hound',
            'Witch',
            'Super Witch',
            'Healer',
            'Druid',
            'Super Minion',
            'Baby Dragon',
            'Super Barbarian',
            'Sneaky Goblin',
            'Super Archer',
            'Super Wizard',
            'Super Bowler',
            'Super Wall Breaker',
            'Super Miner',
            'Inferno Dragon',
          ].includes(c.name)
        )
          await page.screenshot({
            animations: 'disabled',
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
      await page.getByRole('button', { name: 'About Minion', exact: true }).click();
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await expect(page.locator('.troop-info-body')).toHaveCount(0);
      expect(errors).toEqual([]);
    });

  test(`researched troop guide follows source tiers at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('.train-add').click();
    // Dialog layout and source stats do not depend on the village's animation loop.
    await page.evaluate(() => window.__game.game.loop.sleep());
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
      animations: 'disabled',
      path: `output/playtest/troop-guide-super-wall-breaker-14-${viewport.width}.png`,
    });
    await page
      .locator('.troop-info-body')
      .getByRole('button', { name: 'Train troops', exact: true })
      .click();
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.troopLevels = { ...m.state.troopLevels, miner: 12 };
      m.changed();
    });
    await page.getByRole('button', { name: 'About Super Miner', exact: true }).click();
    await expect(page.locator('.troop-info-hero .eyebrow')).toContainText('LEVEL 12');
    for (const [label, value] of [
      ['Second tier DPS', '510'],
      ['Maximum DPS', '740'],
      ['Damage per second', '265'],
    ])
      await expect(
        page
          .locator('.troop-stats > div')
          .filter({ has: page.getByText(label, { exact: true }) })
          .locator('dd'),
      ).toHaveText(value);
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/troop-guide-super-miner-12-${viewport.width}.png`,
    });
    await page
      .locator('.troop-info-body')
      .getByRole('button', { name: 'Train troops', exact: true })
      .click();
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.troopLevels = { ...m.state.troopLevels, babydragon: 12 };
      m.changed();
    });
    await page.getByRole('button', { name: 'About Inferno Dragon', exact: true }).click();
    await expect(page.locator('.troop-info-hero .eyebrow')).toContainText('LEVEL 12');
    for (const [label, value] of [
      ['Second tier DPS', '182'],
      ['Maximum DPS', '1820'],
      ['Damage per second', '91'],
    ])
      await expect(
        page
          .locator('.troop-stats > div')
          .filter({ has: page.getByText(label, { exact: true }) })
          .locator('dd'),
      ).toHaveText(value);
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/troop-guide-inferno-dragon-12-${viewport.width}.png`,
    });
    await page
      .locator('.troop-info-body')
      .getByRole('button', { name: 'Train troops', exact: true })
      .click();
    for (const upgraded of [
      {
        kind: 'lavahound',
        name: 'Lava Hound',
        level: 8,
        facts: {
          'Pups on defeat': '22',
          'Pup hitpoints': '50',
          'Pup DPS': '35',
          'Pup targets': 'Ground and air',
        },
      },
      {
        kind: 'lavahound',
        name: 'Ice Hound',
        level: 8,
        facts: {
          'Pups on defeat': '16',
          'Pup hitpoints': '50',
          'Pup DPS': '35',
          'Pup targets': 'Ground and air',
          'Pup chill duration': '2 s',
          'Pup chill slow': '50%',
        },
      },
      {
        kind: 'witch',
        name: 'Witch',
        level: 8,
        facts: {
          'Skeletons per wave': '5',
          'Skeleton limit': '16',
          'Skeleton hitpoints': '45',
          'Skeleton DPS': '30',
        },
      },
      {
        kind: 'witch',
        name: 'Super Witch',
        level: 8,
        facts: {
          'Big Boys at a time': '1',
          'Big Boy hitpoints': '4,100',
          'Big Boy DPS': '350',
          'Big Boy damage per hit': '700',
        },
      },
      {
        kind: 'healer',
        name: 'Healer',
        level: 11,
        facts: { 'Healing per second': '82', 'Hero healing per second': '88.56' },
      },
      {
        kind: 'druid',
        name: 'Druid',
        level: 6,
        facts: {
          'Bear maximum hitpoints': '2,750',
          'Bear damage per second': '225',
          'Healing per second': '115',
          'Hero healing per second': '132.25',
        },
      },
    ]) {
      await page.evaluate(({ kind, level }) => {
        const m = window.__game.model;
        m.state.troopLevels = { ...m.state.troopLevels, [kind]: level };
        m.changed();
      }, upgraded);
      await page.getByRole('button', { name: `About ${upgraded.name}`, exact: true }).click();
      await expect(page.locator('.troop-info-hero .eyebrow')).toContainText(
        `LEVEL ${upgraded.level}`,
      );
      for (const [label, value] of Object.entries(upgraded.facts))
        await expect(
          page
            .locator('.troop-stats > div')
            .filter({ has: page.getByText(label, { exact: true }) })
            .locator('dd'),
        ).toHaveText(value);
      await page.screenshot({
        animations: 'disabled',
        path: `output/playtest/troop-guide-${upgraded.name.replaceAll(' ', '-').toLowerCase()}-${upgraded.level}-${viewport.width}.png`,
      });
      await page
        .locator('.troop-info-body')
        .getByRole('button', { name: 'Train troops', exact: true })
        .click();
    }
    await page.getByRole('button', { name: 'About Minion', exact: true }).click();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.locator('.troop-info-body')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
