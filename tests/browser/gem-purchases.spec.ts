import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('a Shop building the village cannot afford offers its missing elixir for gems, then goes in hand', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const cost = await page.evaluate(async () => {
    const { buildPrice } = await import('/src/game/data.ts');
    const m = window.__game.model;
    m.townhall!.level = 5;
    m.state.elixir = 0;
    m.state.gems = 500;
    m.changed();
    return buildPrice('laboratory', 0).cost;
  });
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Army"]').click();
  await page.locator('[data-action="build:laboratory"]').click();
  // The client's own wording, with the price from its resource table.
  await expect(page.locator('#modal-title')).toHaveText('You need more Elixir');
  await expect(page.locator('.shortfall-body')).toContainText(
    `Buy the missing ${cost.toLocaleString()} Elixir?`,
  );
  const buy = page.locator('[data-action="shortfall-buy"]');
  const box = (await buy.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `output/playtest/gem-purchase-390-${browserName}.png` });
  const gems = await page.evaluate(async (cost) => {
    const { resourceGems } = await import('/src/game/gem-costs.ts');
    return resourceGems('elixir', cost);
  }, cost);
  await expect(buy).toContainText(String(gems));
  await buy.tap();
  await expect(page.locator('.placement-banner')).toBeVisible();
  expect(
    await page.evaluate(() => ({
      placement: window.__game.model.placement,
      elixir: window.__game.model.state.elixir,
      gems: window.__game.model.state.gems,
    })),
  ).toEqual({ placement: 'laboratory', elixir: cost, gems: 500 - gems });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('declining the offer keeps the gems, and a short gem balance cannot buy', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.gold = 0;
    m.state.gems = 0;
    m.upgrade(m.state.buildings.find((b) => b.kind === 'cannon')!.id);
  });
  await expect(page.locator('#modal-title')).toHaveText('You need more Gold');
  await expect(page.locator('[data-action="shortfall-buy"]')).toBeDisabled();
  await expect(page.locator('.shortfall-body')).toContainText('Not enough Gems');
  await page.locator('.shortfall-body [data-action="close"]').tap();
  await expect(page.locator('#modal-title')).toBeHidden();
  expect(await page.evaluate(() => window.__game.model.shortfall)).toBeNull();
});

test('a Builder suggestion charges its displayed gems once and persists one upgrade', async ({
  page,
}, info) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').tap();
  const target = await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 5;
    m.state.gold = 100;
    m.state.gems = 500;
    const [cannon, ...others] = m.state.buildings.filter((b) => b.kind === 'cannon');
    cannon.level = 1;
    for (const other of others) other.level = 2;
    m.changed();
    return { id: cannon.id, missing: m.upgradeCost(cannon) - m.state.gold };
  });
  const read = () =>
    page.evaluate((id) => {
      const m = window.__game.model;
      const cannon = m.state.buildings.find((b) => b.id === id)!;
      return {
        gold: m.state.gold,
        gems: m.state.gems,
        end: cannon.upgradeEnd,
        level: cannon.level,
        busy: m.busy,
      };
    }, target.id);
  const counter = page.locator('.status-chips [data-action="builders"]');
  const offer = () => page.locator('.shortfall-body');
  const openOffer = async () => {
    await counter.tap();
    await page.locator('[data-action="builder-option:cannon,1"]').tap();
    const id = await page.evaluate(() => window.__game.model.selected);
    await page.locator(`[data-action="upgrade:${id}"]`).tap();
    await expect(offer()).toBeVisible();
    return id;
  };
  const before = await read();
  await openOffer();
  await expect(offer()).toContainText(`Buy the missing ${target.missing.toLocaleString()} Gold?`);
  await offer().getByRole('button', { name: 'Cancel' }).tap();
  await expect(offer()).toHaveCount(0);
  expect(await read()).toEqual(before);

  expect(await openOffer()).toBe(target.id);
  const buy = offer().locator('[data-action="shortfall-buy"]');
  const displayed = Number((await buy.innerText()).replaceAll(',', '').trim());
  expect(displayed).toBeGreaterThan(0);
  const box = (await buy.boundingBox())!;
  await page.screenshot({ path: info.outputPath('builder-shortfall.png'), animations: 'disabled' });
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.touchscreen.tap(x, y);
  await page.touchscreen.tap(x, y);
  await expect(offer()).toHaveCount(0);
  const started = await read();
  expect(started).toMatchObject({ gems: before.gems - displayed, gold: 0, level: 1, busy: 1 });
  expect(started.end).toBeDefined();
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await read()).toEqual(started);
  await counter.tap();
  await expect(page.locator('.builder-menu .working')).toHaveCount(1);
  await expect(page.locator(`.working[data-action="select-building:${target.id}"]`)).toBeVisible();
});

test.describe('early Laboratory research on a compact phone', () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true });

  test('a research shortfall can be declined or paid exactly once', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model } = window.__game;
      model.townhall!.level = 3;
      model.state.buildings.push(makeBuilding(model.state.nextId++, 'laboratory', 32, 27, 1));
      model.state.elixir = 5000;
      model.state.gems = 100;
      model.changed();
    });

    const read = () =>
      page.evaluate(() => {
        const { model } = window.__game;
        return {
          elixir: model.state.elixir,
          gems: model.state.gems,
          research: model.state.research,
          level: model.troopLevel('swordsman'),
        };
      });
    const openResearch = async () => {
      const research = page.locator('[data-action="research"]');
      if (!(await research.isVisible())) await page.locator('.train-add').tap();
      await research.tap();
    };
    const start = page.locator('[data-action="research-start:swordsman"]');
    const buy = page.locator('[data-action="shortfall-buy"]');

    const before = await read();
    await openResearch();
    await expect(start).toContainText('10,000');
    await start.tap();
    await expect(page.locator('.shortfall-body')).toContainText('Buy the missing 5,000 Elixir?');
    await expect(buy).toContainText('12');
    await page.locator('.shortfall-body [data-action="close"]').tap();
    expect(await read()).toEqual(before);

    await openResearch();
    await start.tap();
    await buy.tap();
    const paid = await read();
    expect(paid).toMatchObject({
      elixir: 0,
      gems: 88,
      research: { kind: 'swordsman' },
      level: 1,
    });
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(await read()).toEqual(paid);
    await openResearch();
    await expect(page.locator('[data-research]')).toBeVisible();
    await expect(page.locator('[data-action="research-start:archer"]')).toBeDisabled();
    await page.locator('[data-action="research-finish"]').tap();
    expect(await read()).toMatchObject({ elixir: 0, gems: 78, level: 2 });
    await expect(start).toHaveText('Requires laboratory 3');
  });
});
