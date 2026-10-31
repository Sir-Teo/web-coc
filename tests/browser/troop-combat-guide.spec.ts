import { expect, test } from '@playwright/test';

const cases = [
  {
    name: 'Electro Titan',
    target: 'Any building',
    tactic: 'keeps pulsing during Freeze',
    facts: {
      'Aura DPS': '75',
      'Aura damage per pulse': '30',
      'Aura pulse interval': '0.4 s',
      'Aura radius': '3.5 tiles',
      'Aura damage vs heroes': '25%',
      'Attack targets': 'Ground and air',
    },
  },
  {
    name: 'Apprentice Warden',
    target: 'Any building',
    tactic: 'does not heal existing damage',
    facts: {
      'Health aura bonus': '+20%',
      'Health aura radius': '7 tiles',
      'Health aura targets': 'Other ground and air troops',
      'Attack targets': 'Ground and air',
      Movement: 'Ground · crosses walls',
    },
  },
  {
    name: 'Root Rider',
    target: 'Defenses',
    tactic: 'pulses damage into nearby walls',
    facts: {
      'Wall aura damage per pulse': '4,000',
      'Wall aura pulse interval': '0.4 s',
      'Wall aura radius': '0.75 tiles',
      Movement: 'Ground · crosses walls',
      'Attack targets': 'Ground only',
    },
  },
  {
    name: 'Electro Dragon',
    target: 'Any building',
    tactic: 'protect it while it charges',
    facts: {
      'Chain targets': 'Up to 5',
      'Chain radius': '3 tiles',
      'Chain damage per hop': '80%',
      'Attack targets': 'Ground and air',
    },
  },
  {
    name: 'Super Giant',
    target: 'Defenses',
    tactic: 'blocking walls while pursuing defenses',
    facts: {
      'Wall damage multiplier': '5×',
      'Damage per hit vs walls': '900',
      'Attack targets': 'Ground only',
    },
  },
  {
    name: 'Yeti',
    target: 'Any building',
    tactic: 'Yetimites, which jump walls and prefer defenses',
    facts: {
      'Yetimite stock': '8',
      'Damage taken per release': '600',
      'Yetimite targets': 'Ground and air',
      'Yetimite hitpoints': '300',
      'Yetimite damage per hit': '56',
      'Yetimite favorite target': 'Defenses (4× damage)',
    },
  },
  {
    name: 'Super Yeti',
    target: 'Any building',
    tactic: 'briefly stunning them',
    facts: {
      'Electromite stock': '7',
      'Damage taken per release': '400',
      'Electromite targets': 'Ground and air',
      'Electromite first building hit': '224',
      'Chain targets': 'Up to 3',
      'Chain radius': '3 tiles',
      'Stun per hit': '0.1 s',
      'Chain damage per hop': '80%',
    },
  },
  {
    name: 'Golem',
    target: 'Defenses',
    tactic: 'splits into Golemites',
    facts: {
      'Golemites on defeat': '2',
      'Golemite hitpoints': '1,020',
      'Golemite DPS': '7',
      'Golemite targets': 'Ground only',
    },
  },
  {
    name: 'Ice Golem',
    target: 'Defenses',
    tactic: 'giving the rest of your army time to advance',
    facts: {
      'Freeze on defeat': '4 s',
      'Freeze radius': '7.5 tiles',
      'Hit chill duration': '2 s',
      'Hit chill slow': '50%',
    },
  },
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
    tactic: 'hunt defending heroes',
    facts: {
      'Attack targets': 'Ground and air',
      Movement: 'Ground · crosses walls',
      'Hit damage vs heroes': '252',
      'Hit poison duration': '3 s',
      'Poison movement slow': '40%',
      'Poison attack slow': '55%',
    },
  },
  {
    name: 'Balloon',
    target: 'Defenses',
    tactic: 'Bombs damage nearby buildings',
    facts: { 'Attack splash': '1.2 tiles' },
  },
  { name: 'Wall Breaker', target: 'Walls (40× damage)', tactic: 'Both deal 40× damage', facts: {} },
];

