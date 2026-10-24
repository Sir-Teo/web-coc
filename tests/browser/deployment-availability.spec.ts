import { expect, test, type Page } from '@playwright/test';

async function stage(
  page: Page,
  army: Record<string, number>,
  spells: Record<string, number> = {},
  hero = false,
) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(
    async ({ army, spells, hero }) => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
      const { model, scene } = window.__game;
      scene.paused = true;
      model.state.obstacles = [];
      model.state.buildings = [
        makeBuilding(1, 'townhall', 36, 36, 18),
        ...(hero ? [makeBuilding(2, 'herohall', 36, 30, 1)] : []),
      ];
      model.state.army = { ...emptyArmy(), ...army };
      model.state.spells = { ...emptySpells(), ...spells };
      model.state.king = hero ? { level: 1 } : undefined;
      model.state.heroLineup = hero ? ['king'] : [];
      model.state.nextId = 100;
      model.startBattle(0, true);
      model.changed();
      scene.sync();
    },
    { army, spells, hero },
  );
}

test('selected troop and spell hints follow actual stock without replacing their cards', async ({
  page,
  browserName,
}) => {
  await stage(page, { giant: 2 }, { heal: 2, rage: 1 }, true);
  const hint = page.locator('.deploy-label');
  const giant = page.locator('[data-action="troop:giant"]');
  await giant.click();
  await expect(hint).toContainText('Tap, hold or drag to deploy');
  expect(await page.evaluate(() => window.__game.model.deploy(8, 8))).toBe(true);
  await expect(giant.locator('.troop-count')).toHaveText('x1');
  await page.evaluate(() => {
    window.__deploymentCard = document.querySelector('[data-action="troop:giant"]');
  });
  expect(await page.evaluate(() => window.__game.model.deploy(9, 8))).toBe(true);
  await expect(hint).toHaveText('Giant · All deployed');
  await expect(giant).toBeDisabled();
  expect(
    await page.evaluate(
      () => window.__deploymentCard === document.querySelector('[data-action="troop:giant"]'),
    ),
  ).toBe(true);
  const heal = page.locator('[data-action="spell:heal"]');
  await heal.click();
  await expect(hint).toContainText('Tap anywhere to cast');
  expect(await page.evaluate(() => window.__game.model.castSpell(8, 8))).toBe(true);
  await expect(heal.locator('.troop-count')).toHaveText('x1');
  await page.evaluate(() => {
    window.__deploymentCard = document.querySelector('[data-action="spell:heal"]');
  });
  expect(await page.evaluate(() => window.__game.model.castSpell(8, 8))).toBe(true);
  await expect(hint).toContainText('Tap anywhere to cast Rage');
  await expect(heal).toBeDisabled();
  expect(
    await page.evaluate(
      () => window.__deploymentCard === document.querySelector('[data-action="spell:heal"]'),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.__game.model.activeSpell)).toBe('rage');
  expect(await page.evaluate(() => window.__game.model.castSpell(8, 8))).toBe(true);
  await expect(hint).toHaveText('Giant · All deployed');
  expect(await page.evaluate(() => window.__game.model.activeSpell)).toBe(null);
  expect(await page.evaluate(() => window.__game.model.castSpell(8, 8))).toBe(false);
  await page.screenshot({ path: `output/playtest/deployment-exhausted-${browserName}.png` });
  await page.locator('[data-action="hero-select:king"]').click();
  await expect(hint).toContainText('Barbarian King · Tap outside the red boundary to deploy');
});

test('unused siege reserves stay disabled after one machine deploys, across fast and full HUD refreshes', async ({
  page,
  browserName,
}) => {
  await stage(page, { giant: 1, wallwrecker: 2, battleblimp: 1 });
  await page.locator('[data-action="troop:giant"]').click();
  expect(await page.evaluate(() => window.__game.model.deploy(8, 8))).toBe(true);
  const wrecker = page.locator('[data-action="troop:wallwrecker"]');
  const blimp = page.locator('[data-action="troop:battleblimp"]');
  await expect(blimp).toBeEnabled();
  await wrecker.click();
  expect(await page.evaluate(() => window.__game.model.deploy(10, 8))).toBe(true);
  for (let refresh = 0; refresh < 2; refresh++) {
    if (refresh) await page.evaluate(() => window.__game.model.changed());
    await expect(wrecker).toBeDisabled();
    await expect(blimp).toBeDisabled();
    await expect(wrecker.locator('.troop-count')).toHaveText('x1');
    await expect(blimp.locator('.troop-count')).toHaveText('x1');
    await expect(wrecker).toHaveClass(/empty/);
    await expect(blimp).toHaveAttribute('aria-label', /siege machine already deployed/);
    await expect(blimp).toHaveAttribute('aria-label', /1 in reserve/);
    await expect(page.locator('.deploy-label')).toContainText('Only one siege machine per attack');
  }
  expect(await page.evaluate(() => window.__game.model.deploy(12, 8))).toBe(false);
  expect(await page.evaluate(() => window.__game.model.battle.remaining.wallwrecker)).toBe(1);
  await page.screenshot({ path: `output/playtest/deployment-siege-reserves-${browserName}.png` });
});

test('a hero-only army starts with a selection hint instead of an absent troop', async ({
  page,
  browserName,
}) => {
  await stage(page, {}, {}, true);
  await expect(page.locator('.deploy-label')).toHaveText('Select a troop, hero or spell');
  await page.screenshot({ path: `output/playtest/deployment-hero-only-${browserName}.png` });
  await page.locator('[data-action="hero-select:king"]').click();
  await expect(page.locator('.deploy-label')).toContainText(
    'Barbarian King · Tap outside the red boundary to deploy',
  );
});
