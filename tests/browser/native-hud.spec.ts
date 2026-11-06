import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`original campaign map keeps the Attack label and opens campaign at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const attack = page.getByRole('button', { name: 'Attack! SINGLE PLAYER', exact: true });
    await expect(attack).toBeVisible();
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
  });
}
