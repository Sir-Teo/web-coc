import { expect, test } from '@playwright/test';

const cases = [
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
      if (c.name === 'Super Minion' || c.name === 'Baby Dragon')
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
    await page.getByRole('button', { name: 'About Minion', exact: true }).click();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.locator('.troop-info-body')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
