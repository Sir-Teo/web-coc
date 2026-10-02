import { test, expect, type Page } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

/** Touch rules key on (pointer: coarse), which not every engine's touch emulation reports. */
const coarsePointer = (page: Page) => page.evaluate(() => matchMedia('(pointer: coarse)').matches);

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  // Record which control each press lands on, without depending on what the action does.
  await page.evaluate(() => {
    const w = window as unknown as { pressed: string[] };
    w.pressed = [];
    document.addEventListener(
      'click',
      (event) => {
        const control = (event.target as Element).closest<HTMLElement>('[data-action]');
        w.pressed.push(control?.dataset.action ?? '');
      },
      true,
    );
  });
}

type Point = { x: number; y: number };

/** The center and points just outside the drawn box on each side (off-screen sides omitted). */
async function probes(page: Page, selector: string, reach: { x: number; y: number }) {
  const box = (await page.locator(selector).first().boundingBox())!;
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  const sides: Record<string, Point> = {
    center: { x: cx, y: cy },
    left: { x: box.x - reach.x, y: cy },
    right: { x: box.x + box.width + reach.x, y: cy },
    up: { x: cx, y: box.y - reach.y },
    down: { x: cx, y: box.y + box.height + reach.y },
  };
  return Object.fromEntries(
    Object.entries(sides).filter(([, p]) => p.x >= 0 && p.x < 390 && p.y >= 0),
  );
}

/** The control under each point, as a real hit test sees it. */
const hits = (page: Page, points: Record<string, Point>) =>
  page.evaluate(
    (points) =>
      Object.fromEntries(
        Object.entries(points).map(([side, { x, y }]) => [
          side,
          document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-action]')?.dataset.action ??
            null,
        ]),
      ),
    points,
  );

/** Every probe hits the same control. */
const all = (points: Record<string, Point>, action: string) =>
  Object.fromEntries(Object.keys(points).map((side) => [side, action]));

const lastPress = (page: Page) =>
  page.evaluate(() => (window as unknown as { pressed: string[] }).pressed.at(-1));

test('tall phone HUD controls take a 44-pixel finger', async ({ page }) => {
  await boot(page);
  test.skip(!(await coarsePointer(page)), 'This engine does not emulate a coarse pointer.');
  for (const action of ['settings', 'zoom-in', 'recenter', 'zoom-out']) {
    const box = (await page.locator(`.right-tools [data-action="${action}"]`).boundingBox())!;
    expect(box.width, action).toBeGreaterThanOrEqual(44);
    expect(box.height, action).toBeGreaterThanOrEqual(44);
  }
  // Each resource "+" answers presses up to 10 px beside and 6 px above or below its art...
  for (const action of ['collect:gold', 'collect:elixir']) {
    const points = await probes(page, `[data-action="${action}"]`, { x: 10, y: 6 });
    expect(Object.keys(points)).toContain('left');
    expect(await hits(page, points), action).toEqual(all(points, action));
  }
  // ...without reaching the neighbouring row.
  const gold = (await page.locator('[data-action="collect:gold"]').boundingBox())!;
  const elixir = (await page.locator('[data-action="collect:elixir"]').boundingBox())!;
  const between = (gold.y + gold.height + elixir.y) / 2;
  expect(
    await hits(page, {
      above: { x: gold.x + gold.width / 2, y: between - 2 },
      below: { x: gold.x + gold.width / 2, y: between + 2 },
    }),
  ).toEqual({ above: 'collect:gold', below: 'collect:elixir' });
  // A real finger beside the art presses the button.
  await page.touchscreen.tap(gold.x - 8, gold.y + gold.height / 2);
  expect(await lastPress(page)).toBe('collect:gold');
});

test('dialog close buttons and settings switches take presses beside their art', async ({
  page,
}) => {
  await boot(page);
  test.skip(!(await coarsePointer(page)), 'This engine does not emulate a coarse pointer.');
  await page.locator('[data-action="settings"]').first().tap();
  const close = '.modal [data-action="close"]';
  await expect(page.locator(close)).toBeVisible();
  const closePoints = await probes(page, close, { x: 4, y: 4 });
  expect(await hits(page, closePoints)).toEqual(all(closePoints, 'close'));

  const toggle = page.locator('[data-action="sound"]');
  const before = await toggle.getAttribute('aria-checked');
  const switchPoints = await probes(page, '[data-action="sound"]', { x: 1, y: 7 });
  expect(await hits(page, switchPoints)).toEqual(all(switchPoints, 'sound'));
  // 7 px below the drawn switch still flips it.
  const box = (await toggle.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height + 7);
  await expect(toggle).not.toHaveAttribute('aria-checked', before!);

  // The shop drawer's close button reaches up, right and down, but not left over the tabs.
  await page.locator(close).tap();
  await page.locator('.shop-btn').tap();
  const drawerClose = '.drawer-head [data-action="close-drawer"]';
  await expect(page.locator(drawerClose)).toBeVisible();
  // Its category tabs take a finger too, and the building tiles keep their room.
  const shop = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.drawer-head .shop-tabs .tab')];
    const strip = document.querySelector('.shop-strip')!.getBoundingClientRect();
    const tile = document.querySelector('.shop-tile')!.getBoundingClientRect();
    return {
      shortestTab: Math.min(...tabs.map((t) => t.getBoundingClientRect().height)),
      tileInside: tile.top >= strip.top && tile.bottom <= strip.bottom,
    };
  });
  expect(shop.shortestTab).toBeGreaterThanOrEqual(44);
  expect(shop.tileInside).toBe(true);
  const { left, ...rest } = await hits(page, await probes(page, drawerClose, { x: 4, y: 4 }));
  expect(rest).toEqual({
    center: 'close-drawer',
    right: 'close-drawer',
    up: 'close-drawer',
    down: 'close-drawer',
  });
  expect(left).not.toBe('close-drawer');
});
