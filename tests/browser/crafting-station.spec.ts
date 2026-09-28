import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 960 },
]) {
  test(`the Crafting Station places and upgrades a defense at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('#loading').waitFor({ state: 'detached' });
    const id = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const m = window.__game.model;
      m.state.obstacles = [];
      m.townhall!.level = 18;
      const station = makeBuilding(m.state.nextId++, 'craftingstation', 24, 14);
      m.state.buildings.push(station);
      m.state.gold = m.state.elixir = 20_000_000;
      m.state.dark = 300_000;
      m.selected = station.id;
      m.changed();
      const { scene } = window.__game;
      const p = scene.screenFor(25.5, 15.5);
      scene.cameras.main.scrollX += p.x - innerWidth / 2;
      scene.cameras.main.scrollY += p.y - innerHeight / 2;
      return station.id;
    });
    const open = page.locator(`.building-context [data-action="crafting:${id}"]`);
    await expect(open).toContainText('Choose a defense');
    await open.click();
    await expect(page.locator('#modal-title')).toHaveText('Crafting Station');
    await expect(page.locator('.crafted-card')).toHaveCount(3);
    expect(
      await page.locator('.crafting-body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.locator('[data-action="craft-choose:hunter"]').click();
    await expect(page.locator('.crafted-card.on h3')).toHaveText('Hero Hunter');
    const upgrade = page.locator('[data-action="craft-module:hunter-1"]');
    expect((await upgrade.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await page.screenshot({ path: `output/playtest/crafting-panel-${viewport.width}.png` });
    await upgrade.click();
    await expect(page.locator('[data-crafting-timer]')).toBeVisible();
    await page.locator('[data-action="close"]').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `output/playtest/crafting-village-${viewport.width}.png` });
    expect(
      await page.evaluate(
        (id) => window.__game.model.state.buildings.find((b) => b.id === id)!.crafted,
        id,
      ),
    ).toBe('hunter');
  });
}
