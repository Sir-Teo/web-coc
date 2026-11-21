import { test, expect, type Page } from '@playwright/test';

/** An open grass point near the middle of the screen, where a finger could deploy. */
async function grassPoint(page: Page, unobscured = false) {
  return page.evaluate((unobscured) => {
    const { scene, model } = window.__game;
    const w = innerWidth,
      h = innerHeight;
    let best: { x: number; y: number; d: number } | null = null;
    for (let x = 1.5; x < 44; x++)
      for (let y = 1.5; y < 44; y++) {
        if (model.deployBlocked(x, y)) continue;
        const p = scene.screenFor(x, y);
        if (p.x < 40 || p.x > w - 40 || p.y < h * 0.3 || p.y > h * 0.6) continue;
        if (unobscured && document.elementFromPoint(p.x, p.y) !== scene.game.canvas) continue;
        const d = Math.hypot(p.x - w / 2, p.y - h / 2);
        if (!best || d < best.d) best = { x: p.x, y: p.y, d };
      }
    return best!;
  }, unobscured);
}

test.use({ viewport: { width: 390, height: 844 } });

async function startDeployment(page: Page, archers?: number, lightning = false) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate(({ archers, lightning }) => {
    const m = window.__game.model;
    m.state.army.swordsman = 40;
    if (archers !== undefined) m.state.army.archer = archers;
    if (lightning) m.state.spells.lightning = 1;
    m.changed();
    m.startCampaign(0);
    m.activeTroop = 'swordsman';
    m.changed();
  }, { archers, lightning });
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

  test('rotation breaks a rapid deployment sequence before the next touch', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await startDeployment(page);
    await page.evaluate(() => {
      window.__game.scene.paused = true;
      const now = performance.now();
      Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
    });
    const first = await page.evaluate(() => {
      const { scene, model, game } = window.__game;
      for (let y = 176; y < 195; y += 4)
        for (let x = 170; x <= 400; x += 4) {
          if (document.elementFromPoint(x, y) !== game.canvas) continue;
          const tile = scene.gridAtScreen(x, y);
          if (!model.deployBlocked(tile.x, tile.y)) return { x, y, tile };
        }
      throw Error('No exposed grass between the scouting HUD and the tray');
    });
    await page.touchscreen.tap(first.x, first.y);
    const remaining = () =>
      page.evaluate(() => window.__game.model.battle!.remaining.swordsman);
    expect(await remaining()).toBe(39);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const { game, scene } = window.__game;
      return game.canvas.getBoundingClientRect().width === 390 &&
        scene.cameraViewport.width === scene.cameras.main.width;
    });
    const next = await page.evaluate(({ x, y }) => {
      const { scene, game } = window.__game;
      scene.cameras.main.preRender();
      const p = scene.screenFor(x, y);
      if (document.elementFromPoint(p.x, p.y) !== game.canvas)
        throw Error('The original tile is covered after rotation');
      return p;
    }, first.tile);
    await page.touchscreen.tap(next.x, next.y);
    expect(await remaining()).toBe(38);
  });

  test('a two-finger gesture interrupts rapid deployment without spending troops', async ({
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
    await page.evaluate(() => {
      window.__game.scene.paused = true;
      const now = performance.now();
      Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
    });
    const cdp = await page.context().newCDPSession(page);
    await page.touchscreen.tap(first.x, first.y);
    expect(await remaining()).toBe(start - 1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [first, second],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await remaining()).toBe(start - 1);

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await remaining()).toBe(start - 2);
  });

  test('a quick camera pan breaks a rapid deployment sequence', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
    await startDeployment(page);
    const point = await grassPoint(page);
    const touch = { id: 1, x: Math.round(point.x), y: Math.round(point.y) };
    const remaining = () => page.evaluate(() => window.__game.model.battle!.remaining.swordsman);
    const cameraX = () => page.evaluate(() => window.__game.scene.cameras.main.scrollX);
    const start = await remaining();
    await page.evaluate(() => {
      window.__game.scene.paused = true;
      const now = performance.now();
      Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
    });
    const cdp = await page.context().newCDPSession(page);
    await page.touchscreen.tap(touch.x, touch.y);
    expect(await remaining()).toBe(start - 1);
    const beforePan = await cameraX();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...touch, x: touch.x + 10 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await cameraX()).not.toBe(beforePan);
    expect(await remaining()).toBe(start - 1);

    await page.touchscreen.tap(touch.x + 10, touch.y);
    expect(await remaining()).toBe(start - 2);
  });

  test('a map hold cannot deploy behind a deployment card', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
    await page.setViewportSize({ width: 390, height: 650 });
    await startDeployment(page);
    await page.locator('[data-action="troop:swordsman"]').tap();
    const grass = await grassPoint(page);
    const covered = await page.evaluate(() => {
      const { scene, model } = window.__game;
      const card = document.querySelector('[data-action="troop:swordsman"]')!;
      const box = card.getBoundingClientRect();
      for (let y = box.top + 8; y < box.bottom - 8; y += 6)
        for (let x = box.left + 8; x < box.right - 8; x += 6) {
          const tile = scene.gridAtScreen(x, y);
          if (card.contains(document.elementFromPoint(x, y)) && !model.deployBlocked(tile.x, tile.y))
            return { x, y };
        }
      return null;
    });
    expect(covered).not.toBeNull();
    const remaining = () => page.evaluate(() => window.__game.model.battle!.remaining.swordsman);
    const start = await remaining();
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, point?: { x: number; y: number }) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [],
      });
    await touch('touchStart', grass);
    await expect.poll(remaining, { intervals: [25] }).toBe(start - 1);
    await touch('touchMove', covered!);
    await page.waitForTimeout(550);
    await touch('touchEnd');
    expect(await remaining()).toBe(start - 1);
    await page.touchscreen.tap(grass.x, grass.y);
    expect(await remaining()).toBe(start - 2);
  });

  test('releasing a spell gesture over a troop card leaves the spell ready', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
    await page.setViewportSize({ width: 390, height: 650 });
    await startDeployment(page, undefined, true);
    await page.locator('[data-action="spell:lightning"]').tap();
    const grass = await grassPoint(page);
    const box = (await page.locator('[data-action="troop:swordsman"]').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: grass.x, y: grass.y, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const spells = () => page.evaluate(() => window.__game.model.battle!.spells.lightning);
    expect(await spells()).toBe(1);
    await page.touchscreen.tap(grass.x, grass.y);
    expect(await spells()).toBe(0);
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

  test('an unlocked village keeps its scout open after empty-army preparation', async ({ page }) => {
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.locator('.train-add').tap();
    const clear = page.locator('[data-action="clear-army"]');
    if (await clear.isEnabled()) await clear.tap();
    await page.locator('[data-action="close-drawer"]').tap();
    await page.locator('.attack-btn').tap();
    await page.locator('[data-action="attack:0"]').tap();
    const scout = page.locator('.campaign-scout');
    await scout.getByRole('button', { name: 'Prepare army' }).tap();
    await expect(page.locator('[data-action="train:swordsman"]').first()).toBeVisible();
    await page.locator('[data-action="close-drawer"]').tap();
    await expect(scout.getByRole('heading', { name: 'Payback' })).toBeVisible();
    expect(await page.evaluate(() => window.__game.model.battle)).toBeNull();
  });

  for (const viewport of [
    { width: 390, height: 650 },
    { width: 390, height: 844 },
    { width: 668, height: 390 },
  ]) {
    test(`an empty army can be prepared directly from the campaign map at ${viewport.width}×${viewport.height}`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
      await page.setViewportSize(viewport);
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
      const list = page.locator('.campaign-list');
      const priorScroll = await list.evaluate((element) => {
        element.scrollTop = 500;
        return element.scrollTop;
      });
      expect(priorScroll).toBe(500);
      await prepare.tap();
      const train = page.locator('[data-action="train:swordsman"]').first();
      await expect(train).toBeEnabled();
      await page.keyboard.press('Escape');
      await expect(list).toBeVisible();
      const offset = () =>
        list.evaluate(async (element) => {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return element.scrollTop;
        });
      expect(await offset()).toBe(priorScroll);
      await expect(prepare).toBeFocused();
      const bounds = (await list.boundingBox())!;
      const x = Math.round(bounds.x + bounds.width * 0.45);
      const y = Math.round(Math.min(bounds.y + bounds.height, viewport.height) - 15);
      const travel = Math.min(60, Math.round(bounds.height / 2));
      await list.evaluate((element) => {
        element.addEventListener(
          'scrollend',
          () => element.setAttribute('data-swipe-settled', ''),
          {
            once: true,
          },
        );
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 6; step++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: Math.round(y - (travel * step) / 6) }],
        });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(offset).toBeGreaterThan(priorScroll);
      // A tap during the swipe's momentum can stop scrolling without activating the button.
      await expect(list).toHaveAttribute('data-swipe-settled', '');
      const returnOffset = await offset();
      await prepare.tap();
      await train.tap();
      await page.locator('[data-action="close-drawer"]').tap();
      await expect(list).toBeVisible();
      expect(await offset()).toBe(returnOffset);
      await expect(prepare).toHaveCount(0);
      await expect(page.locator('.campaign-modal [data-action="close"]')).toBeFocused();
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
      await expect
        .poll(() => page.evaluate(() => window.__game.model.state.army.swordsman))
        .toBe(1);
    });
  }
});

