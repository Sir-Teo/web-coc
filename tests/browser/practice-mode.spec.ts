import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Giant Smash, the first Practice level: campaign stage 91. */
const GIANT_SMASH = 90;

async function boot(page: Page, townhall: number) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate((townhall) => {
    const m = window.__game.model;
    m.townhall!.level = townhall;
    m.clearArmy();
    m.changed();
  }, townhall);
  await page.locator('[data-action="campaign"]').first().tap();
  await expect(page.locator('#modal-title')).toHaveText('The Goblin Valley');
}

test('a Practice level attacks with its own army and leaves the camps alone', async ({
  page,
  browserName,
}) => {
  await boot(page, 4);
  const card = page.locator(`#campaign-stage-${GIANT_SMASH}`);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.campaign-info > span')).toHaveText('PRACTICE');
  await expect(card).toContainText('Fought with its own army: 26 troops. Yours stays home.');
  // Its scout page lists the army it brings.
  await card.locator(`[data-action="campaign-scout:${GIANT_SMASH}"]`).tap();
  await expect(page.locator('.campaign-scout')).toContainText('Army provided');
  await expect(page.locator('.campaign-scout .composition span')).toHaveCount(3);
  await page.screenshot({ path: `output/playtest/practice-scout-390-${browserName}.png` });
  // No army is trained, yet the attack starts.
  await page.locator(`.campaign-scout [data-action="attack:${GIANT_SMASH}"]`).tap();
  await expect.poll(() => page.evaluate(() => !!window.__game.model.battle)).toBe(true);
  const tray = await page.evaluate(() => {
    const b = window.__game.model.battle!;
    return {
      fixed: b.fixedArmy,
      army: Object.fromEntries(Object.entries(b.remaining).filter(([, n]) => n)),
    };
  });
  expect(tray).toEqual({ fixed: true, army: { giant: 13, wallbreaker: 2, goblin: 11 } });
  await expect(page.locator('[data-action="troop:giant"]')).toBeVisible();
  await page.screenshot({ path: `output/playtest/practice-battle-390-${browserName}.png` });
  // Deploying spends the level's Giants, not the village's.
  const spent = await page.evaluate(() => {
    const m = window.__game.model;
    m.deploy(1, 1);
    return { left: m.battle!.remaining.giant, home: m.state.army.giant };
  });
  expect(spent).toEqual({ left: 12, home: 0 });
});

test('below its Town Hall a Practice level is locked and says when it opens', async ({ page }) => {
  await boot(page, 3);
  const card = page.locator(`#campaign-stage-${GIANT_SMASH}`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText('Opens at Town Hall 4.');
  await expect(card.locator(`[data-action="attack:${GIANT_SMASH}"]`)).toBeDisabled();
});
