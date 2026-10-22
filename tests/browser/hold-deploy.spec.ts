import { test, expect, type Page } from '@playwright/test';

/** An open grass point near the middle of the screen, where a finger could deploy. */
async function grassPoint(page: Page) {
  return page.evaluate(() => {
    const { scene, model } = window.__game;
    const w = innerWidth,
      h = innerHeight;
    let best: { x: number; y: number; d: number } | null = null;
    for (let x = 1.5; x < 44; x++)
      for (let y = 1.5; y < 44; y++) {
        if (model.deployBlocked(x, y)) continue;
        const p = scene.screenFor(x, y);
        if (p.x < 40 || p.x > w - 40 || p.y < h * 0.3 || p.y > h * 0.6) continue;
        const d = Math.hypot(p.x - w / 2, p.y - h / 2);
        if (!best || d < best.d) best = { x: p.x, y: p.y, d };
      }
    return best!;
  });
}

test.use({ viewport: { width: 390, height: 844 } });

async function startDeployment(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.army.swordsman = 40;
    m.changed();
    m.startCampaign(0);
    m.activeTroop = 'swordsman';
    m.changed();
  });
  await expect(page.locator('.battle-enemy')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.battleArtPending()), { timeout: 15000 })
    .toBe(false);
}

test('holding a finger still streams troops, a tap drops one', async ({ page }) => {
  await startDeployment(page);
  const remaining = () => page.evaluate(() => window.__game.model.battle!.remaining.swordsman);
  const start = await remaining();
  const p = await grassPoint(page);

  // A quick tap is a single troop.
  await page.mouse.click(p.x, p.y);
  expect(await remaining()).toBe(start - 1);

  // Hold still for about a second and a half: the stream drops several troops.
  await page.waitForTimeout(500); // Clear the double-tap window.
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  const held = start - 1 - (await remaining());
  expect(held).toBeGreaterThanOrEqual(8);

  // Releasing stops the stream.
  const after = await remaining();
  await page.waitForTimeout(400);
  expect(await remaining()).toBe(after);
});

for (const interruption of ['blur', 'hidden', 'context-loss'] as const) {
  test(`a held map deployment stops on ${interruption} and requires a fresh press after returning`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await startDeployment(page);
    const remaining = () => page.evaluate(() => window.__game.model.battle!.remaining.swordsman);
    const start = await remaining();
    const point = await grassPoint(page);
    expect(point).not.toBeNull();
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    // Interrupt before the first hold deployment; returning must not resume the old press.
    await page.evaluate(async (interruption) => {
      if (interruption === 'blur') window.dispatchEvent(new Event('blur'));
      else if (interruption === 'hidden') {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      } else {
        const { game } = window.__game;
        const extension = game.renderer.gl.getExtension('WEBGL_lose_context');
        if (!extension) throw Error('Context-loss extension unavailable');
        await new Promise<void>((resolve) => {
          game.canvas.addEventListener(
            'webglcontextlost',
            () => setTimeout(() => extension.restoreContext(), 50),
            { once: true },
          );
          game.canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true });
          extension.loseContext();
        });
      }
    }, interruption);
    await page.evaluate(() => {
      delete (document as unknown as { hidden?: boolean }).hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(1100);
    expect(await remaining()).toBe(start);
    // A release from the interrupted press cannot become a tap either.
    await page.mouse.up();
    expect(await remaining()).toBe(start);
    await page.mouse.click(point.x, point.y);
    expect(await remaining()).toBe(start - 1);
    expect(
      await page.evaluate(() => ({
        paused: window.__game.scene.paused,
        glError: window.__game.game.renderer.gl.getError(),
      })),
    ).toEqual({ paused: false, glError: 0 });
    expect(errors).toEqual([]);
  });
}

test('a press begun while graphics are lost cannot deploy after restoration', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startDeployment(page);
  const remaining = () => page.evaluate(() => window.__game.model.battle!.remaining.swordsman);
  const start = await remaining();
  const point = await grassPoint(page);
  await page.evaluate(async () => {
    const { game } = window.__game;
    const extension = game.renderer.gl.getExtension('WEBGL_lose_context');
    if (!extension) throw Error('Context-loss extension unavailable');
    window.__restoreMapContext = () =>
      new Promise<void>((resolve) => {
        game.canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true });
        setTimeout(() => extension.restoreContext(), 50);
      });
    await new Promise<void>((resolve) => {
      game.canvas.addEventListener('webglcontextlost', () => resolve(), { once: true });
      extension.loseContext();
    });
  });
  expect(await page.evaluate(() => window.__game.scene.paused)).toBe(true);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.evaluate(async () => {
    await window.__restoreMapContext();
    delete window.__restoreMapContext;
  });
  await page.waitForTimeout(1100);
  expect(await remaining()).toBe(start);
  await page.mouse.up();
  expect(await remaining()).toBe(start);
  await page.mouse.click(point.x, point.y);
  expect(await remaining()).toBe(start - 1);
  expect(errors).toEqual([]);
});