test.describe('phone viewport changes during raids', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('rotation keeps the raid framed and cancels a stale deployment hold', async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
    await startDeployment(page, 5);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.battle!.spells.heal = model.battle!.carried.heal = 2;
      model.state.settings.battleSpeed = 1;
      scene.setZoom(scene.baseZoom * 1.4);
      model.changed();
    });
    const stock = () =>
      page.evaluate(() => {
        const b = window.__game.model.battle!;
        return { troops: b.remaining.swordsman, spells: b.spells.heal };
      });
    const framing = () =>
      page.evaluate(() => {
        const { scene } = window.__game;
        const camera = scene.cameras.main;
        return {
          x: camera.scrollX + camera.width / 2,
          y: camera.scrollY + camera.height / 2,
          zoom: scene.viewZoom,
        };
      });
    const rotate = async (width: number, height: number) => {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(
        ({ width, height }) => {
          const rect = window.__game.game.canvas.getBoundingClientRect();
          const { cameraViewport, cameras } = window.__game.scene;
          return (
            rect.width === width &&
            rect.height === height &&
            cameraViewport.width === cameras.main.width &&
            cameraViewport.height === cameras.main.height
          );
        },
        { width, height },
      );
      await expect(page.locator('[data-action="troop:swordsman"]')).toBeInViewport();
      await expect(page.locator('[data-action="spell:heal"]')).toBeInViewport();
    };
    const initial = await stock();
    const portrait = await framing();
    await rotate(844, 390);
    const landscape = await framing();
    expect(landscape.x).toBeCloseTo(portrait.x, 0);
    expect(landscape.y).toBeCloseTo(portrait.y, 0);
    expect(await stock()).toEqual(initial);
    await page.screenshot({ path: info.outputPath('raid-landscape.png'), animations: 'disabled' });

    const point = await grassPoint(page);
    const touch = { x: Math.round(point.x), y: Math.round(point.y), id: 1 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
    await expect.poll(async () => (await stock()).troops).toBeLessThan(initial.troops);
    await rotate(390, 844);
    const afterResize = await stock();
    await page.waitForTimeout(550);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await stock()).toEqual(afterResize);
    const back = await framing();
    expect(back.x).toBeCloseTo(portrait.x, 0);
    expect(back.y).toBeCloseTo(portrait.y, 0);
    expect(back.zoom).toBeCloseTo(portrait.zoom, 2);

    await page.locator('[data-action="troop:swordsman"]').tap();
    const target = await grassPoint(page);
    await page.touchscreen.tap(target.x, target.y);
    expect(await stock()).toEqual({ ...afterResize, troops: afterResize.troops - 1 });
    await page.locator('[data-action="spell:heal"]').tap();
    await page.touchscreen.tap(target.x, target.y);
    expect(await stock()).toEqual({ troops: afterResize.troops - 1, spells: initial.spells - 1 });
  });
});

