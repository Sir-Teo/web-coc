import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 960 },
]) {
  test(`the Helper Hut unlocks and assigns the Builder's Apprentice at ${viewport.width}`, async ({
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
      m.townhall!.level = 10;
      const hut = makeBuilding(m.state.nextId++, 'helperhut', 24, 14);
      const cannon = makeBuilding(m.state.nextId++, 'cannon', 28, 14, 12);
      m.state.buildings.push(hut, cannon);
      m.state.gold = m.state.elixir = 20_000_000;
      m.state.gems = 2_000;
      m.upgrade(cannon.id);
      m.selected = hut.id;
      m.changed();
      const { scene } = window.__game;
      const p = scene.screenFor(25.5, 15.5);
      scene.cameras.main.scrollX += p.x - innerWidth / 2;
      scene.cameras.main.scrollY += p.y - innerHeight / 2;
      return hut.id;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `output/playtest/helper-hut-village-${viewport.width}.png` });
    const open = page.locator('.building-context [data-action="helpers"]');
    await expect(open).toContainText('Helpers');
    await open.click();
    await expect(page.locator('#modal-title')).toHaveText('Helper Hut');
    await expect(page.locator('.helper-card')).toHaveCount(3);
    await expect(page.locator('.helper-card').first()).toContainText('Locked');
    expect(
      await page.locator('.helpers-body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.locator('[data-action="helper-buy:builder"]').click();
    await expect(page.locator('.helper-card').first()).toContainText('Ready to work!');
    const assign = page.locator('[data-action^="helper-assign:builder."]');
    await expect(assign).toHaveCount(1);
    expect((await assign.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await page.locator('[data-action="helper-repeat:builder"]').click();
    await expect(page.locator('[data-action="helper-repeat:builder"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.screenshot({ path: `output/playtest/helper-hut-panel-${viewport.width}.png` });
    await assign.click();
    await expect(page.locator('.helper-card.working [data-helper-timer="builder"]')).toBeVisible();
    await expect(page.locator('.helper-card.working')).toContainText(
      'every day until it completes',
    );
    await page.screenshot({ path: `output/playtest/helper-hut-working-${viewport.width}.png` });
    const job = await page.evaluate(() => window.__game.model.helper('builder')!.job);
    expect(job).toMatchObject({ repeat: true });
    expect(id).toBeGreaterThan(0);
  });
}

test('the Alchemist converts Gold into Elixir at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const m = window.__game.model;
    m.state.obstacles = [];
    m.townhall!.level = 11;
    const hut = makeBuilding(m.state.nextId++, 'helperhut', 24, 14);
    m.state.buildings.push(hut);
    m.state.gold = 1_000_000;
    m.state.elixir = 0;
    m.state.gems = 500;
    m.selected = hut.id;
    m.changed();
  });
  await page.locator('.building-context [data-action="helpers"]').click();
  await page.locator('[data-action="helper-buy:alchemist"]').click();
  const card = page.locator('.helper-card').nth(2);
  await expect(card).toContainText('Ready to work!');
  await expect(card.locator('[data-action="alchemy-to:gold"]')).toBeDisabled();
  const slider = card.locator('#alchemy-amount');
  await expect(slider).toHaveAttribute('max', '1000000');
  await slider.fill('500000');
  await expect(card.locator('[data-alchemy-out]')).toHaveText('505,000');
  expect(
    await page.locator('.helpers-body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'output/playtest/helper-hut-alchemist-390.png' });
  await card.locator('[data-action="alchemy-convert"]').click();
  await expect(card).toContainText('Available in');
  const state = await page.evaluate(() => {
    const m = window.__game.model;
    return { gold: m.state.gold, elixir: m.state.elixir };
  });
  expect(state.gold).toBe(500_000);
  expect(state.elixir).toBe(505_000);
});

test('a Book of Building ends a recurring Apprentice assignment through reload', async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await page.clock.setFixedTime(Date.now());
    await page.goto(info.project.use.baseURL!);
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').tap();
    const cannon = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const m = window.__game.model;
      m.townhall!.level = 10;
      m.state.gold = 20_000_000;
      m.state.obstacles = [];
      const hut = makeBuilding(m.state.nextId++, 'helperhut', 24, 14);
      const defense = makeBuilding(m.state.nextId++, 'cannon', 28, 14, 12);
      m.state.buildings.push(hut, defense);
      m.state.helpers = { builder: { level: 1 } };
      m.addMagicItem('book-of-building');
      m.upgrade(defense.id);
      m.selected = hut.id;
      m.changed();
      return defense.id;
    });
    const read = () =>
      page.evaluate((id) => {
        const m = window.__game.model;
        const building = m.state.buildings.find((b) => b.id === id)!;
        return {
          level: building.level,
          end: building.upgradeEnd,
          helper: m.helper('builder'),
          count: m.magicItemCount('book-of-building'),
          gold: m.state.gold,
          gems: m.state.gems,
          busy: m.busy,
        };
      }, cannon);
    await page.locator('.building-context [data-action="helpers"]').tap();
    await page.locator('[data-action="helper-repeat:builder"]').tap();
    await page.locator('[data-action^="helper-assign:builder."]').tap();
    const assigned = await read();
    expect(assigned.helper?.job).toMatchObject({ repeat: true, target: { building: cannon } });
    expect(assigned).toMatchObject({ level: 12, count: 1, busy: 1 });
    await page.screenshot({
      path: info.outputPath('apprentice-recurring.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await page.locator('.status-chips [data-action="builders"]').tap();
    await page.locator(`.working[data-action="select-building:${cannon}"]`).tap();
    await page.locator(`[data-action="book-building:${cannon}"]`).tap();
    const done = await read();
    expect(done).toMatchObject({
      level: 13,
      count: 0,
      busy: 0,
      gold: assigned.gold,
      gems: assigned.gems,
    });
    expect(done.end).toBeUndefined();
    expect(done.helper?.job).toBeUndefined();
    expect(done.helper?.readyAt).toBe(assigned.helper?.readyAt);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(await read()).toEqual(done);
  } finally {
    await context.close();
  }
});
