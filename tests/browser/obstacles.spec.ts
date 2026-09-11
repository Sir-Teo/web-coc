import { test, expect, type Page } from '@playwright/test';

async function selectTree(page: Page, id: number) {
  await expect(page.locator('#loading')).toBeHidden();
  const point = await page.evaluate(async (id) => {
    const { scene, model } = window.__game;
    const o = model.obstacles.find((o) => o.id === id);
    scene.cameras.main.centerOn(896 + (o.x - o.y) * 32, 112 + (o.x + o.y + 2) * 16);
    scene.clampCamera();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const p = scene.screenFor(o.x + 1, o.y + 1);
    const im = scene.obstacleSprites.get(id);
    return { x: p.x, y: p.y - im.displayHeight * scene.cameras.main.zoom * 0.4 };
  }, id);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.obstacle-context h2')).toHaveText('Tree');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('phone obstacle removal works with busy builders, cancels, reloads and frees buildable ground', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => window.__game.scene.cameras.main.width === 390);
  const setup = await page.evaluate(() => {
    const m = window.__game.model;
    for (const b of m.state.buildings.slice(0, 2)) b.upgradeEnd = m.clock + 3600000;
    m.changed();
    const o = m.obstacles.find((o) => o.x === 24)!;
    return { id: o.id, x: o.x, y: o.y, elixir: m.state.elixir };
  });
  await selectTree(page, setup.id);
  await expect(page.locator('.obstacle-context')).toContainText('No builder needed');
  await page.locator(`[data-action="obstacle-remove:${setup.id}"]`).click();
  expect(await page.evaluate(() => window.__game.model.busy)).toBe(2);
  expect(await page.evaluate(() => window.__game.model.state.elixir)).toBe(setup.elixir - 2000);
  await page.locator(`[data-action="obstacle-cancel:${setup.id}"]`).click();
  expect(await page.evaluate(() => window.__game.model.state.elixir)).toBe(setup.elixir);
  await page.locator(`[data-action="obstacle-remove:${setup.id}"]`).click();
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  await selectTree(page, setup.id);
  await expect(page.locator('[data-obstacle-time]')).toBeVisible();
  await expect(page.locator(`[data-action="obstacle-finish:${setup.id}"]`)).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({
    path: `output/playtest/obstacle-removal-phone-${test.info().project.name}.png`,
  });
  await page.locator(`[data-action="obstacle-finish:${setup.id}"]`).click();
  await expect(page.locator('.obstacle-context')).toHaveCount(0);
  expect(await page.evaluate((id) => window.__game.scene.obstacleSprites.has(id), setup.id)).toBe(
    false,
  );
  expect(await page.evaluate(() => window.__game.model.busy)).toBe(2);
  await page.evaluate(() => {
    const m = window.__game.model;
    for (const b of m.state.buildings) delete b.upgradeEnd;
    m.beginBuild('wall');
  });
  const p = await page.evaluate(
    ({ x, y }) => window.__game.scene.screenFor(x + 0.5, y + 0.5),
    setup,
  );
  await page.mouse.click(p.x, p.y);
  expect(
    await page.evaluate(
      ({ x, y }) =>
        window.__game.model.state.buildings.some(
          (b) => b.kind === 'wall' && b.x === x && b.y === y,
        ),
      setup,
    ),
  ).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(
    await page.evaluate((id) => window.__game.model.obstacles.some((o) => o.id === id), setup.id),
  ).toBe(false);
});

test('home obstacles stay out of combat and clearing finishes while away from the village', async ({
  page,
}) => {
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    const o = m.obstacles[0];
    m.removeObstacle(o.id);
    m.startBattle(0);
    return o.id;
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...window.__game.scene.obstacleSprites.values()].every((im) => !im.visible),
      ),
    )
    .toBe(true);
  await page.evaluate(() => window.advanceTime(11000));
  expect(
    await page.evaluate((id) => window.__game.model.obstacles.some((o) => o.id === id), id),
  ).toBe(false);
  await page.locator('[data-action="home"]').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...window.__game.scene.obstacleSprites.values()].every((im) => im.visible),
      ),
    )
    .toBe(true);
  expect(await page.evaluate((id) => window.__game.scene.obstacleSprites.has(id), id)).toBe(false);
});
