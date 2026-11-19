import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('a shared layout keeps buildings clear of the Trader camp', async ({ page }, info) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').tap();
  const target = await page.evaluate(async () => {
    const { encodeLayout, layoutLink } = await import('/src/game/layout-share.ts');
    const m = window.__game.model;
    m.townhall!.level = 6;
    m.changed();
    const places = m.state.buildings.map(({ kind, x, y }) => ({ kind, x, y }));
    const cannon = places.find((p) => p.kind === 'cannon')!;
    Object.assign(cannon, { x: 0, y: 28 });
    if (!m.overlapsVillageObject(cannon.x, cannon.y, 3))
      throw Error('The shared Cannon must overlap the unlocked Trader camp');
    return layoutLink(location.origin, encodeLayout(m.townhallLevel, places));
  });
  await page.goto(target);
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="layout-import:0"]').tap();
  await page.locator('[data-action="layout-load:0"]').tap();
  const cannon = () =>
    page.evaluate(() => {
      const m = window.__game.model;
      const { x, y } = m.state.buildings.find((b) => b.kind === 'cannon')!;
      return { x, y, overlaps: m.overlapsVillageObject(x, y, 3) };
    });
  const safe = await cannon();
  expect(safe.overlaps).toBe(false);
  await page.evaluate(() => {
    // An older save can already have copied the original obstructed coordinates.
    const m = window.__game.model;
    const id = m.state.buildings.find((b) => b.kind === 'cannon')!.id;
    const slot = m.layouts[0].slots.find((s) => s.id === id)!;
    Object.assign(slot, { x: 0, y: 28 });
    m.changed();
  });
  await page.locator('[data-action="layout-load:0"]').tap();
  await expect(page.locator('#toast')).toContainText('village feature');
  expect(await cannon()).toEqual(safe);
  await page.getByRole('button', { name: 'Close dialog' }).tap();
  await page.screenshot({ path: info.outputPath('trader-layout.png'), animations: 'disabled' });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await cannon()).toEqual(safe);
});
