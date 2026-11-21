import { test, expect, type Page } from '@playwright/test';

test.use({ hasTouch: true });

async function selectTree(page: Page, id: number) {
  await expect(page.locator('#loading')).toBeHidden();
  const point = await page.evaluate(async (id) => {
    const { scene, model } = window.__game;
    const { OBSTACLES } = await import('/src/game/obstacles.ts');
    const o = model.obstacles.find((o) => o.id === id);
    const size = OBSTACLES[o.kind].size;
    scene.cameras.main.centerOn(896 + (o.x - o.y) * 32, 112 + (o.x + o.y + 2) * 16);
    scene.clampCamera();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const p = scene.screenFor(o.x + size / 2, o.y + size / 2);
    const im = scene.obstacleSprites.get(id);
    return {
      x: p.x,
      y: p.y - im.displayHeight * scene.cameras.main.zoom * 0.4,
      name: OBSTACLES[o.kind].name,
    };
  }, id);
  await page.touchscreen.tap(point.x, point.y);
  // The client's own name for the kind (Tree, Bush, Trunk, Mushroom).
  await expect(page.locator('.obstacle-context h2')).toHaveText(point.name);
  await expect
    .poll(() =>
      page
        .locator('.obstacle-context .context-art')
        .evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0),
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  // The starter village holds 750 of each resource; a tree costs 2,000 Elixir to clear.
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.gold = m.state.elixir = 100_000;
    m.changed();
  });
});

test('phone obstacle removal works with all Builders busy, refunds and survives reload', async ({
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
  const remove = page.locator(`[data-action="obstacle-remove:${setup.id}"]`);
  await expect(remove).toBeEnabled();
  await remove.tap();
  expect(await page.evaluate(() => window.__game.model.busy)).toBe(2);
  expect(await page.evaluate(() => window.__game.model.state.elixir)).toBe(setup.elixir - 2000);
  await page.locator(`[data-action="obstacle-cancel:${setup.id}"]`).click();
  expect(await page.evaluate(() => window.__game.model.state.elixir)).toBe(setup.elixir);
  // Hold the wall clock so the ten-second clearing outlasts the reload below.
  await page.clock.setFixedTime(await page.evaluate(() => Date.now()));
  await page.locator(`[data-action="obstacle-remove:${setup.id}"]`).click();
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await selectTree(page, setup.id);
  await expect(page.locator('[data-obstacle-time]')).toBeVisible();
  expect(await page.evaluate(() => window.__game.model.busy)).toBe(2);
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
    m.townhall!.level = 3; // Make room beyond the starter's TH2 wall allowance.
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
  await page.waitForFunction(() => window.__game?.scene.artSettled);
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

test('offline regrowth renders a persistent selectable tree with saved identity and removal', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const setup = await page.evaluate(() => {
    const m = window.__game.model;
    const g = m.state.obstacleGrowth!;
    g.nextAt = Date.now() - 1000;
    g.seed = 4000;
    m.changed();
    return { id: g.nextId, count: m.obstacles.length };
  });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.obstacleSprites.has(id), setup.id))
    .toBe(true);
  const grown = await page.evaluate((id) => {
    const m = window.__game.model;
    return {
      tree: m.obstacles.find((o) => o.id === id),
      growth: m.state.obstacleGrowth,
      count: m.obstacles.length,
      text: JSON.parse(window.render_game_to_text()),
    };
  }, setup.id);
  expect(grown.count).toBe(setup.count + 1);
  // One of the client's eight regrowing kinds, by its weights.
  expect([
    'pine-tree',
    'square-bush',
    'square-tree',
    'square-tree-2',
    'tree-trunk-1',
    'tree-trunk-2',
    'mushrooms',
    'fallen-tree',
  ]).toContain(grown.tree.kind);
  expect(grown.text.obstacles).toContainEqual({
    id: setup.id,
    type: grown.tree.kind,
    x: grown.tree.x,
    y: grown.tree.y,
    size: grown.tree.kind.startsWith('square-tree') ? 3 : 2,
    removalSeconds: null,
  });
  await selectTree(page, setup.id);
  await expect(page.locator(`[data-action="obstacle-remove:${setup.id}"]`)).toBeVisible();
  await expect(
    page.locator(`.obstacle-context [data-action="obstacle-remove:${setup.id}"] svg path`).first(),
  ).toBeVisible();
  await page.screenshot({ path: `output/playtest/tree-regrowth-${test.info().project.name}.png` });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(
    await page.evaluate(
      (id) => ({
        tree: window.__game.model.obstacles.find((o) => o.id === id),
        growth: window.__game.model.state.obstacleGrowth,
      }),
      setup.id,
    ),
  ).toEqual({ tree: grown.tree, growth: grown.growth });
  await selectTree(page, setup.id);
  await page.locator(`[data-action="obstacle-remove:${setup.id}"]`).click();
  await page.locator(`[data-action="obstacle-finish:${setup.id}"]`).click();
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.obstacleSprites.has(id), setup.id))
    .toBe(false);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(
    await page.evaluate((id) => window.__game.model.obstacles.some((o) => o.id === id), setup.id),
  ).toBe(false);
  expect(errors).toEqual([]);
});

