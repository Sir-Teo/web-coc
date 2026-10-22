import { test, expect } from '@playwright/test';

test('a shared layout link opens in the layouts panel, copies into a slot and restores', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  // A layout of this village with a Cannon and the Archer Tower (both 3×3) swapped.
  const shared = await page.evaluate(async () => {
    const { encodeLayout, layoutLink } = await import('/src/game/layout-share.ts');
    const m = window.__game.model;
    const places = m.state.buildings.map((b) => ({ kind: b.kind, x: b.x, y: b.y }));
    const cannon = places.find((p) => p.kind === 'cannon')!,
      tower = places.find((p) => p.kind === 'archertower')!;
    [cannon.x, cannon.y, tower.x, tower.y] = [tower.x, tower.y, cannon.x, cannon.y];
    return {
      link: layoutLink(location.origin, encodeLayout(m.townhallLevel, places)),
      want: places.map((p) => `${p.kind}@${p.x},${p.y}`).sort(),
      count: places.length,
    };
  });
  await page.goto(shared.link);
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await expect(page.locator('#modal-title')).toHaveText('Saved layouts');
  await expect(page.locator('.layout-import-summary')).toContainText(`${shared.count} buildings`);
  // The link leaves the address, so a reload does not offer it again.
  expect(new URL(page.url()).hash).toBe('');
  const copy = page.locator('[data-action="layout-import:1"]');
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect(page.locator('.layout-row').nth(1)).toContainText(
    `${shared.count} buildings stored`,
  );
  await page.screenshot({ path: `output/playtest/layout-share-390-${browserName}.png` });
  await page.locator('[data-action="layout-load:1"]').click();
  expect(
    await page.evaluate(() =>
      window.__game.model.state.buildings.map((b) => `${b.kind}@${b.x},${b.y}`).sort(),
    ),
  ).toEqual(shared.want);
  // Sharing a slot copies its link where no share sheet exists.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (text: string) => void (window.__copied = text) },
      configurable: true,
    });
  });
  await page.locator('[data-action="layout-share:1"]').click();
  await expect(page.locator('#toast')).toContainText('Layout link copied');
  const copied = await page.evaluate(() => window.__copied as string);
  expect(copied).toContain('#layout=1.');
  // A pasted link that is damaged says so and offers no copy.
  await page.locator('#layout-code').fill('https://example.test/#layout=1.2.cannon%3AK');
  await expect(page.locator('.layout-import-summary')).toHaveText('This layout link is damaged.');
  await expect(copy).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('a layout link opened in a new tab offers the layout once the village loads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const link = await page.evaluate(async () => {
    const { layoutLink } = await import('/src/game/layout-share.ts');
    return layoutLink(location.origin, window.__game.model.layoutShareCode()!);
  });
  await page.goto('about:blank');
  await page.goto(link);
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await expect(page.locator('.layout-import-summary')).toContainText('Town Hall');
  await expect(page.locator('[data-action="layout-import:0"]')).toBeEnabled();
});

test('damaged URL escapes open a usable village and report a damaged layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#layout=1.2.wall%ZZAB');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await expect(page.locator('#modal-title')).toHaveText('Saved layouts');
  await expect(page.locator('.layout-import-summary')).toHaveText('This layout link is damaged.');
  expect(new URL(page.url()).hash).toBe('');
  for (const button of await page.locator('[data-action^="layout-import:"]').all())
    await expect(button).toBeDisabled();
  const link = await page.evaluate(async () => {
    const { layoutLink } = await import('/src/game/layout-share.ts');
    return layoutLink(location.origin, window.__game.model.layoutShareCode()!);
  });
  await page.locator('#layout-code').fill(link);
  await expect(page.locator('[data-action="layout-import:0"]')).toBeEnabled();
  await page.locator('#layout-code').fill('https://example.test/#layout=1.2.wall%');
  await expect(page.locator('.layout-import-summary')).toHaveText('This layout link is damaged.');
  await expect(page.locator('[data-action="layout-import:0"]')).toBeDisabled();
  expect(errors).toEqual([]);
});

for (const refused of ['share', 'clipboard'] as const) {
  test(`a refused ${refused} offers a selected layout link that can still be imported`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate((refused) => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value:
          refused === 'share'
            ? async () => {
                throw new DOMException('Sharing is blocked', 'NotAllowedError');
              }
            : undefined,
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new DOMException('Clipboard access is blocked', 'NotAllowedError');
          },
        },
      });
    }, refused);
    await page.getByRole('button', { name: 'Edit village layout', exact: true }).click();
    await page.locator('[data-action="layouts"]').click();
    await page.locator('[data-action="layout-save:0"]').click();
    await page.locator('[data-action="layout-share:0"]').click();
    await expect(page.locator('#toast')).toContainText('Copy the layout link from the field');
    const field = page.locator('#layout-code');
    await expect(field).toBeFocused();
    const link = await field.inputValue();
    const code = await page.evaluate(() => window.__game.model.layoutShareCode(0));
    expect(decodeURIComponent(new URL(link).hash)).toBe(`#layout=${code}`);
    expect(
      await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]),
    ).toEqual([0, link.length]);
    await page.screenshot({
      path: `output/playtest/layout-share-manual-${refused}-${browserName}.png`,
    });
    await page.locator('[data-action="layout-import:1"]').click();
    const copied = await page.evaluate(() => {
      const layouts = window.__game.model.layouts;
      return {
        imported: [...layouts[1].slots].sort((a, b) => a.id - b.id),
        saved: [...layouts[0].slots].sort((a, b) => a.id - b.id),
      };
    });
    expect(copied.imported).toEqual(copied.saved);
    await expect(field).toHaveValue('');
  });
}
