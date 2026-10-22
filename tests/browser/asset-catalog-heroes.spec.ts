import { expect, test } from '@playwright/test';
import roster from '../../reference/full-client/roster.json' with { type: 'json' };

const heroes = roster.portraits.filter((row) => row.category === 'hero');

for (const width of [1440, 390])
  test(`the asset catalog displays every original hero portrait at ${width}px`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.goto('/asset-catalog.html');
    await page.locator('#category').selectOption('hero');
    await expect(page.locator('#grid .card')).toHaveCount(heroes.length);
    for (const hero of heroes) {
      const card = page
        .locator('#grid .card')
        .filter({ has: page.getByRole('heading', { name: hero.name, exact: true }) });
      const portrait = card.getByRole('img', { name: hero.name, exact: true });
      await expect(card).toHaveAttribute('href', '/' + hero.path);
      await portrait.scrollIntoViewIfNeeded();
      const size = await portrait.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        return [img.naturalWidth, img.naturalHeight];
      });
      expect(size, hero.name).toEqual([hero.width, hero.height]);
    }
    await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      path: `output/playtest/asset-catalog-heroes-${width}-${browserName}.png`,
    });
    expect(errors).toEqual([]);
  });
