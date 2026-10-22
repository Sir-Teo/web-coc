import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
});

test('a click that does not move browser focus still returns to the actual dialog opener', async ({
  page,
}) => {
  await page.locator('[data-action="shop"]').last().focus();
  // WebKit mouse activation can leave focus elsewhere; reproduce that explicitly
  // in every engine rather than relying on platform-specific click defaults.
  await page.evaluate(() =>
    document.querySelector<HTMLButtonElement>('[data-action="settings"]')!.click(),
  );
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('switch', { name: 'Sound effects' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-action="settings"]')).toBeFocused();
});

test('pointer opening, switch rerenders and the close button preserve the Settings opener', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="settings"]').click();
  await page.getByRole('switch', { name: 'Reduced motion' }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('[data-action="settings"]')).toBeFocused();
});

test('keyboard activation and focus trapping return to the launching control', async ({ page }) => {
  await page.locator('[data-action="settings"]').focus();
  await page.keyboard.press('Enter');
  const close = page.getByRole('button', { name: 'Close dialog', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(
    true,
  );
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="settings"]')).toBeFocused();
});

test('an empty campaign filter keeps both pickers in the dialog tab order', async ({ page }) => {
  await page.locator('.attack-btn').click();
  await page.locator('#campaign-filter').selectOption('done');
  await expect(page.locator('.campaign-card')).toHaveCount(0);
  const section = page.locator('#campaign-section');
  const close = page.getByRole('button', { name: 'Close dialog', exact: true });
  await section.focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(section).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#campaign-filter')).toBeFocused();
});

test('campaign pickers stay mounted while filtering and jumping to a section', async ({ page }) => {
  await page.locator('.attack-btn').click();
  const filter = page.locator('#campaign-filter');
  const section = page.locator('#campaign-section');
  await page
    .locator('.campaign-nav select')
    .evaluateAll((elements) =>
      elements.forEach((element) => element.setAttribute('data-retained-picker', 'yes')),
    );
  await filter.focus();
  await page.keyboard.press('ArrowDown');
  await expect(filter).toHaveValue('open');
  await expect(filter).toBeFocused();
  await expect(page.locator('.campaign-nav [data-retained-picker="yes"]')).toHaveCount(2);
  await filter.selectOption('done');
  await expect(page.locator('.campaign-card')).toHaveCount(0);
  await section.focus();
  await page.keyboard.press('ArrowDown');
  await expect(filter).toHaveValue('all');
  await expect(page.locator('.campaign-card').first()).toBeVisible();
  await expect(page.locator('.campaign-nav [data-retained-picker="yes"]')).toHaveCount(2);
  await expect(page.locator('[data-action="attack:0"]')).toBeFocused();
  // A subsequent model refresh updates the summary and cards without replacing the pickers.
  await page.evaluate(async () => {
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const m = window.__game.model;
    m.state.nativeCampaign ??= freshNativeCampaign();
    m.state.nativeCampaign.stars[0] = 3;
    m.changed();
  });
  await expect(page.locator('#campaign-stage-0 .campaign-stars')).toHaveText('★★★');
  await expect(page.locator('.campaign-nav [data-retained-picker="yes"]')).toHaveCount(2);
});

test('Army pickers keep their keyboard input while the map cursor is on', async ({ page }) => {
  await page.keyboard.press('m');
  const cursor = await page.evaluate(() => window.__game.scene.keyCursor);
  expect(cursor).not.toBeNull();
  await page.locator('.train-add').click();
  const family = page.locator('#army-family');
  await family.focus();
  await page.keyboard.press('ArrowDown');
  await expect(family).toHaveValue('elixir');
  expect(await page.evaluate(() => window.__game.scene.keyCursor)).toEqual(cursor);
  await page.keyboard.press('m');
  expect(await page.evaluate(() => window.__game.scene.keyCursor)).toEqual(cursor);
  await expect(family).toBeFocused();
});

test('Army filters stay mounted through filtering, an empty search and clearing filters', async ({
  page,
}) => {
  await page.locator('.train-add').click();
  const fields = page.locator('.army-filters input, .army-filters select');
  await fields.evaluateAll((elements) =>
    elements.forEach((element) => element.setAttribute('data-retained-filter', 'yes')),
  );
  const retained = () =>
    expect(page.locator('.army-filters [data-retained-filter="yes"]')).toHaveCount(3);
  await page.locator('#army-family').selectOption('spells');
  await retained();
  const search = page.locator('#army-search');
  await search.fill('no matching army');
  await expect(page.locator('.army-empty')).toBeVisible();
  await expect(search).toBeFocused();
  await retained();
  await page.locator('[data-action="army-filter-clear"]').click();
  await expect(search).toHaveValue('');
  await expect(page.locator('#army-show')).toHaveValue('all');
  await expect(page.locator('#army-family')).toHaveValue('all');
  await expect(page.locator('.army-empty')).toHaveCount(0);
  await retained();
  const housing = await page.evaluate(
    () => window.__game.model.armySize + window.__game.model.queuedSize,
  );
  await page.locator('[data-action="train:swordsman"]').click();
  await retained();
  await expect(page.locator('[data-action="army-jump:troops"]')).toContainText(`${housing + 1}/`);
});

for (const cursorOn of [false, true])
  test(`battle results own map keys with the map cursor ${cursorOn ? 'on' : 'off'}`, async ({
    page,
  }) => {
    await page.evaluate(async () => {
      const { emptyArmy } = await import('/src/game/army.ts');
      const { model } = window.__game;
      model.state.army = { ...emptyArmy(), swordsman: 5 };
      model.startCampaign(0);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await page.evaluate((on) => {
      const { model, scene } = window.__game;
      scene.toggleKeyCursor(on);
      model.finishBattle();
    }, cursorOn);
    const dialog = page.getByRole('dialog');
    await expect(page.locator('#result-title')).toBeVisible();
    const snapshot = () =>
      page.evaluate(() => {
        const { scene } = window.__game;
        const camera = scene.cameras.main;
        return { cursor: scene.keyCursor, zoom: camera.zoom, x: camera.scrollX, y: camera.scrollY };
      });
    const before = await snapshot();
    expect(!!before.cursor).toBe(cursorOn);
    for (const key of ['=', 'm', 'ArrowRight', 'Escape']) await page.keyboard.press(key);
    expect(await snapshot()).toEqual(before);
    await expect(page.locator('#result-title')).toBeVisible();
    const controls = dialog.getByRole('button');
    await controls.last().focus();
    await page.keyboard.press('Tab');
    await expect(controls.first()).toBeFocused();
    const home = dialog.getByRole('button', { name: 'Return to village', exact: true });
    await home.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => window.__game.model.battle)).toBeNull();
    const homeCursor = await page.evaluate(() => !!window.__game.scene.keyCursor);
    await page.keyboard.press('m');
    expect(await page.evaluate(() => !!window.__game.scene.keyCursor)).toBe(!homeCursor);
  });

test('enabling the map cursor moves focus from battle controls so Enter and Space deploy', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const { model } = window.__game;
    model.state.army = { ...emptyArmy(), swordsman: 5 };
    model.startCampaign(0);
  });
  await page.waitForFunction(() => window.__game.scene.artSettled);
  await page.locator('[data-action="battle-speed"]').focus();
  await page.keyboard.press('m');
  await expect(page.locator('#game')).toBeFocused();
  for (let i = 0; i < 40; i++) {
    const open = await page.evaluate(() => {
      const { scene, model } = window.__game;
      return !model.deployBlocked(scene.keyCursor.x + 0.5, scene.keyCursor.y + 0.5);
    });
    if (open) break;
    await page.keyboard.press(i % 2 ? 'ArrowUp' : 'ArrowLeft');
  }
  await expect(page.locator('#map-announcer')).toContainText('open ground');
  for (const [key, remaining] of [
    ['Enter', 4],
    ['Space', 3],
  ] as const) {
    await page.keyboard.press(key);
    await expect
      .poll(() => page.evaluate(() => window.__game.model.battle.remaining.swordsman))
      .toBe(remaining);
  }
  expect(await page.evaluate(() => window.__game.model.battleSpeed)).toBe(1);
});

