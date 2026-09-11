import { test, expect, type Page } from '@playwright/test';
test.use({ hasTouch: true });

async function center(page: Page, x: number, y: number) {
  await page.waitForFunction(
    () =>
      window.__game.scene.cameras.main.width === innerWidth &&
      window.__game.scene.cameras.main.height === innerHeight,
  );
  return page.evaluate(
    async ({ x, y }) => {
      const s = window.__game.scene;
      s.cameras.main.centerOn(896 + (x - y) * 32, 112 + (x + y + 1) * 16);
      s.clampCamera();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return s.screenFor(x + 0.5, y + 0.5);
    },
    { x, y },
  );
}
async function begin(page: Page, editing = false) {
  if (editing) await page.getByRole('button', { name: 'Edit village layout', exact: true }).tap();
  const point = await center(page, 11, 19);
  await page.touchscreen.tap(point.x, point.y);
  await page.locator('[data-action="wall-row"]').tap();
  await expect(page.locator('.wall-context h2')).toHaveText('5 Walls');
  await page.locator('[data-action="wall-move"]').tap();
  await expect(page.getByRole('region', { name: 'Move wall row' })).toBeVisible();
  return page.evaluate(() => window.__game.model.wallMove!.source);
}
async function clearGround(page: Page) {
  return page.evaluate(() => {
    const m = window.__game.model,
      move = m.wallMove!,
      original = { x: move.x, y: move.y };
    let result: { x: number; y: number } | undefined;
    for (let y = 22; y >= 3 && !result; y--)
      for (let x = 3; x < 24 && !result; x++) {
        move.x = x;
        move.y = y;
        if (!m.wallPlacementIssue && Math.hypot(x - original.x, y - original.y) > 4)
          result = { x, y };
      }
    Object.assign(move, original);
    if (!result) throw new Error('No valid row destination in fixture');
    return result;
  });
}
async function positions(page: Page, ids: number[]) {
  return page.evaluate(
    (ids) =>
      window.__game.model.state.buildings
        .filter((b) => ids.includes(b.id))
        .map(({ id, x, y }) => ({ id, x, y })),
    ids,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').tap();
  await expect(page.locator('#loading')).toBeHidden();
});

test('touch rotates and places a whole row atomically, with ghost cleanup and saved coordinates', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const before = await begin(page),
    ids = before.map((b) => b.id);
  const gold = await page.evaluate(() => window.__game.model.state.gold);
  await page.getByRole('button', { name: 'Rotate wall row 90 degrees' }).tap();
  const target = await clearGround(page),
    point = await center(page, target.x, target.y);
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('[data-action="wall-place"]')).toBeEnabled();
  expect(await positions(page, ids)).toEqual(before);
  const preview = await page.evaluate(() => window.__game.model.wallPreview);
  expect(new Set(preview.map((b) => b.x)).size).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__game.scene.wallGhosts.size)).toBe(5);
  expect(
    await page.evaluate(
      (ids) => ids.every((id) => !window.__game.scene.sprites.get(id)!.visible),
      ids,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `output/playtest/wall-move-phone-${test.info().project.name}.png`,
  });
  await page.locator('[data-action="wall-place"]').tap();
  await expect(page.locator('.wall-move-toolbar')).toHaveCount(0);
  expect(await positions(page, ids)).toEqual(preview);
  expect(await page.evaluate(() => window.__game.model.state.gold)).toBe(gold);
  await expect.poll(() => page.evaluate(() => window.__game.scene.wallGhosts.size)).toBe(0);
  expect(
    await page.evaluate(
      (ids) => ids.every((id) => window.__game.scene.sprites.get(id)!.visible),
      ids,
    ),
  ).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(await positions(page, ids)).toEqual(preview);
  expect(await page.evaluate(() => window.__game.model.wallMove)).toBeNull();
});

test('blocked destinations turn the entire preview red and Cancel preserves the original row', async ({
  page,
}) => {
  const before = await begin(page),
    ids = before.map((b) => b.id);
  const point = await center(page, 11, 10);
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('[data-action="wall-place"]')).toBeDisabled();
  await expect(page.locator('.wall-move-status')).toContainText('clear ground');
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...window.__game.scene.wallGhosts.values()].every((s) => s.tintTopLeft === 0xff7272),
      ),
    )
    .toBe(true);
  expect(await positions(page, ids)).toEqual(before);
  await page.screenshot({
    path: `output/playtest/wall-move-blocked-${test.info().project.name}.png`,
  });
  await page.locator('.wall-move-toolbar [data-action="cancel"]').tap();
  expect(await positions(page, ids)).toEqual(before);
  await expect.poll(() => page.evaluate(() => window.__game.scene.wallGhosts.size)).toBe(0);
});

