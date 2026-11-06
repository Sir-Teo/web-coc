import { expect, test } from '@playwright/test';
import fonts from '../../reference/fonts/native.json' with { type: 'json' };

test('all mapped native glyphs and kerning render identically from WOFF2 and original TTF', async ({
  page,
}) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const reports = await page.evaluate(async (fonts) => {
    const reports = [];
    for (const entry of fonts) {
      const sourceFamily = `Original ${entry.role}`;
      const original = new FontFace(sourceFamily, `url('/${entry.original}')`, {
        weight: String(entry.weight),
        sizeAdjust: entry.sizeAdjust,
      });
      await original.load();
      document.fonts.add(original);
      const loaded = await document.fonts.load(`${entry.weight} 24px "${entry.family}"`);
      if (!loaded.some((face) => face.family.replaceAll('"', '') === entry.family))
        throw Error(`Native face missing: ${entry.family}`);
      for (const size of [12, 24, 36]) {
        const draw = (family) => {
          const canvas = document.createElement('canvas');
          canvas.width = 16 * 72;
          canvas.height = Math.ceil(entry.codePoints.length / 16) * 72 + 100;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.font = `${entry.weight} ${size}px "${family}"`;
          context.fillStyle = '#ffffff';
          context.fontKerning = 'normal';
          entry.codePoints.forEach((code, i) =>
            context.fillText(
              String.fromCodePoint(code),
              (i % 16) * 72 + 16,
              Math.floor(i / 16) * 72 + 52,
            ),
          );
          const text = 'Town Hall 18 AVATAR To WAVY Army ready 1,234,567!';
          context.fillText(text, 10, canvas.height - 30);
          return {
            pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
            width: context.measureText(text).width,
          };
        };
        const a = draw(sourceFamily),
          b = draw(entry.family);
        let differences = 0;
        for (let i = 0; i < a.pixels.length; i++) if (a.pixels[i] !== b.pixels[i]) differences++;
        reports.push({
          role: entry.role,
          size,
          glyphs: entry.codePoints.length,
          differences,
          sourceWidth: a.width,
          packedWidth: b.width,
        });
      }
    }
    return reports;
  }, fonts.fonts);
  expect(reports).toHaveLength(6);
  for (const report of reports) {
    expect(report.differences, JSON.stringify(report)).toBe(0);
    expect(report.packedWidth).toBe(report.sourceWidth);
  }
});

for (const width of [390, 1440])
  test(`native fonts load for HUD, dialogs and menus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.locator('body').evaluate((node) => getComputedStyle(node).fontFamily),
    ).toContain('Clash Text');
    const loaded = await page.evaluate(() =>
      [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => face.family.replaceAll('"', '')),
    );
    expect(loaded).toEqual(expect.arrayContaining(['Clash Headline', 'Clash Text']));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const selector of ['.attack-btn > span', '.shop-btn > span']) {
      const label = page.locator(selector);
      if (await label.count()) {
        const fits = await label.evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const text = range.getBoundingClientRect(),
            button = node.closest('button')!.getBoundingClientRect();
          return (
            text.left >= Math.max(0, button.left) - 1 &&
            text.right <= Math.min(innerWidth, button.right) + 1
          );
        });
        expect(fits, `${selector} at ${width}px`).toBe(true);
      }
    }
    await page.screenshot({
      path: `output/playtest/native-font-hud-${width}.png`,
      animations: 'disabled',
    });
    await page.locator('[data-action="settings"]').first().click();
    await expect(page.locator('[data-action="battery"]')).toBeVisible();
    await page.screenshot({
      path: `output/playtest/native-font-settings-${width}.png`,
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });

test('font downloads can finish after the village and settings become usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/assets/fonts-native/*.woff2', async (route) => {
    requests++;
    await ready;
    await route.continue();
  });
  try {
    await page.goto('/?lazyart', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await expect(page.locator('[data-action="campaign"]').first()).toBeVisible();
    await page.locator('[data-action="settings"]').first().click();
    await expect(page.locator('[data-action="battery"]')).toBeVisible();
    expect(requests).toBe(2);
    expect(
      await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length),
    ).toBe(0);
  } finally {
    release();
  }
  await page.waitForFunction(() =>
    ['Clash Headline', 'Clash Text'].every((family) =>
      [...document.fonts].some(
        (f) => f.family.replaceAll('"', '') === family && f.status === 'loaded',
      ),
    ),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('failed native fonts keep fallback controls and settings usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/assets/fonts-native/*.woff2', (route) => route.abort());
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => [...document.fonts].every((f) => f.status === 'error'))).toBe(
    true,
  );
  await expect(page.locator('[data-action="campaign"]').first()).toBeVisible();
  await page.locator('[data-action="settings"]').first().click();
  await expect(page.locator('[data-action="battery"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