test.describe('full deployment tray on touch', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('swipes scroll the full roster without changing selection or deploying', async ({
    page,
    browserName,
  }, info) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
    await startDeployment(page);
    await page.evaluate(() => {
      const { model } = window.__game;
      const battle = model.battle!;
      // Stress the tray with every roster entry in a disposable browser session.
      for (const key of Object.keys(battle.carriedArmy) as (keyof typeof battle.carriedArmy)[])
        battle.carriedArmy[key] = battle.remaining[key] = 2;
      for (const key of Object.keys(battle.carried) as (keyof typeof battle.carried)[])
        battle.carried[key] = battle.spells[key] = 1;
      model.changed();
    });
    const state = () =>
      page.evaluate(() => {
        const { model } = window.__game;
        return {
          troop: model.activeTroop,
          spell: model.activeSpell,
          remaining: model.battle!.remaining,
          spells: model.battle!.spells,
          started: model.battle!.started,
        };
      });
    const tray = page.locator('.deploy-tray .army-tray');
    await expect.poll(() => tray.locator('.troop-card').count()).toBeGreaterThan(20);
    const cdp = await page.context().newCDPSession(page);
    const swipe = async () => {
      const box = (await tray.boundingBox())!;
      const x = Math.round(box.x + box.width * 0.82);
      const y = Math.round(box.y + box.height * 0.5);
      const touch = (type: string, at: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x: at, y, id: 1 }],
        });
      const before = await tray.evaluate((el) => el.scrollLeft);
      await touch('touchStart', x);
      for (let step = 1; step <= 8; step++)
        await touch('touchMove', x - Math.round((box.width * 0.6 * step) / 8));
      await touch('touchEnd', x);
      await expect.poll(() => tray.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 20);
    };
    const before = await state();
    await swipe();
    expect(await state()).toEqual(before);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => innerWidth === 844 && innerHeight === 390);
    await swipe();
    expect(await state()).toEqual(before);
    await page.screenshot({
      path: info.outputPath('full-tray-landscape.png'),
      animations: 'disabled',
    });

    const action = await tray.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return [...el.querySelectorAll<HTMLButtonElement>('button[data-action^="troop:"]')].find(
        (button) => {
          const card = button.getBoundingClientRect();
          return (
            !button.disabled &&
            card.left >= rect.left &&
            card.right <= rect.right &&
            button.dataset.action !== 'troop:swordsman'
          );
        },
      )?.dataset.action;
    });
    expect(action).toBeTruthy();
    // Keep this small campaign base from falling while the HUD assertions run.
    await page.evaluate(() => {
      window.__game.scene.paused = true;
    });
    await tray.locator(`[data-action="${action}"]`).tap();
    const troop = action!.split(':')[1] as keyof typeof before.remaining;
    expect(await state()).toEqual({ ...before, troop });
    const target = await grassPoint(page);
    await page.touchscreen.tap(target.x, target.y);
    expect(await state()).toEqual({
      ...before,
      troop,
      started: true,
      remaining: { ...before.remaining, [troop]: before.remaining[troop] - 1 },
    });

    const refresh = () =>
      page.evaluate(async () => {
        window.__game.model.changed();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      });
    const offset = () => tray.evaluate((el) => el.scrollLeft);
    const card = tray.locator(`[data-action="${action}"]`);
    const troopOffset = await offset();
    await page.touchscreen.tap(target.x, target.y);
    await expect(card).toBeDisabled();
    const depleted = await state();
    expect(depleted).toEqual({
      ...before,
      troop,
      started: true,
      remaining: { ...before.remaining, [troop]: 0 },
    });
    await refresh();
    expect(await offset()).toBeCloseTo(troopOffset, 0);
    expect(await state()).toEqual(depleted);

    const heal = tray.locator('[data-action="spell:heal"]');
    await heal.scrollIntoViewIfNeeded();
    await heal.tap();
    const spellOffset = await offset();
    expect(spellOffset).toBeGreaterThan(troopOffset);
    await page.touchscreen.tap(target.x, target.y);
    await expect(heal).toBeDisabled();
    const spent = await state();
    expect(spent.troop).toBe(troop);
    expect(spent.spell).toBe('rage');
    await expect(tray.locator('[data-action="spell:rage"]')).toHaveClass(/selected/);
    expect(spent.spells).toEqual({ ...depleted.spells, heal: 0 });
    expect(spent.remaining).toEqual(depleted.remaining);
    await refresh();
    expect(await offset()).toBeCloseTo(spellOffset, 0);
    expect(await state()).toEqual(spent);
  });

  test('reveals the next spell when the spent card was scrolled far away', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await startDeployment(page);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      scene.paused = true;
      const battle = model.battle!;
      for (const key of Object.keys(battle.carried) as (keyof typeof battle.carried)[])
        battle.carried[key] = battle.spells[key] = 1;
      model.changed();
    });
    const tray = page.locator('.deploy-tray .army-tray');
    const first = tray.locator('[data-action="spell:rage"]');
    const last = tray.locator('[data-action="spell:bat"]');
    await last.tap();
    await expect(first).not.toBeInViewport();
    const target = await grassPoint(page, true);
    await page.touchscreen.tap(target.x, target.y);
    await expect(last).toBeDisabled();
    await expect(first).toHaveClass(/selected/);
    await expect(first).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.__game.model.battle!.spells.rage)).toBe(1);
  });
});

