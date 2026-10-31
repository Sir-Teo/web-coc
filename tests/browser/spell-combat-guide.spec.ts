import { expect, test } from '@playwright/test';

const profiles = [
  {
    kind: 'poison',
    name: 'Poison Spell',
    max: 12,
    targets: ['Defending ground and air troops', 'Defending ground and air troops'],
    tactic: 'Damage ramps up',
    facts: [
      ['Maximum DPS', '90', '380'],
      ['Movement slow', '26%', '52%'],
      ['Attack slow', '35%', '74%'],
      ['Damage vs heroes', '5%', '5%'],
    ],
  },
  {
    kind: 'haste',
    name: 'Haste Spell',
    max: 7,
    targets: ['Your ground and air troops', 'Your ground and air troops'],
    tactic: 'without increasing damage or attack speed',
    facts: [
      ['Movement increase', '+3.5 tiles/s', '+7 tiles/s'],
      ['Movement increase with favorite target', '+1.75 tiles/s', '+3.5 tiles/s'],
      ['Pulse window', '10 s', '30 s'],
      ['Effect lingers', '1 s', '1 s'],
    ],
  },
  {
    kind: 'earthquake',
    name: 'Earthquake Spell',
    max: 8,
    targets: ['Enemy buildings and walls', 'Enemy buildings, walls and ground defenders'],
    tactic: 'Repeated casts deal less damage to buildings',
    facts: [
      ['First cast building damage', '14.5%', '29%'],
      ['Ground defender damage per cast', '0%', '14.5%'],
    ],
  },
  {
    kind: 'skeleton',
    name: 'Skeleton Spell',
    max: 8,
    targets: ['Summons ground troops', 'Summons ground troops'],
    tactic: 'shielded Skeletons',
    facts: [
      ['Skeletons summoned', '12', '19'],
      ['First group', '4', '4'],
      ['Spawn duration', '8 s', '15 s'],
      ['Summon attack targets', 'Ground only', 'Ground only'],
      ['Shield breaks into', '1 unshielded Skeleton', '1 unshielded Skeleton'],
      ['Shielded Skeleton hitpoints', '30', '30'],
      ['Unshielded Skeleton hitpoints', '30', '30'],
      ['Skeleton DPS', '25', '25'],
      ['Damage vs resource buildings', '15%', '15%'],
    ],
  },
  {
    kind: 'bat',
    name: 'Bat Spell',
    max: 8,
    targets: ['Summons air troops', 'Summons air troops'],
    tactic: 'Bats prefer defenses',
    facts: [
      ['Bats summoned', '7', '25'],
      ['First group', '2', '2'],
      ['Spawn duration', '3 s', '13.8 s'],
      ['Summon attack targets', 'Ground and air', 'Ground and air'],
      ['Bat hitpoints', '20', '20'],
      ['Bat DPS', '30', '30'],
      ['Bat damage per hit', '60', '60'],
      ['Bat attack interval', '2 s', '2 s'],
      ['Damage vs resource buildings', '15%', '15%'],
    ],
  },
  {
    kind: 'totem',
    name: 'Totem Spell',
    max: 4,
    targets: ['Enemy buildings and defenders', 'Enemy buildings and defenders'],
    tactic: 'Totem does not attack',
    facts: [
      ['Totem maximum hitpoints', '10,000', '13,000'],
      ['Stun duration', '0.2 s', '0.2 s'],
    ],
  },
  {
    kind: 'overgrowth',
    name: 'Overgrowth Spell',
    max: 5,
    targets: ['Enemy buildings except walls and traps', 'Enemy buildings except walls and traps'],
    tactic: 'cannot be targeted or damaged',
    facts: [
      ['Root duration', '22 s', '26 s'],
      ['Damage', 'None', 'None'],
    ],
  },
  {
    kind: 'iceblock',
    name: 'Ice Block Spell',
    max: 6,
    targets: ['Your troops and nearby enemies', 'Your troops and nearby enemies'],
    tactic: 'stop moving and attacking',
    facts: [
      ['Freeze duration', '7 s', '7 s'],
      ['Damage blocked', '86%', '96%'],
    ],
  },
  {
    kind: 'angry',
    name: 'Angry Spell',
    max: 4,
    targets: ['Your ground and air troops', 'Your ground and air troops'],
    tactic: 'retarget defenses',
    facts: [
      ['Defense priority duration', '7 s', '12 s'],
      ['Preferred target', 'Defenses', 'Defenses'],
    ],
  },
];

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 960 },
]) {
  for (const researched of [false, true]) {
    test(`${researched ? 'researched' : 'base'} spell guides describe their own effects at ${viewport.width}`, async ({
      page,
    }) => {
      test.setTimeout(180000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.locator('.train-add').click();
      await page.evaluate(() => window.__game.game.loop.sleep());
      for (const profile of profiles) {
        if (researched)
          await page.evaluate(({ kind, max }) => {
            const m = window.__game.model;
            m.state.spellLevels = { ...m.state.spellLevels, [kind]: max };
            m.changed();
          }, profile);
        await page.getByRole('button', { name: `About ${profile.name}`, exact: true }).click();
        const body = page.locator('.spell-info-body');
        const row = (label: string) =>
          body
            .locator('.troop-stats > div')
            .filter({ has: page.getByText(label, { exact: true }) })
            .locator('dd');
        await expect(body.locator('.eyebrow')).toContainText(
          `LEVEL ${researched ? profile.max : 1}`,
        );
        await expect(row('Targets')).toHaveText(profile.targets[researched ? 1 : 0]);
        for (const [label, base, max] of profile.facts)
          await expect(row(label)).toHaveText(researched ? max : base);
        await expect(body.locator('.troop-tactic')).toContainText(profile.tactic);
        await expect(body.locator('.troop-tactic')).not.toContainText('Overlapping Rage spells');
        expect(
          await body.evaluate((el) =>
            [...el.querySelectorAll('.troop-stats > div')].every(
              (cell) => cell.scrollWidth <= cell.clientWidth,
            ),
          ),
        ).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          viewport.width,
        );
        await page.screenshot({
          path: `output/playtest/spell-guide-${profile.kind}-${researched ? profile.max : 1}-${viewport.width}.png`,
          animations: 'disabled',
        });
        const research = body.getByRole('button', { name: 'Research spell', exact: true });
        await research.scrollIntoViewIfNeeded();
        const box = (await research.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      }
      expect(errors).toEqual([]);
    });
  }
}
