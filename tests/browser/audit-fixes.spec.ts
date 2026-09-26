import { test, expect } from '@playwright/test';

// Regressions for the 2026-09 HUD audit: each check drives the real HUD rather than the model.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.evaluate(() => {
    window.__game.audio?.enabled && (window.__game.audio.enabled = false);
  });
});

test('collector info shows the simulated production and capacity', async ({ page }) => {
  await page.evaluate(() => {
    const { model, hud } = window.__game;
    const mine = model.state.buildings.find((b) => b.kind === 'goldmine');
    mine.level = 2;
    model.selected = mine.id;
    hud.show('info');
  });
  const row = (label: string) =>
    page.locator('.info-table tr', { hasText: label }).locator('td').nth(1);
  await expect(row('Holds')).toHaveText('2,000');
  await expect(row('Production')).toHaveText('400 / hour');
});

test('an import that cannot be saved says so instead of reporting success', async ({ page }) => {
  const backup = await page.evaluate(() => {
    const state = structuredClone(window.__game.model.state);
    state.gold = 4321;
    return JSON.stringify(state);
  });
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await page.locator('#import-file').setInputFiles({
    name: 'village.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await expect(page.locator('#toast')).toContainText('session only');
  await expect(page.locator('#toast')).not.toContainText('successfully');
  await expect(page.locator('#save-state')).toContainText('Saving is unavailable');
  expect(await page.evaluate(() => window.__game.model.state.gold)).toBe(4321);
});

test('the Star Bonus becomes collectable when its cooldown ends with the panel open', async ({
  page,
}) => {
  await page.evaluate(() => {
    const { model, hud } = window.__game;
    model.state.starBonus = { stars: 5, readyAt: model.clock + 1000 };
    hud.show('achievements');
  });
  const collect = page.locator('.star-bonus [data-action="star-bonus"]');
  await expect(collect).toBeDisabled();
  await expect(page.locator('.star-bonus')).toContainText('Ready in');
  // Only the clock moves: no structural redraw happens.
  await page.evaluate(() => window.__game.model.tick(window.__game.model.clock + 1500));
  await expect(collect).toBeEnabled();
  await expect(page.locator('.star-bonus')).toContainText('Ready to collect');
});

test('an expired super boost locks the troop and offers the boost again', async ({ page }) => {
  await page.evaluate(async () => {
    const { TROOP_KEYS, maxTroopLevel } = await import('/src/game/data.ts');
    const { model } = window.__game;
    model.townhall.level = 11;
    model.state.dark = 100000;
    model.state.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, maxTroopLevel(k)]));
    model.boostSuperTroop('superbarbarian');
  });
  await page.locator('.train-add').click();
  const tile = page.locator('.army-tile', {
    has: page.locator('[data-action="train:superbarbarian"]'),
  });
  await expect(tile.locator('[data-action="train:superbarbarian"]')).toBeEnabled();
  await expect(tile.locator('.boost-left')).toContainText('left');
  await page.evaluate(() => {
    const { model } = window.__game;
    model.tick(model.state.superBoosts.superbarbarian);
  });
  await expect(tile.locator('[data-action="train:superbarbarian"]')).toBeDisabled();
  await expect(tile.locator('[data-action="boost-super:superbarbarian"]')).toBeVisible();
});

test('the achievements star total matches the campaign screen', async ({ page }) => {
  const total = await page.evaluate(async () => {
    const { NATIVE_CAMPAIGN } = await import('/src/game/native-campaign.ts');
    window.__game.hud.show('achievements');
    return NATIVE_CAMPAIGN.length * 3;
  });
  await expect(page.locator('.modal')).toContainText(`/ ${total}`);
  await expect(page.locator('.modal')).not.toContainText('/ 270');
});

test('troop shortcuts never pan the camera', async ({ page }) => {
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const { TROOP_HOTKEYS } = await import('/src/game/data.ts');
    const m = window.__game.model;
    m.state.army = { ...emptyArmy(), swordsman: 5 };
    m.startCampaign(0);
    window.__keys = TROOP_HOTKEYS;
  });
  const keys: string[] = await page.evaluate(() => window.__keys);
  const camera = () =>
    page.evaluate(() => {
      const c = window.__game.scene.cameras.main;
      return [Math.round(c.scrollX), Math.round(c.scrollY)];
    });
  await page.mouse.click(5, 5);
  const before = await camera();
  for (const key of keys) {
    await page.keyboard.down(key);
    await page.waitForTimeout(150);
    await page.keyboard.up(key);
  }
  expect(await camera()).toEqual(before);
});