test.describe('interrupted battle confirmation on touch', () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const interruption of ['blur', 'hidden'] as const) {
    test(`a stale touch cannot confirm surrender after ${interruption}`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
      await startDeployment(page);
      const point = await grassPoint(page);
      await page.touchscreen.tap(point.x, point.y);
      await page.locator('[data-action="surrender"]').tap();
      const confirm = page.locator('[data-action="end"]');
      const box = (await confirm.boundingBox())!;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }],
      });
      await page.evaluate((interruption) => {
        if (interruption === 'blur') {
          window.dispatchEvent(new Event('blur'));
        } else {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
          Reflect.deleteProperty(document, 'hidden');
          document.dispatchEvent(new Event('visibilitychange'));
        }
      }, interruption);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(confirm).toBeVisible();
      expect(await page.evaluate(() => window.__game.model.battle!.finished)).toBe(false);

      if (interruption === 'blur') await confirm.tap();
      else await confirm.press('Enter');
      await expect(page.getByRole('button', { name: 'Watch replay', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
      await page.getByRole('slider', { name: 'Replay position' }).press('End');
      await expect(page.locator('.replay-status')).toContainText('Replay complete');
      expect(await page.evaluate(() => window.__game.model.battle!.remaining.swordsman)).toBe(39);
    });
  }
});
