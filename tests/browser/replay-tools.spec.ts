import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.startBattle(0, true);
    for (let i = 0; i < 50; i++) m.step(0.05);
    m.activeTroop = 'giant';
    m.deploy(1.2, 13);
    for (let i = 0; i < 1200; i++) m.step(0.05);
    m.finishBattle();
    m.returnHome();
  });
  await page.locator('[data-action="battle-log"]').click();
});

test('playback targets stay reachable at narrow portrait and landscape sizes', async ({ page }) => {
  await page.evaluate(() =>
    window.__game.hud.toast('Deploy on the grass outside the red boundary.'),
  );
  await page.getByRole('button', { name: 'Watch replay' }).click();
  await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 500 });
  await page.locator('[data-action="replay-pause"]').click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  await expect(pause.locator('svg')).toHaveCount(1);
  await expect(pause.locator('svg circle')).toHaveCount(0);
  await pause.click();
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [568, 320],
    [650, 390],
    [701, 390],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(
      (width) =>
        Math.round(
          window.__game.scene.cameras.main.width / window.__game.scene.scale.displayScale.x,
        ) === width,
      width,
    );
    const controls = page.getByRole('region', { name: 'Replay playback' });
    for (const name of ['Play', 'Restart', 'First deployment', 'Export replay', 'Back to log']) {
      const button = controls.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      await expect(button.locator('svg')).toHaveCount(1);
      await expect(button.locator('svg circle')).toHaveCount(0);
    }
    for (const control of await controls.locator('button, input').all()) {
      await expect(control).toBeInViewport({ ratio: 1 });
      await expect
        .poll(async () => {
          const box = await control.boundingBox();
          return !!box && box.width >= 44 && box.height >= 44;
        })
        .toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const box = (await controls.boundingBox())!;
    expect(box.y).toBeGreaterThan(120);
    expect(box.height).toBeLessThanOrEqual(height <= 450 ? 100 : 190);
    await page.screenshot({
      path: `output/playtest/replay-controls-${width}-${test.info().project.name}.png`,
    });
  }
});

