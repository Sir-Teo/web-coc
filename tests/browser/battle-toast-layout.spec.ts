import { expect, test, type Page } from '@playwright/test';

const sizes = [
  [1440, 960],
  [390, 844],
  [320, 568],
  [844, 390],
  [568, 320],
  [320, 480],
];

async function report(page: Page) {
  return page.evaluate(() => {
    const toast = document.querySelector('#toast').getBoundingClientRect();
    const box = (rect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    });
    const overlap = [
      ...document.querySelectorAll(
        '.battle-enemy,.battle-clock,.destruction,.prep-banner,.practice-guide,.battle-bottom > button,.deploy-tray,.replay-controls',
      ),
    ].flatMap((element) => {
      const r = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!r.width || !r.height || style.display === 'none' || style.visibility === 'hidden')
        return [];
      return toast.left < r.right &&
        toast.right > r.left &&
        toast.top < r.bottom &&
        toast.bottom > r.top
        ? [{ class: element.className, box: box(r) }]
        : [];
    });
    return {
      toast: box(toast),
      overlap,
      fits:
        toast.left >= 0 &&
        toast.top >= 0 &&
        toast.right <= innerWidth &&
        toast.bottom <= innerHeight,
    };
  });
}

test('battle notifications stay clear of the countdown, scout guide and controls', async ({
  page,
  browserName,
}) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.paused = true;
    model.startBattle(0, true);
    model.changed();
  });
  const failures = [];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const started of [false, true]) {
      await page.evaluate((started) => {
        const model = window.__game.model;
        model.battle.started = started;
        model.changed();
        model.notify('X-Bow · Level 4 · Range 11.5 tiles · Ground & air · 1,500 bolts');
      }, started);
      // HUD content and placement each settle on the next animation frame.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(page.locator('#toast')).toHaveCSS('opacity', '1');
      await page
        .locator('#toast')
        .evaluate((element) =>
          Promise.allSettled(element.getAnimations().map((animation) => animation.finished)),
        );
      const result = await report(page);
      if (result.overlap.length || !result.fits)
        failures.push({ width, height, started, ...result });
      if (width === 390)
        await page.screenshot({
          path: `output/playtest/battle-toast-${started ? 'live' : 'scout'}-${browserName}.png`,
        });
    }
  }
  if (failures.length) console.log('TOAST_LAYOUT_FAILURES', JSON.stringify(failures));
  expect(failures).toEqual([]);
});

test('a visible battle notification follows resize, safe insets and returning home', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.paused = true;
    model.startBattle(0, true);
    model.changed();
    document.querySelector<HTMLElement>('#safe-probe').style.padding = '24px 22px 16px 18px';
    window.dispatchEvent(new Event('resize'));
    model.notify('X-Bow · Level 4 · Range 11.5 tiles · Ground & air · 1,500 bolts');
  });
  await expect(page.locator('#toast')).toHaveCSS('opacity', '1');
  for (const [width, height] of [
    [390, 844],
    [568, 320],
    [1440, 960],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(async () => {
        const result = await report(page);
        return (
          result.overlap.length === 0 &&
          result.toast.left >= 26 &&
          result.toast.top >= 32 &&
          result.toast.right <= width - 30 &&
          result.toast.bottom <= height - 24
        );
      })
      .toBe(true);
    await expect(page.locator('#toast')).toHaveClass('show');
  }
  await page.evaluate(() => {
    const model = window.__game.model;
    model.returnHome();
    model.changed();
    model.notify('Village notification');
  });
  await expect(page.locator('#toast')).not.toHaveAttribute('data-battle-anchor');
  await expect(page.locator('#toast')).toHaveCSS('top', '116px');
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
});

test('battle messages keep the Practice guide and its Skip button accessible', async ({ page }) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.paused = true;
    model.townhall.level = 7;
    model.startCampaign(94);
    model.changed();
  });
  await expect(page.locator('.practice-guide')).toContainText('Deploy Barbarian King');
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [667, 375],
    [568, 320],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() =>
      window.__game.model.notify('X-Bow · Level 4 · Range 11.5 tiles · Ground & air · 1,500 bolts'),
    );
    await expect
      .poll(async () => {
        const result = await report(page);
        return result.fits && result.overlap.length === 0;
      })
      .toBe(true);
    await expect(page.getByRole('button', { name: 'Skip guide', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Skip guide', exact: true }).click();
  await expect(page.locator('.practice-guide')).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
});

test('replay notifications stay clear of playback controls after rotation', async ({ page }) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.paused = true;
    model.startBattle(0, true);
    model.deploy(1, 1);
    for (let i = 0; i < 20; i++) model.step(0.05);
    model.finishBattle();
    const data = model.state.raidLog[0].replay;
    model.returnHome();
    if (!model.openReplay(data)) throw Error('Could not open the recording');
    model.changed();
  });
  await expect(page.locator('.replay-controls')).toBeVisible();
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [568, 320],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() =>
      window.__game.model.notify('Replay opened. Your village is unchanged.'),
    );
    await expect
      .poll(async () => {
        const result = await report(page);
        return result.fits && result.overlap.length === 0;
      })
      .toBe(true);
    await expect(page.locator('[data-action="replay-restart"]')).toBeVisible();
  }
  await page.locator('[data-action="replay-restart"]').click();
  await expect(page.locator('.replay-controls')).toBeVisible();
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
});