test('dragging a preview keeps its grabbed offset, while release does not commit the move', async ({
  page,
}) => {
  const before = await begin(page),
    ids = before.map((b) => b.id);
  const points = await page.evaluate(async () => {
    const s = window.__game.scene,
      m = window.__game.model;
    const move = m.wallMove!,
      grabbed = m.wallPreview.find((w) => w.x === move.x - 1)!;
    s.cameras.main.centerOn(
      896 + (grabbed.x - grabbed.y) * 32,
      112 + (grabbed.x + grabbed.y + 1) * 16,
    );
    s.clampCamera();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      from: s.screenFor(grabbed.x + 0.5, grabbed.y + 0.5),
      to: s.screenFor(grabbed.x + 2.5, grabbed.y + 1.5),
      x: move.x,
      y: move.y,
    };
  });
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 8 });
  await page.mouse.up();
  expect(
    await page.evaluate(() => ({
      x: window.__game.model.wallMove!.x,
      y: window.__game.model.wallMove!.y,
    })),
  ).toEqual({ x: points.x + 2, y: points.y + 1 });
  expect(await positions(page, ids)).toEqual(before);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__game.model.wallMove)).toBeNull();
});

test('edit mode moves a rotated row in one undo step, and Escape cancels only its preview', async ({
  page,
}) => {
  const before = await begin(page, true),
    ids = before.map((b) => b.id);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__game.model.editing)).toBe(true);
  expect(await positions(page, ids)).toEqual(before);
  const point = await center(page, 11, 19);
  await page.touchscreen.tap(point.x, point.y);
  await page.locator('[data-action="wall-row"]').tap();
  await page.locator('[data-action="wall-move"]').tap();
  await page.keyboard.press('r');
  const target = await clearGround(page),
    p = await center(page, target.x, target.y);
  await page.touchscreen.tap(p.x, p.y);
  await page.keyboard.press('Enter');
  const after = await positions(page, ids);
  expect(after).not.toEqual(before);
  await page.locator('[data-action="undo"]').tap();
  expect(await positions(page, ids)).toEqual(before);
  await expect(page.locator('[data-action="undo"]')).toBeDisabled();
  await page.locator('[data-action="redo"]').tap();
  expect(await positions(page, ids)).toEqual(after);
});

test('movement controls remain reachable on narrow portrait and short landscape screens', async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 740],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await begin(page);
    const toolbar = page.locator('.wall-move-toolbar');
    for (const button of await toolbar.getByRole('button').all()) {
      await expect(button).toBeInViewport({ ratio: 1 });
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({
      path: `output/playtest/wall-move-tools-${width}-${test.info().project.name}.png`,
    });
    await toolbar.locator('[data-action="cancel"]').tap();
  }
});

test('dragging ground pans the camera without moving or committing the row preview', async ({
  page,
}) => {
  const before = await begin(page),
    ids = before.map((b) => b.id);
  await page.evaluate(() => window.__game.scene.zoomBy(1.3));
  const cameraBefore = await page.evaluate(() => ({
    x: window.__game.scene.cameras.main.scrollX,
    y: window.__game.scene.cameras.main.scrollY,
  }));
  const preview = await page.evaluate(() => window.__game.model.wallPreview);
  await page.mouse.move(1030, 320);
  await page.mouse.down();
  await page.mouse.move(1090, 350, { steps: 8 });
  await page.mouse.up();
  const cameraAfter = await page.evaluate(() => ({
    x: window.__game.scene.cameras.main.scrollX,
    y: window.__game.scene.cameras.main.scrollY,
  }));
  expect(cameraAfter).not.toEqual(cameraBefore);
  expect(await page.evaluate(() => window.__game.model.wallPreview)).toEqual(preview);
  expect(await positions(page, ids)).toEqual(before);
  await expect(page.locator('.wall-move-toolbar')).toBeVisible();
});