test('the system reduced-motion preference reaches the canvas, with an explicit override', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await page.evaluate(() => window.__game.model.reducedMotion)).toBe(true);
  await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  // The saved switch is untouched: the preference belongs to the device.
  expect(await page.evaluate(() => window.__game.model.state.settings.reducedMotion)).toBe(false);
  await page.evaluate(() => window.__game.hud.show('settings'));
  const toggle = page.locator('[data-action="motion"]');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(page.locator('[data-action="motion"]')).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => window.__game.model.reducedMotion)).toBe(false);
  await expect(page.locator('html')).toHaveClass(/full-motion/);
  // Following the device again once it stops asking.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => page.evaluate(() => window.__game.model.systemReducedMotion)).toBe(false);
});

test('the Army drawer takes focus when opened and returns it to Train on Escape', async ({
  page,
}) => {
  await page.locator('.train-add').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.drawer-sheet')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest('.drawer-sheet')))
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.drawer-sheet')).toHaveCount(0);
  await expect(page.locator('.train-add')).toBeFocused();
});

test('a siege-only army can be saved as a Quick army', async ({ page }) => {
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const { model, hud } = window.__game;
    model.state.army = { ...emptyArmy(), wallwrecker: 1 };
    model.changed();
    hud.show('army-presets');
  });
  const save = page.locator('[data-action="preset-save:0"]');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('.preset-card').first()).toContainText('1 siege');
  expect(await page.evaluate(() => window.__game.model.state.armyPresets[0].army.wallwrecker)).toBe(
    1,
  );
});

test('hiding the tab mid-raid stores the raid settled, and the raid continues', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const m = window.__game.model;
    m.state.army = { ...emptyArmy(), swordsman: 5 };
    m.startCampaign(0);
    m.activeTroop = 'swordsman';
    for (const [x, y] of [
      [2, 2],
      [2, 45],
      [45, 2],
      [45, 45],
    ])
      if (!m.deployBlocked(x, y)) {
        m.deploy(x, y);
        break;
      }
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('crown-clan-save-v1') ?? '{}').raidLog?.length ?? 0,
      ),
    )
    .toBe(1);
  expect(await page.evaluate(() => window.__game.model.battle?.finished)).toBe(false);
});

test('an unreadable save can be restored from a backup on the recovery screen', async ({
  page,
}) => {
  const backup = await page.evaluate(() => {
    const state = structuredClone(window.__game.model.state);
    state.gold = 777;
    return JSON.stringify(state);
  });
  // Both stores hold something that cannot be opened.
  await page.evaluate(async () => {
    localStorage.setItem('crown-clan-save-v1', '{broken');
    await new Promise<void>((resolve) => {
      const request = indexedDB.open('crown-and-clan', 1);
      request.onsuccess = () => {
        const tx = request.result.transaction('saves', 'readwrite');
        tx.objectStore('saves').put({ version: 4, broken: true }, 'village');
        tx.oncomplete = () => resolve();
      };
    });
    // Stop this page from saving its healthy village over them on unload.
    window.addEventListener('pagehide', (e) => e.stopImmediatePropagation(), { capture: true });
    document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), {
      capture: true,
    });
    Storage.prototype.setItem = () => {};
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('blocked for this test', 'InvalidStateError');
    };
  });
  await page.reload();
  await expect(page.locator('.save-recovery-actions')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await page.locator('#recovery-import-file').setInputFiles({
    name: 'village.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await page.evaluate(() => window.__game.model.state.gold)).toBe(777);
  // The damaged copy was kept aside, not overwritten.
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('crown-clan-save-v1-damaged')!).copies,
    ),
  ).toContainEqual({ source: 'backup', text: '{broken' });
});

