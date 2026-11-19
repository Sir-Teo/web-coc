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

async function startDeployment(page: Page, archers?: number) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate((archers) => {
    const m = window.__game.model;
    m.state.army.swordsman = 40;
    if (archers !== undefined) m.state.army.archer = archers;
    m.changed();
    m.startCampaign(0);
    m.activeTroop = 'swordsman';
    m.changed();
  }, archers);
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

test.describe('unarmed campaign scouting on touch', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('a scouting tap spends no troop until the player selects a card', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.locator('.attack-btn').tap();
    await page.locator('[data-action="attack:0"]').tap();
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const point = await grassPoint(page);
    const remaining = () => page.evaluate(() => window.__game.model.battle!.remaining.swordsman);
    const initial = await remaining();

    await page.touchscreen.tap(point.x, point.y);
    expect(await remaining()).toBe(initial);
    await expect(page.locator('.prep-banner')).toBeVisible();
    await expect(page.locator('.army-tray .selected')).toHaveCount(0);
    await expect(page.locator('.deploy-label')).toHaveText('Select a troop, hero or spell');
    await page.screenshot({ path: 'output/playtest/unarmed-scouting-phone.png' });

    await page.locator('[data-action="troop:swordsman"]').tap();
    await expect(page.locator('[data-action="troop:swordsman"]')).toHaveClass(/selected/);
    await page.touchscreen.tap(point.x, point.y);
    expect(await remaining()).toBe(initial - 1);
  });
});

test('a rapid second map tap deploys four troops with one tray refresh', async ({ page }) => {
  await startDeployment(page);
  const point = await grassPoint(page);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.paused = true;
    const original = model.onChange;
    window.__deploymentPasses = 0;
    model.onChange = (passive) => {
      if (passive) window.__deploymentPasses++;
      original(passive);
    };
  });
  await page.mouse.click(point.x, point.y);
  await page.mouse.click(point.x, point.y);
  const state = await page.evaluate(() => {
    const m = window.__game.model;
    return {
      units: m.battle!.units.length,
      remaining: m.battle!.remaining.swordsman,
      passes: window.__deploymentPasses,
    };
  });
  expect(state).toEqual({ units: 5, remaining: 35, passes: 1 });
  await expect(page.locator('[data-action="troop:swordsman"] .troop-count')).toHaveText('x35');
  await page.screenshot({ path: 'output/playtest/rapid-deployment-phone.png' });
});

test.describe('battle map multitouch', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('two fingers touching the battle map never spend a troop as a tap', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
    await startDeployment(page);
    const point = await grassPoint(page);
    const first = { id: 1, x: Math.round(point.x), y: Math.round(point.y) };
    const second = { id: 2, x: first.x + 12, y: first.y };
    const remaining = () => page.evaluate(() => window.__game.model.battle!.remaining.swordsman);
    const start = await remaining();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [first, second],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await remaining()).toBe(start);

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await remaining()).toBe(start - 1);
  });

  test('a second finger on a troop card cannot redirect a map hold', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
    await startDeployment(page, 5);
    const point = await grassPoint(page);
    const card = page.locator('[data-action="troop:archer"]');
    await expect(card).toBeVisible();
    const first = { id: 1, x: Math.round(point.x), y: Math.round(point.y) };
    const cdp = await page.context().newCDPSession(page);
    const remaining = () => page.evaluate(() => window.__game.model.battle!.remaining);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await expect.poll(async () => (await remaining()).swordsman).toBeLessThan(40);
    const box = (await card.boundingBox())!;
    await page.evaluate(() => {
      document.addEventListener(
        'pointerdown',
        (event) => {
          const target = event.target as Element;
          if (
            event.isTrusted &&
            event.pointerType === 'touch' &&
            !event.isPrimary &&
            target.closest('[data-action="troop:archer"]')
          )
            document.body.setAttribute('data-second-touch', 'seen');
        },
        { capture: true },
      );
    });
    const second = {
      id: 2,
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
    };
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [first, second],
    });
    await expect(page.locator('body')).toHaveAttribute('data-second-touch', 'seen');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
    await page.waitForTimeout(650);
    expect((await remaining()).archer).toBe(5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect((await remaining()).archer).toBe(5);

    await card.tap();
    await expect(card).toHaveClass(/selected/);
    await page.touchscreen.tap(point.x, point.y);
    expect((await remaining()).archer).toBe(4);
  });
});

test('switching troop cards starts a fresh deployment tap', async ({ page }) => {
  await startDeployment(page, 5);
  const point = await grassPoint(page);
  await page.evaluate(() => {
    window.__game.scene.paused = true;
    // Keep the two map taps inside the rapid-tap window regardless of renderer timing.
    const now = performance.now();
    Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
  });
  await page.mouse.click(point.x, point.y);
  await page.locator('[data-action="troop:archer"]').dispatchEvent('click');
  await page.mouse.click(point.x, point.y);
  const army = await page.evaluate(() => window.__game.model.battle!.remaining);
  expect(army.swordsman).toBe(39);
  expect(army.archer).toBe(4);
});

test.describe('phone campaign preparation', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('an empty army can be prepared directly from the campaign map', async ({ page }) => {
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.locator('.train-add').tap();
    const clear = page.locator('[data-action="clear-army"]');
    if (await clear.isEnabled()) await clear.tap();
    await page.locator('[data-action="close-drawer"]').tap();
    await page.locator('.attack-btn').tap();
    const prepare = page.getByRole('button', { name: 'Prepare army', exact: true });
    await expect(prepare).toBeVisible();
    await prepare.tap();
    const train = page.locator('[data-action="train:swordsman"]').first();
    await expect(train).toBeEnabled();
    await train.tap();
    await page.locator('[data-action="close-drawer"]').tap();
    await page.locator('.attack-btn').tap();
    await expect(prepare).toHaveCount(0);
    await page.locator('[data-action="attack:0"]').tap();
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await page.locator('[data-action="troop:swordsman"]').tap();
    const point = await grassPoint(page);
    await page.touchscreen.tap(point.x, point.y);
    await expect
      .poll(() => page.evaluate(() => window.__game.model.battle?.remaining.swordsman))
      .toBe(0);
    await page.locator('[data-action="surrender"]').tap();
    await page.locator('[data-action="end"]').tap();
    await page.locator('.result-modal [data-action="home"]').tap();
    await page.locator('.train-add').tap();
    await page.locator('[data-action="retrain"]').tap();
    await expect.poll(() => page.evaluate(() => window.__game.model.state.army.swordsman)).toBe(1);
  });
});
