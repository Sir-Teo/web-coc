import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`original HUD artwork keeps Attack, Shop and Settings usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const attack = page.getByRole('button', { name: 'Attack! SINGLE PLAYER', exact: true });
    await expect(attack).toBeVisible();
    for (const [selector, dimensions] of [
      ['.native-shop-icon', [104, 83]],
      ['.native-settings-art', [67, 69]],
    ] as const) {
      const image = page.locator(selector);
      await expect(image).toHaveAttribute('alt', '');
      expect(
        await image.evaluate(async (el: HTMLImageElement) => {
          await el.decode();
          return [el.naturalWidth, el.naturalHeight];
        }),
      ).toEqual(dimensions);
      const fits = await image.evaluate((el) => {
        const image = el.getBoundingClientRect(),
          button = el.closest('button')!.getBoundingClientRect();
        return (
          image.left >= button.left &&
          image.top >= button.top &&
          image.right <= button.right &&
          image.bottom <= button.bottom
        );
      });
      expect(fits).toBe(true);
    }
    const image = attack.locator('img');
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
      .toBe(90);
    expect(
      await attack.evaluate(async (button) => {
        const url =
          getComputedStyle(button).borderImageSource.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
        if (!url) return null;
        const image = new Image();
        image.src = url;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }),
    ).toEqual([125, 123]);
    const layout = await attack.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const image = button.querySelector('img')!.getBoundingClientRect();
      const label = button.querySelector('span')!.getBoundingClientRect();
      return {
        target: Math.min(box.width, box.height),
        overlap: image.bottom > label.top,
        imageVisible: image.top >= 0 && image.left >= 0 && image.right <= innerWidth,
      };
    });
    expect(layout).toEqual({
      target: width === 390 ? 75 : 114,
      overlap: false,
      imageVisible: true,
    });
    await page.addStyleTag({
      content: '* { animation: none !important; transition: none !important; }',
    });
    await page.screenshot({ path: `output/playtest/native-campaign-hud-${width}.png` });
    await attack.click();
    await expect(page.getByRole('dialog', { name: 'The Goblin Valley' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scout Payback' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Shop', exact: true }).click();
    await expect(page.locator('.drawer-sheet')).toBeVisible();
    await page.locator('[data-action="close-drawer"]').click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  });
}