test('the campaign list fetches map thumbnails only as they scroll into view', async ({ page }) => {
  await page.evaluate(() => window.__game.hud.show('campaign'));
  await expect(page.locator('.campaign-card')).toHaveCount(
    await page.evaluate(
      async () => (await import('/src/game/native-campaign.ts')).NATIVE_CAMPAIGN.length,
    ),
  );
  // Generated SVG thumbnails: a lazy one outside the view is not decoded yet.
  const fetched = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLImageElement>('img.campaign-map')].filter(
          (img) => img.complete && img.naturalWidth > 0,
        ).length,
    );
  await page.waitForTimeout(1500);
  const first = await fetched();
  expect(first).toBeLessThan(40);
  await page.locator('.campaign-card').last().scrollIntoViewIfNeeded();
  await expect.poll(fetched).toBeGreaterThan(first);
});

test('a recording survives reload though the village is saved without it', async ({ page }) => {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.spells.lightning = 1;
    m.startBattle(0, true);
    m.activeSpell = 'lightning';
    m.castSpell(10, 10);
    m.step(0.05);
    m.finishBattle();
    m.returnHome();
  });
  expect(await page.evaluate(() => !!window.__game.model.state.raidLog[0].replay)).toBe(true);
  // The settled raid is saved within a second; the backup copy carries no recording.
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('crown-clan-save-v1')!).raidLog?.length),
    )
    .toBe(1);
  expect(
    await page.evaluate(() => localStorage.getItem('crown-clan-save-v1')!.includes('"steps"')),
  ).toBe(false);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await page.evaluate(() => window.__game.model.state.raidLog[0].replay?.steps.length)).toBe(
    1,
  );
});

test('an idle home village lowers its frame rate until the player acts', async ({ page }) => {
  await page.mouse.move(700, 500);
  await expect
    .poll(() => page.evaluate(() => window.__game.game.loop.fpsLimit), { timeout: 15_000 })
    .toBe(30);
  await page.mouse.move(720, 520);
  await expect.poll(() => page.evaluate(() => window.__game.game.loop.fpsLimit)).toBe(0);
  // A battle never runs capped.
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const m = window.__game.model;
    m.state.army = { ...emptyArmy(), swordsman: 5 };
    m.startCampaign(0);
  });
  await page.waitForTimeout(7000);
  expect(await page.evaluate(() => window.__game.game.loop.fpsLimit)).toBe(0);
});

test('on a phone the Army drawer gives the troop catalog most of its width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.train-add').click();
  const layout = await page.evaluate(() => {
    const width = (s: string) => document.querySelector(s)!.getBoundingClientRect().width;
    const sheet = width('.drawer-sheet');
    const tiles = [...document.querySelectorAll('.army-tile')].filter((tile) => {
      const box = tile.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth;
    }).length;
    return { share: width('.army-actions') / sheet, tiles };
  });
  expect(layout.share).toBeLessThan(0.3);
  expect(layout.tiles).toBeGreaterThanOrEqual(2);
  // Icon-only actions keep their names.
  await expect(page.getByRole('button', { name: 'Quick armies' })).toBeVisible();
});

test('the Army catalog can be searched and filtered by readiness and family', async ({ page }) => {
  await page.locator('.train-add').click();
  const names = () =>
    page
      .locator('.army-tile h3')
      .evaluateAll((els) => els.map((el) => el.firstChild!.textContent!.trim()));
  const all = (await names()).length;
  await page.locator('#army-search').fill('drag');
  await expect.poll(async () => (await names()).every((n) => /drag/i.test(n))).toBe(true);
  expect((await names()).length).toBeGreaterThan(0);
  // Typing keeps the field focused and never pans the camera.
  await expect(page.locator('#army-search')).toBeFocused();
  await page.locator('#army-search').fill('');
  await page.locator('#army-family').selectOption('siege');
  await expect.poll(async () => (await names()).length).toBeLessThan(all);
  expect(
    await page
      .locator('.army-tile [data-action^="train:"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-action'))),
  ).toContain('train:wallwrecker');
  await page.locator('#army-family').selectOption('all');
  await page.locator('#army-show').selectOption('ready');
  const ready = await page.evaluate(() => {
    const m = window.__game.model;
    return (
      Object.values(m.state.army).filter((n) => n > 0).length +
      Object.values(m.state.spells).filter((n) => n > 0).length
    );
  });
  await expect.poll(async () => (await names()).length).toBe(ready);
  await page.locator('#army-search').fill('zzzz');
  await expect(page.locator('.army-empty')).toBeVisible();
  await page.locator('[data-action="army-filter-clear"]').click();
  await expect.poll(async () => (await names()).length).toBe(all);
});
