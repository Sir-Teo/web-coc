import { test, expect, type Page } from '@playwright/test';

/** Screen point of a tile's centre, with the camera brought over it first. */
async function tile(page: Page, x: number, y: number) {
  return page.evaluate(
    async ({ x, y }) => {
      const { scene } = window.__game;
      scene.cameras.main.centerOn(896 + (x - y) * 32, 112 + (x + y) * 16);
      scene.clampCamera();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return scene.screenFor(x, y);
    },
    { x, y },
  );
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.elixir = 100_000;
    m.changed();
  });
});

test('phone Shop sells a Torch, places it on the edge, then stashes it for a free placement', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Decorations"]').click();
  const torch = page.locator('[data-decoration="torch"]');
  await expect(torch).toContainText('Torch');
  await expect(torch).toContainText('0/4');
  // Experience level 30 buys the Ancient Skull; a new village is far from it.
  await expect(page.locator('[data-action="decoration:skull-altar"]')).toBeDisabled();
  await page.locator('[data-action="decoration:torch"]').click();
  await expect(page.locator('.placement-banner')).toContainText('Place Torch');
  // A free tile on the outer edge, where only obstacles and decorations stand.
  const spot = await page.evaluate(() => {
    const m = window.__game.model;
    for (let y = 20; y < 40; y++) if (m.canPlaceDecoration('torch', 0, y)) return { x: 0, y };
  });
  expect(spot).toBeDefined();
  expect(
    await page.evaluate(({ x, y }) => window.__game.model.canPlace('cannon', x, y), spot!),
  ).toBe(false);
  const edge = await tile(page, spot!.x + 0.5, spot!.y + 0.5);
  await page.mouse.click(edge.x, edge.y);
  const placed = await page.evaluate(() => {
    const m = window.__game.model;
    return { decorations: m.decorations, elixir: m.state.elixir };
  });
  expect(placed.decorations).toEqual([expect.objectContaining({ kind: 'torch', ...spot })]);
  expect(placed.elixir).toBe(100_000 - 500);
  expect(requested).toContain('/assets/decorations-native/torch.png');
  const id = placed.decorations[0].id;
  // The client portrait draws once loaded, standing on its footprint.
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const im = window.__game.scene.decorationSprites.get(id);
        return im?.visible && im.texture.key;
      }, id),
    )
    .toBe('decoration-torch');
  await expect(page.locator('.decoration-context h2')).toHaveText('Torch');
  await page.locator(`[data-action="decoration-stash:${id}"]`).click();
  await expect(page.locator('.decoration-context h2')).toHaveText('Stash Decoration?');
  await expect(page.locator('.decoration-context')).toContainText(
    'Torch will be moved to the Shop and can be placed again at no cost.',
  );
  await expect(page.locator('.decoration-context')).toBeInViewport({ ratio: 1 });
  await page.locator(`[data-action="decoration-stash-confirm:${id}"]`).click();
  expect(await page.evaluate(() => window.__game.model.stashedDecorations)).toEqual({ torch: 1 });
  await expect.poll(() => page.evaluate(() => window.__game.scene.decorationSprites.size)).toBe(0);
  // Back in the Shop it is placed again for nothing.
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Decorations"]').click();
  await expect(torch).toContainText('1 in Shop');
  await page.locator('[data-action="decoration:torch"]').click();
  const free = await page.evaluate(() => {
    const m = window.__game.model;
    for (let y = 30; y < 40; y++)
      for (let x = 14; x < 24; x++) if (m.canPlaceDecoration('torch', x, y)) return { x, y };
  });
  const inside = await tile(page, free!.x + 0.5, free!.y + 0.5);
  await page.mouse.click(inside.x, inside.y);
  expect(
    await page.evaluate(() => {
      const m = window.__game.model;
      return { elixir: m.state.elixir, stashed: m.stashedDecorations, n: m.decorations.length };
    }),
  ).toEqual({ elixir: 100_000 - 500, stashed: {}, n: 1 });
  // Saved with the village and drawn again after a reload.
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await page.evaluate(() => window.__game.model.decorations.length)).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() => [...window.__game.scene.decorationSprites.values()][0]?.texture.key),
    )
    .toBe('decoration-torch');
});
