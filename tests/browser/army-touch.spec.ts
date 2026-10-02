import { test, expect, type Page } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

/** Touch rules key on (pointer: coarse), which not every engine's touch emulation reports. */
const coarsePointer = (page: Page) => page.evaluate(() => matchMedia('(pointer: coarse)').matches);

async function openArmy(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  await useDevelopedVillage(page);
  await page.locator('.train-add').click();
  await expect(page.locator('.army-tile').first()).toBeVisible();
}

/** Button heights by action family on unlocked tiles, and tiles whose content spills out. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const heights: Record<string, number> = {};
    const spilled: string[] = [];
    const tiles = [...document.querySelectorAll<HTMLElement>('.army-tile:not(.army-locked)')];
    for (const tile of tiles) {
      const box = tile.getBoundingClientRect();
      for (const b of tile.querySelectorAll<HTMLElement>('button')) {
        const kind = b.dataset.action!.split(':')[0];
        heights[kind] = Math.min(heights[kind] ?? Infinity, b.getBoundingClientRect().height);
      }
      const bottom = Math.max(...[...tile.children].map((c) => c.getBoundingClientRect().bottom));
      if (bottom > box.bottom + 0.5) spilled.push(tile.querySelector('h3')!.textContent!.trim());
    }
    return { unlocked: tiles.length, heights, spilled };
  });

test.describe('tall touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('army tile controls are finger-sized and still fit their tiles', async ({ page }) => {
    await openArmy(page);
    test.skip(!(await coarsePointer(page)), 'This engine does not emulate a coarse pointer.');
    const { unlocked, heights, spilled } = await measure(page);
    expect(unlocked).toBeGreaterThan(4);
    for (const kind of ['train', 'brew']) expect(heights[kind], kind).toBeGreaterThanOrEqual(40);
    for (const kind of [
      'train-five',
      'train-fill',
      'brew-fill',
      'remove-troop',
      'remove-all-troop',
      'remove-spell',
      'remove-all-spell',
    ])
      expect(heights[kind], kind).toBeGreaterThanOrEqual(36);
    expect(spilled).toEqual([]);

    // "Remove one" and "Remove every" sit apart.
    const [one, every] = await Promise.all(
      ['remove-troop:archer', 'remove-all-troop:archer'].map(
        async (a) => (await page.locator(`[data-action="${a}"]`).boundingBox())!,
      ),
    );
    expect(every.x - (one.x + one.width)).toBeGreaterThanOrEqual(8);

    // A finger on the enlarged row adds troops as before.
    const before = await page.evaluate(() => window.__game.model.state.army.archer);
    await page.locator('[data-action="train:archer"]').tap();
    await expect
      .poll(() => page.evaluate(() => window.__game.model.state.army.archer))
      .toBe(before + 1);
  });
});

test('a mouse keeps the compact army tiles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openArmy(page);
  test.skip(await coarsePointer(page), 'This engine reports a coarse pointer without touch.');
  const { heights } = await measure(page);
  expect(heights['train-five']).toBeLessThan(30);
  expect(heights['remove-troop']).toBeLessThan(30);
});

test.describe('shorter touch screens', () => {
  test.use({ isMobile: true, hasTouch: true });
  for (const [width, height, size] of [
    [844, 390, 31],
    [667, 375, 31],
    [375, 667, 33],
  ])
    test(`army tile rows grow to ${size} pixels where ${width}×${height} has room`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openArmy(page);
      test.skip(!(await coarsePointer(page)), 'This engine does not emulate a coarse pointer.');
      const { heights, spilled } = await measure(page);
      for (const kind of ['train-five', 'train-fill', 'remove-troop', 'remove-all-troop'])
        expect(heights[kind], kind).toBeGreaterThanOrEqual(size);
      expect(spilled).toEqual([]);
    });
});
