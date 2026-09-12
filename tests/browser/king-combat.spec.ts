import { test, expect, type Page } from '@playwright/test';

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});
async function fixture(page: Page, townhall = 8, level = 10) {
  await page.evaluate(
    async ({ townhall, level }) => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
      const { model: m, scene } = window.__game;
      m.state.obstacles = [];
      m.state.buildings = [
        makeBuilding(1, 'townhall', 20, 20, townhall),
        makeBuilding(2, 'herohall', 4, 4, townhall === 8 ? 2 : 1),
        makeBuilding(3, 'builder', 30, 30),
      ];
      m.state.nextId = 4;
      m.state.king = { level };
      m.state.army = emptyArmy();
      m.state.spells = emptySpells();
      m.state.dark = 50000;
      m.state.gems = 1000;
      m.changed();
      scene.sync();
    },
    { townhall, level },
  );
}
async function panel(page: Page) {
  await page.locator('.train-add').click();
  await page.locator('[data-action="heroes"]').click();
}
for (const width of [1440, 390, 320])
  test(`King equipped stats and 22-hour level-11 upgrade survive reload at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await fixture(page);
    await panel(page);
    const stats = page.locator('.hero-stat-grid');
    await expect(stats).toContainText('2,114 → 2,159');
    await expect(stats).toContainText('139 → 141');
    await expect(stats).toContainText('166.8 → 169.2');
    for (const text of ['1.2s', '1 tile', '2 tiles/s']) await expect(stats).toContainText(text);
    await expect(page.locator('.hero-equipment')).toContainText('Barbarian Puppet');
    await expect(page.locator('.hero-equipment')).toContainText('Rage Vial');
    await expect(page.locator('.hero-activation')).toContainText('570 hitpoints');
    await expect(page.locator('.hero-upgrade')).toContainText('10,500');
    await expect(page.locator('.hero-upgrade')).toContainText('22h');
    await expect(page.locator('#toast')).not.toHaveClass(/show/);
    await expect(page.locator('.modal')).toHaveCSS('opacity', '1');
    await page.screenshot({ animations: 'disabled', path: `output/playtest/king-panel-${width}-${browserName}.png` });
    await page.locator('[data-action="hero-upgrade"]').scrollIntoViewIfNeeded();
    await page.screenshot({ animations: 'disabled', path: `output/playtest/king-equipment-${width}-${browserName}.png` });
    await page.locator('[data-action="hero-upgrade"]').tap();
    expect(
      await page.evaluate(() => {
        const m = window.__game.model,
          k = m.state.king;
        return [m.state.dark, (k.upgradeEnd - k.upgradeStart) / 1000, m.busy, m.heroReady];
      }),
    ).toEqual([39500, 79200, 1, false]);
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    await panel(page);
    await expect(page.locator('[data-hero-timer]')).toBeVisible();
    await page.locator('[data-action="hero-finish"]').scrollIntoViewIfNeeded();
    await page.locator('[data-action="hero-finish"]').tap();
    await expect(page.locator('.hero-overview')).toContainText('Level 11');
    expect(await page.evaluate(() => window.__game.model.state.dark)).toBe(39500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

test('TH4 King can activate both default items by touch while permanent upgrades stay locked', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, 4, 1);
  await panel(page);
  await expect(page.locator('.hero-scaling')).toContainText('50%');
  await expect(page.locator('.hero-stat-grid')).toContainText('877');
  await expect(page.locator('.hero-stat-grid')).toContainText('59.5');
  await expect(page.locator('.hero-activation')).toContainText('230 hitpoints');
  await expect(page.locator('.hero-upgrade')).toContainText('Hero upgrades unlock at Town Hall 7');
  await expect(page.locator('[data-action="hero-upgrade"]')).toHaveCount(0);
  await page.locator('[data-action="practice"]').scrollIntoViewIfNeeded();
  await page.locator('[data-action="practice"]').tap();
  await page.getByRole('button', { name: 'Barbarian King, Deploy King', exact: true }).tap();
  const p = await page.evaluate(() => {
    const scene = window.__game.scene;
    const p = scene.screenFor(12, 15);
    return p;
  });
  await page.touchscreen.tap(p.x, p.y);
  await page.getByRole('button', { name: 'Barbarian King, Activate ability', exact: true }).tap();
  await expect(
    page.getByRole('button', { name: 'Barbarian King, Ability used', exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() => window.__game.model.battle.units.filter((u) => u.summoned).length),
    )
    .toBe(8);
  expect(
    await page.evaluate(() => window.__game.model.battle.units.find((u) => u.hero).maxHp),
  ).toBe(877);
  await page.screenshot({ path: `output/playtest/king-early-ability-${browserName}.png` });
});

test('Puppet waves and boost colors use battle time, reconstruct on replay seek and clear at home', async ({
  page,
  browserName,
}) => {
  await fixture(page, 7, 1);
  const initial = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.startBattle(0, true);
    scene.scene.pause();
    m.deployHero(12, 15);
    m.activateHeroAbility();
    scene.sync();
    scene.drawOverlay();
    const before = [...scene.unitSprites.values()].map((s) => [s.x, s.y, s.tintTopLeft]);
    scene.drawOverlay(999999);
    return {
      count: m.battle.units.length,
      tints: before.map((s) => s[2]),
      stable:
        JSON.stringify(before) ===
        JSON.stringify([...scene.unitSprites.values()].map((s) => [s.x, s.y, s.tintTopLeft])),
    };
  });
  expect(initial.count).toBe(6);
  expect(initial.stable).toBe(true);
  expect(initial.tints.every((t) => t === 0xffbd76)).toBe(true);
  const waves = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.step(0.49);
    const before = m.battle.units.length;
    m.step(0.01);
    scene.drawOverlay();
    return [before, m.battle.units.length, scene.unitSprites.size];
  });
  expect(waves).toEqual([6, 9, 9]);
  await page.screenshot({ path: `output/playtest/king-puppet-wave-${browserName}.png` });
  const replay = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    for (let i = 0; i < 420; i++) m.step(0.05);
    scene.drawOverlay();
    const expired = [...scene.unitSprites.values()].every((s) => s.tintTopLeft === 0xffffff);
    m.finishBattle();
    const id = m.state.raidLog[0].id;
    m.returnHome();
    m.startReplay(id);
    const counts = [];
    for (const at of [0.45, 0.55, 0.45, 0.55]) {
      m.seekReplay(at);
      for (let i = 0; i < 100 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
      counts.push([m.battle.units.length, scene.unitSprites.size]);
    }
    m.state.settings.reducedMotion = true;
    scene.drawOverlay();
    const reduced = [...scene.unitSprites.values()]
      .filter((s) => s.texture.key === 'swordsman-walk')
      .map((s) => s.angle);
    m.returnHome();
    scene.sync();
    return { expired, counts, remaining: scene.unitSprites.size, reduced };
  });
  expect(replay.expired).toBe(true);
  expect(replay.counts).toEqual([
    [6, 6],
    [9, 9],
    [6, 6],
    [9, 9],
  ]);
  expect(replay.remaining).toBe(0);
  expect(replay.reduced).toHaveLength(8);
  expect(replay.reduced.every((angle) => angle === 0)).toBe(true);
});