test('trees grow at home during an attack and appear only when returning home', async ({
  page,
}) => {
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    const g = m.state.obstacleGrowth!;
    const id = g.nextId;
    m.startBattle(0);
    g.nextAt = m.clock + 1000;
    m.tick(g.nextAt);
    return id;
  });
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.obstacleSprites.get(id)?.visible, id))
    .toBe(false);
  expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).obstacles)).toEqual([]);
  await page.locator('[data-action="home"]').click();
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.obstacleSprites.get(id)?.visible, id))
    .toBe(true);
  expect(
    await page.evaluate(
      (id) => JSON.parse(window.render_game_to_text()).obstacles.some((o) => o.id === id),
      id,
    ),
  ).toBe(true);
});

test('phone tree clearing can open the in-game Elixir shortfall offer', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => window.__game.scene.cameras.main.width === 390);
  await page.clock.setFixedTime(await page.evaluate(() => Date.now()));
  const fixture = await page.evaluate(() => {
    const m = window.__game.model;
    m.state.elixir = 750;
    m.state.gems = 500;
    m.changed();
    return { id: m.obstacles.find((o) => o.x === 24)!.id, busy: m.busy };
  });
  const read = () =>
    page.evaluate((id) => {
      const m = window.__game.model;
      const tree = m.obstacles.find((o) => o.id === id);
      return {
        elixir: m.state.elixir,
        gems: m.state.gems,
        busy: m.busy,
        end: tree?.removeEnd,
        present: !!tree,
      };
    }, fixture.id);
  await selectTree(page, fixture.id);
  const remove = page.locator(`[data-action="obstacle-remove:${fixture.id}"]`);
  await expect(remove).toBeEnabled();
  await remove.tap();
  const offer = page.locator('.shortfall-body');
  await expect(offer).toContainText('Buy the missing 1,250 Elixir?');
  const buy = offer.locator('[data-action="shortfall-buy"]');
  const gems = Number((await buy.innerText()).trim());
  expect(gems).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('tree-shortfall.png'), animations: 'disabled' });
  await buy.tap();
  const clearing = await read();
  expect(clearing).toMatchObject({
    elixir: 0,
    gems: 500 - gems,
    busy: fixture.busy,
    present: true,
  });
  expect(clearing.end).toBeDefined();
  await page.reload();
  await page.waitForFunction(() => window.__game.scene.artSettled);
  expect(await read()).toEqual(clearing);
  await page.goto('about:blank');
  await page.clock.setFixedTime(clearing.end! + 1);
  await page.goto('/');
  await page.waitForFunction(() => window.__game.scene.artSettled);
  expect(await read()).toMatchObject({ elixir: 0, busy: fixture.busy, present: false });
});

test('placed obstacles and move previews preserve the source crop registration', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  const id = await page.evaluate(() => {
    const tree = window.__game.model.obstacles.find((o) => o.kind === 'pine-tree' && o.x === 24)!;
    tree.movable = true;
    return tree.id;
  });
  const art = await page.evaluate(async (id) => {
    const { model, scene } = window.__game;
    const { OBSTACLES } = await import('/src/game/obstacles.ts');
    const o = model.obstacles.find((o) => o.id === id)!;
    const { art, size } = OBSTACLES[o.kind];
    const im = scene.obstacleSprites.get(id)!;
    return {
      expected: [art.originX, art.originY * art.height * 1.2 + 32 * size, art.width * 1.2],
      actual: [im.originX, im.originY * im.displayHeight, im.displayWidth],
      depth: im.depth,
      y: im.y,
    };
  }, id);
  expect(art.actual).toEqual(art.expected.map((value) => expect.closeTo(value, 5)));
  expect(art.depth).toBe(art.y);
  await selectTree(page, id);
  await page.locator(`[data-action="obstacle-move:${id}"]`).tap();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const ghost = window.__game.scene.obstacleGhost;
        return ghost?.visible && [
          ghost.originX,
          ghost.originY * ghost.displayHeight,
          ghost.displayWidth,
        ];
      }),
    )
    .toEqual(art.actual);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__game.model.movingObstacle)).toBeNull();
});

test('clearing feedback leaves the obstacle card readable after rotation', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  const id = await page.evaluate(() => window.__game.model.obstacles.find((o) => o.x === 24)!.id);
  await selectTree(page, id);
  await page.locator(`[data-action="obstacle-remove:${id}"]`).tap();
  const toast = page.locator('#toast');
  const card = page.locator('.obstacle-context');
  await expect(toast).toContainText('Clearing tree');
  await expect(card.locator('[data-obstacle-time]')).toBeVisible();
  const overlaps = () =>
    page.evaluate(() => {
      const toast = document.querySelector('#toast')!.getBoundingClientRect();
      const card = document.querySelector('.obstacle-context')!.getBoundingClientRect();
      return (
        toast.left < card.right &&
        toast.right > card.left &&
        toast.top < card.bottom &&
        toast.bottom > card.top
      );
    });
  await expect.poll(overlaps).toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toast).toHaveClass('show');
  await expect.poll(overlaps).toBe(false);
  await card.locator(`[data-action="obstacle-cancel:${id}"]`).tap();
  await expect(toast).toContainText('refunded');
  await expect.poll(overlaps).toBe(false);
});
