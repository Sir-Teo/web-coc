import { expect, test } from '@playwright/test';

for (const width of [390, 1440])
  test(`Army names the actual missing requirement at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async () => {
      const { model: m, scene } = window.__game,
        { makeBuilding } = await import('/src/game/model.ts');
      scene.paused = true;
      m.townhall.level = 10;
      m.state.buildings.find((b) => b.kind === 'barracks').level = 6;
      m.state.buildings.push(makeBuilding(m.state.nextId++, 'darkbarracks', 32, 32, 1));
      m.state.troopLevels = { ...m.state.troopLevels, minion: 7 };
      m.state.dark = 100000;
      m.state.superBoosts = {};
      m.clearArmy();
      m.changed();
      scene.sync();
    });
    await page.locator('.train-add').click();
    await page.locator('#army-search').fill('Super Minion');
    const tile = page
        .locator('.army-tile')
        .filter({ has: page.locator('[data-action="troop-info:superminion"]') }),
      train = tile.locator('[data-action="train:superminion"]');
    await expect(train).toBeDisabled();
    await expect(train).toHaveText('TH11 required');
    await expect(train).toHaveAttribute('title', 'Super Minion requires Town Hall 11.');
    await page.evaluate(() => {
      const m = window.__game.model;
      m.townhall.level = 12;
      m.changed();
    });
    await expect(train).toHaveText('Minion level 8');
    await expect(train).toHaveAttribute('title', 'Super Minion requires Minion level 8.');
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.troopLevels.minion = 8;
      m.changed();
    });
    await expect(train).toBeDisabled();
    await expect(train).toHaveText('Boost to train');
    await expect(train).toHaveAttribute(
      'title',
      'Activate the Super Minion boost before training.',
    );
    await tile.locator('[data-action="boost-super:superminion"]').click();
    await expect(train).toBeEnabled();
    await expect(train).toHaveText('+ Add');
    await expect(train).toHaveAttribute('title', 'Hold to keep adding');
    await train.click();
    await expect(tile.locator('[data-army-count="troop:superminion"]')).toHaveText('1');
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.superBoosts.superminion = m.clock + 1000;
      m.tick(m.clock + 1000);
    });
    await expect(train).toBeDisabled();
    await expect(train).toHaveText('Boost to train');
    await expect(tile.locator('.boost-left')).toHaveCount(0);
    await expect(tile.locator('[data-army-count="troop:superminion"]')).toHaveText('1');
    await expect(tile.locator('[data-action="train-fill:superminion"]')).toBeDisabled();
    expect(await train.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({ path: `output/playtest/army-training-issue-${width}.png` });
    await page.locator('#army-search').fill('Wizard');
    const wizard = page
      .locator('.army-tile')
      .filter({ has: page.locator('[data-action="troop-info:wizard"]') })
      .locator('[data-action="train:wizard"]');
    await expect(wizard).toBeDisabled();
    await expect(wizard).toHaveText('Barracks 7');
    await expect(wizard).toHaveAttribute('title', 'Wizard requires a completed level 7 Barracks.');
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.buildings.find((b) => b.kind === 'barracks').level = 7;
      m.changed();
    });
    await expect(wizard).toBeEnabled();
    await expect(wizard).toHaveText('+ Add');
    expect(errors).toEqual([]);
  });
