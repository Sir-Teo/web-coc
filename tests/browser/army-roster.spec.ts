import { test, expect } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

const troops = ['swordsman', 'archer', 'giant', 'goblin', 'wallbreaker', 'balloon', 'wizard'];
const spells = ['lightning', 'heal', 'rage'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('starter trays show prepared units and keep depleted carried cards without selecting absent units', async ({
  page,
}) => {
  await expect(page.locator('.army-tray .troop-card')).toHaveCount(2);
  await page.locator('.attack-btn').click();
  await page.locator('[data-action="attack:0"]').click();
  await expect(page.locator('.army-tray .troop-card')).toHaveCount(2);
  await page.keyboard.press('3');
  expect(await page.evaluate(() => window.__game.model.activeTroop)).toBe('swordsman');
  await page.keyboard.press('8');
  expect(await page.evaluate(() => window.__game.model.activeSpell)).toBeNull();
  await page.evaluate(() => {
    const m = window.__game.model;
    while (m.battle.remaining.swordsman) m.deploy(4, 11);
  });
  await expect(page.locator('[data-action="troop:swordsman"]')).toBeDisabled();
  await expect(page.locator('.army-tray .troop-card')).toHaveCount(2);
  await page.keyboard.press('2');
  await page.keyboard.press('1');
  await expect(page.locator('[data-action="troop:archer"]')).toHaveClass(/selected/);
});

test('catalog jumps and unlock ordering stay usable across phone sizes, with matching battle shortcuts', async ({
  page,
}) => {
  await useDevelopedVillage(page);
  await page.evaluate(() => window.__game.model.brew('lightning'));
  await page.locator('.train-add').click();
  // The full native catalog follows, but the Barracks roster leads in unlock order.
  expect(
    (
      await page
        .locator('[data-action^="train:"]')
        .evaluateAll((cards) => cards.map((c) => c.getAttribute('data-action')!.split(':')[1]))
    ).slice(0, 10),
  ).toEqual([...troops, 'healer', 'dragon', 'pekka']);
  expect(
    (
      await page
        .locator('[data-action^="brew:"]')
        .evaluateAll((cards) => cards.map((c) => c.getAttribute('data-action')!.split(':')[1]))
    ).slice(0, 3),
  ).toEqual(spells);
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('[data-action="army-jump:troops"]')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('[data-action="army-jump:spells"]')).toBeInViewport({ ratio: 1 });
    await page.locator('[data-action="army-jump:spells"]').click();
    await expect(page.locator('[data-action="brew:lightning"]')).toBeInViewport({ ratio: 1 });
    await page.locator('[data-action="army-jump:troops"]').click();
    await expect(page.locator('[data-army-category="troops"]').first()).toBeInViewport({ ratio: 1 });
    await expect(page.locator('[data-action="train:swordsman"]')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('[data-action="train-five:swordsman"]')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('[data-action="remove-troop:swordsman"]')).toBeInViewport({
      ratio: 1,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({
      path: `output/playtest/army-roster-${width}x${height}-${test.info().project.name}.png`,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="army-jump:spells"]').click();
  await expect(page.locator('[data-action="brew:rage"]')).toBeInViewport();
  await page.screenshot({
    path: `output/playtest/army-roster-phone-${test.info().project.name}.png`,
  });
  await page.locator('[data-action="close-drawer"]').click();
  await page.locator('.attack-btn').click();
  await page.locator('[data-action="attack:0"]').click();
  for (const [index, kind] of troops.entries()) {
    await page.keyboard.press(String(index + 1));
    await expect(page.locator(`[data-action="troop:${kind}"]`)).toHaveClass(/selected/);
    await expect(page.locator(`[data-action="troop:${kind}"]`)).toBeInViewport({ ratio: 1 });
    await expect(page.locator(`[data-action="troop:${kind}"] kbd`)).toHaveText(String(index + 1));
  }
  for (const [index, kind] of spells.entries()) {
    const key = ['8', '9', '0'][index];
    await page.keyboard.press(key);
    await expect(page.locator(`[data-action="spell:${kind}"]`)).toHaveClass(/selected/);
    await expect(page.locator(`[data-action="spell:${kind}"]`)).toBeInViewport({ ratio: 1 });
    await expect(page.locator(`[data-action="spell:${kind}"] kbd`)).toHaveText(key);
  }
});

test('locked catalog portraits stay inspectable and legacy prepared spells remain visible', async ({
  page,
}) => {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.spells.rage = 1;
    m.changed();
  });
  await expect(page.locator('.army-tray .spell-card')).toHaveCount(1);
  await page.locator('.train-add').click();
  const wizard = page
    .locator('.army-tile')
    .filter({ has: page.locator('[data-action="train:wizard"]') });
  await expect(wizard).toHaveClass(/army-locked/);
  await expect(wizard.locator('[data-action="train:wizard"]')).toBeDisabled();
  await wizard.locator('[data-action="troop-info:wizard"]').click();
  await expect(page.locator('.troop-stats')).toContainText('Barracks 7');
});