test('building Info returns focus to its recreated context button without losing selection', async ({
  page,
}) => {
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    m.selected = m.state.buildings.find((b) => b.kind === 'cannon')!.id;
    m.changed();
    return m.selected;
  });
  const info = page.locator('.building-context [data-action="info"]');
  await expect(info).toBeVisible();
  await page.locator('[data-action="settings"]').focus();
  await info.evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(info).toBeFocused();
  expect(await page.evaluate(() => window.__game.model.selected)).toBe(id);
});

test('nested Army dialogs return to the same card, scroll position and keyboard focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.train-add').click();
  const about = page.getByRole('button', { name: 'About Rage Spell', exact: true });
  await about.scrollIntoViewIfNeeded();
  const scroll = await page.locator('.drawer-body').evaluate((el) => el.scrollLeft);
  expect(scroll).toBeGreaterThan(0);
  await about.click();
  await page.locator('[data-action="research-view:rage"]').click();
  await page.keyboard.press('Escape');
  await expect(about).toBeFocused();
  await expect(about).toBeInViewport({ ratio: 1 });
  expect(await page.locator('.drawer-body').evaluate((el) => el.scrollLeft)).toBeCloseTo(scroll, 0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.drawer-sheet')).toHaveCount(0);
  await page.locator('[data-action="settings"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.drawer-sheet')).toHaveCount(0);
  await expect(page.locator('[data-action="settings"]')).toBeFocused();
});

test('dialog content updates remain fully visible on their first frame while new openings still animate', async ({
  page,
}) => {
  const watchNextPaint = async () =>
    page.evaluate(() => {
      window.__dialogPaint = null;
      const observer = new MutationObserver(() => {
        observer.disconnect();
        requestAnimationFrame(() => {
          const panel = document.querySelector<HTMLElement>('.modal')!;
          const backdrop = document.querySelector<HTMLElement>('.modal-backdrop')!;
          const style = getComputedStyle(panel);
          window.__dialogPaint = {
            animation: style.animationName,
            opacity: style.opacity,
            transform: style.transform,
            backdropAnimation: getComputedStyle(backdrop).animationName,
            backdropOpacity: getComputedStyle(backdrop).opacity,
          };
        });
      });
      observer.observe(document.querySelector('#modal-root')!, { childList: true });
    });
  await watchNextPaint();
  await page.locator('[data-action="settings"]').click();
  await page.waitForFunction(() => window.__dialogPaint !== null);
  expect(await page.evaluate(() => window.__dialogPaint.animation)).toBe('modal-in');
  await page.locator('.modal').evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished));
  });
  await watchNextPaint();
  await page.getByRole('switch', { name: 'Sound effects' }).click();
  await page.waitForFunction(() => window.__dialogPaint !== null);
  expect(await page.evaluate(() => window.__dialogPaint)).toEqual({
    animation: 'none',
    opacity: '1',
    transform: 'none',
    backdropAnimation: 'none',
    backdropOpacity: '1',
  });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await watchNextPaint();
  await page.locator('[data-action="settings"]').click();
  await page.waitForFunction(() => window.__dialogPaint !== null);
  expect(await page.evaluate(() => window.__dialogPaint.animation)).toBe('modal-in');
});
