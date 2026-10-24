import { expect, test, type Page } from '@playwright/test';

async function stage(page: Page, heroes = false) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  return page.evaluate(async (heroes) => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
    const { SPELL_HOTKEYS } = await import('/src/game/data.ts');
    const { SPELL_ORDER } = await import('/src/ui/army-roster.ts');
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 36, 36, 18),
      ...(heroes ? [makeBuilding(2, 'herohall', 30, 36, 8)] : []),
    ];
    m.state.army = { ...emptyArmy(), giant: 1 };
    m.state.spells = {
      ...emptySpells(),
      ...Object.fromEntries(SPELL_ORDER.map((kind) => [kind, 1])),
    };
    m.state.king = heroes ? { level: 1 } : undefined;
    m.state.heroes = heroes ? { queen: { level: 1 } } : {};
    m.state.heroLineup = heroes ? ['king', 'queen'] : [];
    m.state.nextId = 100;
    m.startBattle(0, true);
    m.battle.started = true;
    m.changed();
    scene.sync();
    return SPELL_HOTKEYS.map((key, index) => ({ key, kind: SPELL_ORDER[index] }));
  }, heroes);
}

test('spell shortcuts accept uppercase letters and keep toggle and dialog behavior', async ({
  page,
}) => {
  test.setTimeout(120000);
  const bindings = await stage(page);
  await expect(page.locator('.battle-tip')).toContainText('1–7, Q, E, Z');
  const active = () => page.evaluate(() => window.__game.model.activeSpell);
  for (const { key, kind } of bindings) {
    const shortcut = /^[a-z]$/.test(key) ? `Shift+${key.toUpperCase()}` : key;
    const letter = /^[a-z]$/.test(key);
    if (letter) await page.keyboard.down('Shift');
    await page.keyboard.down(key.toUpperCase());
    expect(await active(), shortcut).toBe(kind);
    await expect(page.locator(`.deploy-tray [data-action="spell:${kind}"]`)).toHaveClass(
      /\bselected\b/,
    );
    await page.keyboard.down(key.toUpperCase());
    expect(await active(), `${shortcut} held`).toBe(kind);
    await page.keyboard.up(key.toUpperCase());
    if (letter) await page.keyboard.up('Shift');
    await page.keyboard.press(shortcut);
    expect(await active(), `${shortcut} again`).toBe(null);
  }
  const letters = bindings.filter(({ key }) => /^[a-z]$/.test(key));
  await page.keyboard.press(letters[0].key);
  expect(await active()).toBe(letters[0].kind);
  await page.locator('[data-action="surrender"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const beforeDialog = await active();
  await page.keyboard.press(`Shift+${letters[1].key.toUpperCase()}`);
  expect(await active()).toBe(beforeDialog);
  await page.keyboard.press('Escape');
  await page.keyboard.press(letters[1].key);
  expect(await active()).toBe(letters[1].kind);
});

test('holding H neither cycles heroes nor spends an ability after deploying', async ({ page }) => {
  await stage(page, true);
  const active = () => page.evaluate(() => window.__game.model.activeHeroKind);
  const used = () => page.evaluate(() => !!window.__game.model.battleHero('king').abilityUsed);
  await page.keyboard.down('h');
  expect(await active()).toBe('king');
  await page.keyboard.down('h');
  expect(await active()).toBe('king');
  expect(await page.evaluate(() => window.__game.model.deployHero(8, 8))).toBe(true);
  await page.keyboard.down('h');
  expect(await used()).toBe(false);
  await page.keyboard.up('h');
  await page.keyboard.press('h');
  expect(await used()).toBe(true);
  await page.keyboard.press('h');
  expect(await active()).toBe('queen');
  expect(await page.evaluate(() => !!window.__game.model.battleHero('queen').abilityUsed)).toBe(
    false,
  );
});
