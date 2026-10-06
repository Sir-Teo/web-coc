import { test, expect } from '@playwright/test';

for (const [width, height] of [
  [390, 844],
  [1440, 960],
])
  test(`the Clan Castle's Treasury banks the Star Bonus and collects at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const castle = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, hud } = window.__game;
      const castle = makeBuilding(m.state.nextId++, 'clancastle', 22, 4, 2);
      m.state.buildings.push(castle);
      m.state.gold = m.state.elixir = 0;
      // A Town Hall upgrade's boost is running.
      m.state.starBonus = { stars: 5, readyAt: 0, boostUntil: m.clock + 50 * 3600_000 };
      m.changed();
      hud.show('achievements');
      return castle.id;
    });
    const card = page.locator('.star-bonus');
    await expect(card).toContainText('4× Town Hall boost');
    await expect(card).toContainText('banked in the Clan Castle’s Treasury');
    await card.locator('[data-action="star-bonus"]').click();
    const banked = await page.evaluate(() => window.__game.model.treasury);
    expect(banked.gold).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__game.model.state.gold)).toBe(0);
    await page.locator('[data-action="close"]').click();

    await page.evaluate((id) => {
      const m = window.__game.model;
      m.selected = id;
      m.changed();
    }, castle);
    const open = page.locator('.building-context [data-action="treasury"]');
    await expect(open).toBeVisible();
    // The starter Town Hall's Treasury is full of Gold: the button flags it.
    await expect(open.locator('.notification')).toHaveCount(1);
    await open.click();
    const panel = page.locator('.treasury-body');
    await expect(panel.locator('[data-treasury="gold"]')).toContainText(
      `${banked.gold.toLocaleString('en-US')} / `,
    );
    // Dark Elixir has no Treasury room before Town Hall 7.
    await expect(panel.locator('[data-treasury="dark"]')).toHaveCount(0);
    await page.screenshot({ path: `output/playtest/treasury-${width}-${browserName}.png` });
    const collect = page.locator('[data-action="treasury-collect"]');
    await expect(collect).toBeInViewport();
    expect((await collect.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await collect.click();
    const after = await page.evaluate(() => {
      const m = window.__game.model;
      return {
        gold: m.state.gold,
        cap: m.resourceCap('gold'),
        left: m.treasury.gold,
        wealth: m.state.achievements?.counts.war_loot ?? 0,
      };
    });
    expect(after.gold).toBe(Math.min(banked.gold, after.cap));
    expect(after.left).toBe(banked.gold - after.gold);
    expect(after.wealth).toBe(after.gold);
    // The panel redraws with what is left; nothing scrolls sideways at phone width.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