const upgrades = [
  {
    kind: 'electrotitan',
    name: 'Electro Titan',
    level: 5,
    facts: {
      'Aura DPS': '150',
      'Aura damage per pulse': '60',
      'Aura pulse interval': '0.4 s',
      'Aura radius': '3.5 tiles',
      'Aura damage vs heroes': '25%',
    },
  },
  {
    kind: 'apprenticewarden',
    name: 'Apprentice Warden',
    level: 4,
    facts: {
      'Health aura bonus': '+26%',
      'Health aura radius': '7 tiles',
      'Health aura targets': 'Other ground and air troops',
    },
  },
  {
    kind: 'rootrider',
    name: 'Root Rider',
    level: 4,
    facts: {
      'Wall aura damage per pulse': '4,000',
      'Wall aura pulse interval': '0.4 s',
      'Wall aura radius': '0.75 tiles',
    },
  },
  {
    kind: 'electrodragon',
    name: 'Electro Dragon',
    level: 9,
    facts: { 'Chain targets': 'Up to 5', 'Chain radius': '3 tiles', 'Chain damage per hop': '80%' },
  },
  {
    kind: 'wallbreaker',
    name: 'Super Wall Breaker',
    level: 14,
    facts: { 'Contact damage vs walls': '23,320', 'Death damage vs walls': '16,520' },
  },
  {
    kind: 'miner',
    name: 'Super Miner',
    level: 12,
    facts: { 'Second tier DPS': '510', 'Maximum DPS': '740', 'Damage per second': '265' },
  },
  {
    kind: 'babydragon',
    name: 'Inferno Dragon',
    level: 12,
    facts: { 'Second tier DPS': '182', 'Maximum DPS': '1820', 'Damage per second': '91' },
  },
  {
    kind: 'headhunter',
    name: 'Headhunter',
    level: 4,
    facts: {
      'Hit damage vs heroes': '324',
      'Hit poison duration': '3 s',
      'Poison movement slow': '46%',
      'Poison attack slow': '68%',
    },
  },
  {
    kind: 'giant',
    name: 'Super Giant',
    level: 14,
    facts: { 'Wall damage multiplier': '5×', 'Damage per hit vs walls': '2,050' },
  },
  {
    kind: 'yeti',
    name: 'Yeti',
    level: 8,
    facts: {
      'Yetimite stock': '14',
      'Damage taken per release': '600',
      'Yetimite hitpoints': '590',
      'Yetimite damage per hit': '92',
      'Yetimite favorite target': 'Defenses (4× damage)',
    },
  },
  {
    kind: 'yeti',
    name: 'Super Yeti',
    level: 8,
    facts: {
      'Electromite stock': '14',
      'Damage taken per release': '400',
      'Electromite first building hit': '368',
      'Chain targets': 'Up to 3',
      'Chain radius': '3 tiles',
      'Stun per hit': '0.1 s',
      'Chain damage per hop': '80%',
    },
  },
  {
    kind: 'golem',
    name: 'Golem',
    level: 15,
    facts: {
      'Golemites on defeat': '4',
      'Golemite hitpoints': '2,040',
      'Golemite DPS': '22',
      'Golemite targets': 'Ground only',
    },
  },
  {
    kind: 'icegolem',
    name: 'Ice Golem',
    level: 9,
    facts: {
      'Freeze on defeat': '9 s',
      'Freeze radius': '7.5 tiles',
      'Hit chill duration': '2 s',
      'Hit chill slow': '50%',
    },
  },
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
            'Electro Titan',
            'Apprentice Warden',
            'Root Rider',
            'Electro Dragon',
            'Headhunter',
            'Super Giant',
            'Yeti',
            'Super Yeti',
            'Golem',
            'Ice Golem',
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

  for (const [index, upgradedGroup] of [
    upgrades.slice(0, Math.ceil(upgrades.length / 2)),
    upgrades.slice(Math.ceil(upgrades.length / 2)),
  ].entries())
    test(`researched troop guide group ${index + 1} follows source tiers at ${viewport.width}×${viewport.height}`, async ({
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
      for (const upgraded of upgradedGroup) {
        await page.evaluate(({ kind, level }) => {
          const m = window.__game.model;
          m.state.troopLevels = { ...m.state.troopLevels, [kind]: level };
          m.changed();
        }, upgraded);
        await page.getByRole('button', { name: `About ${upgraded.name}`, exact: true }).click();
        await expect(page.locator('.troop-info-hero .eyebrow')).toContainText(
          `LEVEL ${upgraded.level}`,
        );
        const base = cases.find((c) => c.name === upgraded.name)!;
        const row = (label: string) =>
          page
            .locator('.troop-stats > div')
            .filter({ has: page.getByText(label, { exact: true }) })
            .locator('dd');
        await expect(row('Favorite target')).toHaveText(base.target);
        const attackTargets = Object.entries(base.facts).find(
          ([label]) => label === 'Attack targets',
        )?.[1];
        if (attackTargets) await expect(row('Attack targets')).toHaveText(attackTargets);
        for (const [label, value] of Object.entries(upgraded.facts))
          await expect(row(label)).toHaveText(value);
        await page.locator('.modal').evaluate(async (el) => {
          await Promise.all(el.getAnimations().map((animation) => animation.finished));
        });
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
