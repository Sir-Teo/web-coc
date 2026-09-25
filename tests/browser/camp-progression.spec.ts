import { test, expect } from '@playwright/test';
import { initialSave, makeBuilding } from '../../src/game/model';

const boot = async (page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await expect(page.locator('#loading')).toBeHidden();
};

test('the camp Info panel shows native capacity, health, cost and time and preserves its upgrade across reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.locator('[data-action="skip-tutorial"]').click();
  const before = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.townhall.level = 3;
    const camp = m.state.buildings.find((b) => b.kind === 'camp');
    m.selected = camp.id;
    scene.cameras.main.centerOn(896 + (camp.x - camp.y) * 32, 112 + (camp.x + camp.y + 4) * 16);
    m.changed();
    return { id: camp.id, elixir: m.state.elixir };
  });
  await page.locator('[data-action="info"]').click();
  await expect(page.locator('.info-body tr').filter({ hasText: 'Hitpoints' })).toContainText('150');
  await expect(page.locator('.info-body tr').filter({ hasText: 'Troop capacity' })).toContainText(
    '30',
  );
  await expect(page.locator('.info-body tr').filter({ hasText: 'Troop capacity' })).toContainText(
    '35',
  );
  await expect(page.locator('.info-cost')).toContainText('10,000');
  await expect(page.locator('.info-cost')).toContainText('30m');
  await page.screenshot({
    animations: 'disabled',
    path: `output/playtest/camp-progression-info-${test.info().project.name || 'chromium'}.png`,
  });
  await page.locator(`.info-upgrade [data-action="upgrade:${before.id}"]`).click();
  const deadline = await page.evaluate(
    (id) => window.__game.model.state.buildings.find((b) => b.id === id).upgradeEnd,
    before.id,
  );
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(
    await page.evaluate((id) => {
      const m = window.__game.model;
      const b = m.state.buildings.find((b) => b.id === id);
      return {
        capacity: m.capacity,
        elixir: m.state.elixir,
        deadline: b.upgradeEnd,
        duration: b.upgradeEnd - b.upgradeStart,
      };
    }, before.id),
  ).toEqual({ capacity: 30, elixir: before.elixir - 10000, deadline, duration: 1800000 });
  await page.evaluate((deadline) => window.__game.model.tick(deadline), deadline);
  expect(await page.evaluate(() => window.__game.model.capacity)).toBe(35);
  await page.locator('.train-add').click();
  await expect(page.locator('[data-action="army-jump:troops"]')).toHaveAttribute(
    'aria-label',
    'Show troops, 22 of 35 housing spaces',
  );
});

test('Town Hall 2 has one camp; Town Hall 3 can buy the second for 200 elixir', async ({
  page,
}) => {
  await boot(page);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Army"]').click();
  const camp = page
    .locator('.shop-tile')
    .filter({ has: page.getByRole('heading', { name: 'Army Camp', exact: true }) });
  await expect(camp.locator('.shop-count')).toHaveText('1/1');
  await expect(camp.locator('[data-action="build:camp"]')).toBeDisabled();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 3;
    m.changed();
  });
  await expect(camp.locator('.shop-count')).toHaveText('1/2');
  await expect(camp.locator('[data-action="build:camp"]')).toHaveText('200');
  await expect(camp.locator('[data-action="build:camp"]')).toBeEnabled();
});

test('legacy over-capacity armies remain visible, reload intact, and recover capacity through actual troop removal', async ({
  page,
}) => {
  const old = initialSave();
  old.tutorial = true;
  const camp = old.buildings.find((b) => b.kind === 'camp')!;
  camp.level = 1;
  camp.hp = 280;
  camp.maxHp = 700;
  camp.upgradeStart = old.lastTick - 1000;
  camp.upgradeEnd = old.lastTick + 600000;
  old.buildings.push(makeBuilding(old.nextId++, 'camp', 21, 11));
  old.army.swordsman = 55;
  old.army.archer = 0;
  await page.addInitScript((save) => {
    if (sessionStorage.getItem('legacy-camp-seeded')) return;
    localStorage.setItem('crown-clan-save-v1', JSON.stringify(save));
    sessionStorage.setItem('legacy-camp-seeded', 'yes');
  }, old);
  await boot(page);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(
    await page.evaluate((id) => {
      const m = window.__game.model;
      const b = m.state.buildings.find((b) => b.id === id);
      return {
        capacity: m.capacity,
        army: m.armySize,
        hp: b.hp,
        maxHp: b.maxHp,
        end: b.upgradeEnd,
      };
    }, camp.id),
  ).toEqual({ capacity: 40, army: 55, hp: 40, maxHp: 100, end: camp.upgradeEnd });
  await page.locator('.train-add').click();
  for (const [width, height] of [
    [320, 740],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('.army-over-capacity')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.army-over-capacity > span')).toBeVisible();
    await expect(page.locator('.army-over-capacity')).toContainText('Your troops are kept');
    await expect(page.locator('[data-action="train:swordsman"]')).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/camp-over-capacity-${width}-${test.info().project.name || 'chromium'}.png`,
    });
  }
  for (let i = 0; i < 16; i++) await page.locator('[data-action="remove-troop:swordsman"]').click();
  await expect(page.locator('.army-over-capacity')).toHaveCount(0);
  await page.locator('[data-action="train:swordsman"]').click();
  await expect(page.locator('[data-action="train:swordsman"]')).toBeDisabled();
  expect(await page.evaluate(() => window.__game.model.armySize)).toBe(40);
});
