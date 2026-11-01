import { expect, test, type Page } from '@playwright/test';

const originalCode = 'h2m1i1x0d1x1u4x0';
async function openArmies(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    window.__game.game.loop.sleep();
    const model = window.__game.model;
    model.clearArmy();
    model.train('swordsman', 3);
  });
  await page.locator('.train-add').click();
  await page.locator('[data-action="army-presets"]').click();
}

for (const [width, height] of [
  [390, 844],
  [844, 390],
  [1440, 960],
]) {
  test(`original-game army links preview excluded Castle and Warden settings before use at ${width}`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await openArmies(page);
    const progress = await page.evaluate(() => {
      const s = window.__game.model.state;
      return JSON.stringify({
        levels: s.troopLevels,
        gold: s.gold,
        elixir: s.elixir,
        dark: s.dark,
        gems: s.gems,
        heroes: s.heroes,
        king: s.king,
      });
    });
    await page
      .locator('#army-code')
      .fill(`https://link.clashofclans.com/en?action=CopyArmy&army=${originalCode}`);
    await expect(page.locator('.army-import-preview h4')).toHaveText('Shared Clash army');
    await expect(page.locator('.army-import-notes')).toContainText(
      'Clan Castle troops and spells are not used here',
    );
    await expect(page.locator('.army-import-notes')).toContainText('ground/air mode');
    await expect(page.locator('.army-import-preview')).toContainText(
      '4 troop spaces · 0 spell spaces',
    );
    await expect(page.locator('.army-import-preview')).toContainText(
      'Grand Warden is not in this village',
    );
    expect(await page.evaluate(() => window.__game.model.state.army.swordsman)).toBe(3);
    const use = page.locator('[data-action="army-import"]');
    await expect(use).toBeEnabled();
    await page.locator('.army-import').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `output/playtest/native-army-code-${width}-${browserName}.png`,
      animations: 'disabled',
    });
    expect(
      await page.locator('.modal-body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    expect((await use.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await use.click();
    expect(await page.evaluate(() => window.__game.model.state.army.swordsman)).toBe(4);
    expect(
      await page.evaluate(() => {
        const s = window.__game.model.state;
        return JSON.stringify({
          levels: s.troopLevels,
          gold: s.gold,
          elixir: s.elixir,
          dark: s.dark,
          gems: s.gems,
          heroes: s.heroes,
          king: s.king,
        });
      }),
    ).toBe(progress);
    await expect(page.locator('#toast')).toContainText('Clan Castle');
    expect(errors).toEqual([]);
  });
}

test('unsupported original-game entries leave the draft army intact and the field usable', async ({
  page,
}) => {
  await openArmies(page);
  await page
    .locator('#army-code')
    .fill('https://link.clashofclans.com/?action=CopyArmy&army=u1x999999');
  await expect(page.locator('.army-import-preview')).toContainText('damaged or unsupported');
  await expect(page.locator('[data-action="army-import"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.model.state.army.swordsman)).toBe(3);
  await page.locator('#army-code').fill('u4x0');
  await expect(page.locator('[data-action="army-import"]')).toBeEnabled();
  await page.locator('[data-action="army-import"]').click();
  expect(await page.evaluate(() => window.__game.model.state.army.swordsman)).toBe(4);
});

test('an original code received in the application URL opens once as a preview', async ({
  page,
}) => {
  await openArmies(page);
  const url = new URL(page.url());
  url.hash = `army=${originalCode}`;
  await page.goto('about:blank');
  await page.goto(url.href);
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.evaluate(() => window.__game.game.loop.sleep());
  await expect(page.locator('#modal-title')).toHaveText('Quick armies');
  await expect(page.locator('.army-import-notes')).toContainText('Clan Castle');
  expect(new URL(page.url()).hash).toBe('');
  expect(await page.evaluate(() => window.__game.model.state.army.swordsman)).toBe(3);
});

test('a query army link is consumed once while other application flags are kept', async ({
  page,
}) => {
  await openArmies(page);
  const url = new URL(page.url());
  url.searchParams.set('army', originalCode);
  url.hash = '';
  await page.goto(url.href);
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.evaluate(() => window.__game.game.loop.sleep());
  await expect(page.locator('.army-import-preview h4')).toHaveText('Shared Clash army');
  expect(new URL(page.url()).searchParams.has('army')).toBe(false);
  expect(new URL(page.url()).searchParams.has('lazyart')).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.evaluate(() => window.__game.game.loop.sleep());
  await expect(page.locator('#modal-title')).toHaveCount(0);
});