for (const mobile of [false, true])
  test(`seeks backwards, revives troops, and preserves camera on ${mobile ? 'phone' : 'desktop'}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Watch replay' }).click();
    await page.locator('[data-action="replay-pause"]').click();
    const range = page.getByRole('slider', { name: 'Replay position' });
    await range.focus();
    await range.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    // A completed replay has no result dialog: its playback buttons keep normal tab order.
    const restart = page.locator('[data-action="replay-restart"]');
    await restart.focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-action="replay-speed:1"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(restart).toBeFocused();
    await page.waitForTimeout(450);
    const camera = await page.evaluate(() => {
      const { scene } = window.__game;
      scene.zoomBy(1.1);
      const c = scene.cameras.main;
      return {
        centerX: c.scrollX + c.width / 2,
        centerY: c.scrollY + c.height / 2,
        zoom: scene.viewZoom,
      };
    });
    await range.focus();
    await range.press('Home');
    await expect(page.locator('.replay-status')).toContainText('Replay paused');
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.time)).toBe(0);
    await page.locator('[data-action="replay-skip"]').click();
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.time)).toBeCloseTo(2.5);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          const u = model.battle.units[0];
          // Native troops hide their fallback sprite; require the revived mesh to draw.
          return !!u && u.hp > 0 && scene.troopNativePresentation.drewUnit(u.id);
        }),
      )
      .toBe(true);
    expect(
      await page.evaluate(() => {
        const scene = window.__game.scene,
          c = scene.cameras.main;
        // Adaptive render density may change raw scroll/zoom while preserving the view.
        return {
          centerX: c.scrollX + c.width / 2,
          centerY: c.scrollY + c.height / 2,
          zoom: scene.viewZoom,
        };
      }),
    ).toEqual(camera);
    await page.locator('[data-action="replay-jump:10"]').click();
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.seeking)).toBe(false);
    await page.locator('[data-action="replay-jump:-10"]').click();
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.time)).toBeCloseTo(2.5);
    // Seeking can replace the controls between locator resolution and layout measurement.
    await expect(range).toBeEnabled();
    let track = await range.boundingBox();
    await expect.poll(async () => (track = await range.boundingBox())).not.toBeNull();
    if (!track) throw new Error('Replay slider has no visible bounds');
    await page.mouse.move(track.x + track.width * 0.15, track.y + track.height / 2);
    await page.mouse.down();
    await range.evaluate((el) => el.setAttribute('data-drag-marker', 'kept'));
    const draggedValue = await range.inputValue();
    // Safari pointer interaction need not grant keyboard focus to a range input.
    await range.evaluate((el) => el.blur());
    await page.evaluate(() => window.__game.model.changed());
    await page.waitForTimeout(80);
    await expect(range).toHaveAttribute('data-drag-marker', 'kept');
    await expect(range).toHaveValue(draggedValue);
    await page.mouse.move(track.x + track.width * 0.5, track.y + track.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.seeking)).toBe(false);
    expect(await page.evaluate(() => window.__game.model.replay.time)).toBeGreaterThan(25);
    expect(await page.evaluate(() => window.__game.model.replay.time)).toBeLessThan(38);
    await page.locator('[data-action="replay-skip"]').click();
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.seeking)).toBe(false);
    await page.screenshot({
      path: `output/playtest/replay-seek-${mobile ? 'phone' : 'desktop'}.png`,
    });
    if (mobile) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.screenshot({ path: 'output/playtest/replay-seek-landscape.png' });
    }
    await page.locator('[data-action="replay-exit"]').click();
    expect(errors).toEqual([]);
  });
test('downloads a recording, opens it without replacing the village, and rejects bad files', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const before = await page.evaluate(() => {
    const s = window.__game.model.state;
    return {
      army: s.army,
      spells: s.spells,
      gold: s.gold,
      elixir: s.elixir,
      nextId: s.nextId,
      log: s.raidLog,
    };
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export replay' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('crown-and-clan.crown-replay.json');
  const bytes = await fs.readFile((await download.path())!);
  const file = JSON.parse(bytes.toString());
  expect(file.format).toBe('crown-clan-replay');
  expect(file.gold).toBeUndefined();
  const upload = async (buffer: Buffer) => {
    const choose = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open shared replay' }).click();
    await (
      await choose
    ).setFiles({ name: 'shared.crown-replay.json', mimeType: 'application/json', buffer });
  };
  await upload(Buffer.from('{}'));
  await expect(page.locator('#toast')).toContainText('replay file');
  await expect(page.locator('.battle-log-body')).toBeVisible();
  await upload(bytes);
  await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
  await expect(page.locator('.battle-enemy')).toContainText('Shared village');
  await page.locator('[data-action="replay-pause"]').click();
  await page.screenshot({ path: 'output/playtest/replay-imported.png' });
  await page.locator('[data-action="replay-restart"]').click();
  await expect(page.locator('.replay-status')).toContainText('Watching replay');
  await page.locator('[data-action="replay-exit"]').click();
  expect(
    await page.evaluate(() => {
      const s = window.__game.model.state;
      return {
        army: s.army,
        spells: s.spells,
        gold: s.gold,
        elixir: s.elixir,
        nextId: s.nextId,
        log: s.raidLog,
      };
    }),
  ).toEqual(before);
  const wrong = structuredClone(file);
  wrong.replay.version++;
  await upload(Buffer.from(JSON.stringify(wrong)));
  await expect(page.locator('#toast')).toContainText('different game version');
  await upload(bytes);
  await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await page.evaluate(() => window.__game.model.replay)).toBe(null);
  await page.locator('[data-action="battle-log"]').click();
  await expect(page.locator('.raid-record')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('phone replay controls refresh when the window blurs during a scrub', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Watch replay' }).click();
  const range = page.getByRole('slider', { name: 'Replay position' });
  await expect(range).toBeEnabled();
  await range.dispatchEvent('pointerdown', {
    pointerId: 31,
    pointerType: 'touch',
    isPrimary: true,
  });
  const speed = page.locator('[data-action="replay-speed:4"]');
  await speed.dispatchEvent('click');
  await expect(speed).toHaveAttribute('aria-pressed', 'false');

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(speed).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.replay-status')).toContainText('Replay paused');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('a second finger lifting does not end the active replay scrub', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Watch replay' }).click();
  const range = page.getByRole('slider', { name: 'Replay position' });
  await expect(range).toBeEnabled();
  const box = (await range.boundingBox())!;
  const first = {
    id: 1,
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  const second = { id: 2, x: first.x, y: first.y - 100 };
  const cdp = await page.context().newCDPSession(page);
  const scrubbing = () =>
    page.evaluate(() => Reflect.get(window.__game.hud, 'replayScrubPointer') !== null);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await expect.poll(scrubbing).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
  expect(await scrubbing()).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(scrubbing).toBe(false);

  await expect(range).toBeEnabled();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await expect.poll(scrubbing).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(scrubbing).toBe(false);
});

test.describe('rapid replay scrubbing', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('a new touch seek replaces a pending seek on the timeline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 650 });
    await page.getByRole('button', { name: 'Watch replay', exact: true }).click();
    await page.evaluate(() => {
      window.__game.scene.paused = true;
    });
    const range = page.getByRole('slider', { name: 'Replay position' });
    await expect(range).toBeVisible();
    const box = (await range.boundingBox())!;
    const tap = (fraction: number) =>
      page.touchscreen.tap(box.x + fraction * box.width, box.y + box.height / 2);
    const seek = () =>
      page.evaluate(() => {
        const { replay } = window.__game.model;
        return { seeking: replay!.seeking, target: replay!.seekTarget };
      });
    await tap(0.9);
    const first = await seek();
    expect(first.seeking).toBe(true);
    await expect(range).toBeEnabled();
    await tap(0.2);
    await expect.poll(async () => (await seek()).target).toBeLessThan(first.target / 2);
    const { time, target, paused } = await page.evaluate(() => {
      const { model } = window.__game;
      while (model.replay!.seeking) model.step(0.05);
      const { time, seekTarget: target, paused } = model.replay!;
      return { time, target, paused };
    });
    expect(target - time).toBeLessThanOrEqual(0.051);
    expect(paused).toBe(true);
  });

  test('an immediate Play tap queues playback at the end of a touch seek', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 650 });
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await page.evaluate(() => {
      window.__game.scene.paused = true;
    });
    const range = page.getByRole('slider', { name: 'Replay position' });
    const box = (await range.boundingBox())!;
    await page.touchscreen.tap(box.x + 0.9 * box.width, box.y + box.height / 2);
    await expect(page.locator('.replay-status')).toContainText('Seeking');
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await expect(page.locator('.replay-status')).toContainText('then playing');
    await page.setViewportSize({ width: 568, height: 320 });
    await page.evaluate(() => {
      window.__game.scene.paused = false;
    });
    await expect(page.locator('.replay-status')).toContainText('Watching replay');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  });
});

test('a restored recording remains watchable after overlapping browser saves', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(async () => {
    const { loadSave, saveGame } = await import('/src/game/save.ts');
    const { model } = window.__game;
    const state = structuredClone(model.state);
    await saveGame(state);
    await Promise.all([saveGame({ ...state, raidLog: [] }), saveGame(state)]);
    const loaded = await loadSave();
    if (!loaded) throw Error('The saved village could not be read');
    model.state = loaded;
    model.changed();
  });
  await page.getByRole('button', { name: 'Watch replay' }).click();
  await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
});

test.describe('replay navigation with touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('resizing during a scrub discards the old position and allows a new seek', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
    await page.getByRole('button', { name: 'Watch replay' }).tap();
    const pause = page.getByRole('button', { name: 'Pause', exact: true });
    if (await pause.isVisible()) await pause.tap();
    const range = page.getByRole('slider', { name: 'Replay position' });
    await range.focus();
    await range.press('Home');
    const time = () => page.evaluate(() => window.__game.model.replay!.time);
    await expect.poll(time).toBe(0);

    const cdp = await page.context().newCDPSession(page);
    const old = (await range.boundingBox())!;
    const touch = (type: string, x?: number, y?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined ? [] : [{ x, y, id: 1 }],
      });
    await touch('touchStart', old.x + 8, old.y + old.height / 2);
    await touch('touchMove', old.x + old.width * 0.6, old.y + old.height / 2);
    await expect.poll(async () => Number(await range.inputValue())).toBeGreaterThan(10);
    expect(await time()).toBe(0);
    expect(await page.evaluate(() => window.__game.model.replay!.seekTarget)).toBe(0);
    await page.evaluate(() => {
      window.addEventListener(
        'resize',
        () => {
          document.body.dataset.replayResized = 'true';
        },
        { once: true },
      );
    });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('body')).toHaveAttribute('data-replay-resized', 'true');
    await touch('touchEnd');
    await expect.poll(async () => Number(await range.inputValue())).toBe(0);
    expect(await time()).toBe(0);

    const current = (await range.boundingBox())!;
    await page.touchscreen.tap(current.x + current.width * 0.5, current.y + current.height / 2);
    await expect.poll(time).toBeGreaterThan(10);
    await page.getByRole('button', { name: 'Back to log' }).tap();
    await expect(page.getByRole('button', { name: 'Watch replay' })).toBeVisible();
  });
});

test.describe('phone replay history navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('returning from playback restores the record in a scrolled Battle Log', async ({ page }) => {
    await page.evaluate(() => {
      const m = window.__game.model;
      for (let i = 0; i < 3; i++) {
        m.startBattle(0, true);
        m.activeTroop = 'giant';
        if (!m.deploy(1.2, 13)) throw Error('Practice fixture deployment refused');
        m.step(0.05);
        m.finishBattle();
        m.returnHome();
      }
    });
    const log = page.locator('.battle-log-body');
    await expect(log.locator('.raid-record')).toHaveCount(4);
    const watch = log.locator('.raid-record').last().getByRole('button', { name: 'Watch replay' });
    await watch.scrollIntoViewIfNeeded();
    const scroll = await log.evaluate((el) => el.scrollTop);
    expect(scroll).toBeGreaterThan(0);
    await watch.tap();
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to log' }).tap();
    await expect(log).toBeVisible();
    expect(await log.evaluate((el) => el.scrollTop)).toBeCloseTo(scroll, 0);
    await expect(watch).toBeFocused();
    await expect(log.locator('.raid-record')).toHaveCount(4);
  });

  test('returning after rotation keeps the focused replay control on screen', async ({ page }) => {
    await page.evaluate(() => {
      const model = window.__game.model;
      for (let i = 0; i < 6; i++) {
        model.startBattle(0, true);
        model.activeTroop = 'giant';
        if (!model.deploy(1.2, 13)) throw Error('Practice fixture deployment refused');
        model.step(0.05);
        model.finishBattle();
        model.returnHome();
      }
    });
    const log = page.locator('.battle-log-body');
    const watch = log.getByRole('button', { name: 'Watch replay', exact: true }).last();
    await watch.evaluate((control) => {
      const body = control.closest<HTMLElement>('.battle-log-body')!;
      body.scrollTop +=
        control.getBoundingClientRect().top -
        body.getBoundingClientRect().top -
        (body.clientHeight - 65);
    });
    await expect(watch).toBeInViewport({ ratio: 1 });
    await watch.tap();
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
    await page.setViewportSize({ width: 568, height: 320 });
    await page.getByRole('button', { name: 'Back to log' }).tap();
    await expect(watch).toBeFocused();
    await expect(watch).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Tab');
    await expect(watch.locator('..').getByRole('button', { name: 'Export replay' })).toBeFocused();
  });
});
