import { expect, test, type Page } from '@playwright/test';

async function openTrader(page: Page, width: number, blacksmith = true) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const before = await page.evaluate(async (blacksmith) => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 18),
      makeBuilding(2, 'herohall', 30, 20, 8),
      ...(blacksmith ? [makeBuilding(3, 'blacksmith', 10, 10, 1)] : []),
      makeBuilding(4, 'builder', 2, 2, 1),
    ];
    m.state.nextId = 100;
    m.state.king = { level: 1 };
    m.state.heroes = { queen: { level: 1 } };
    m.state.heroLineup = ['king'];
    m.state.gear = { levels: {}, loadouts: {} };
    delete m.state.equipment;
    m.tick(m.clock);
    m.state.gems = 5000;
    if (blacksmith && !m.buyDeal('free-glowy-ore')) throw Error('Free deal setup failed');
    m.selected = 1;
    m.changed();
    return {
      deals: m.traderDeals.map((d) => d.id),
      trader: JSON.stringify(m.state.trader),
      loadouts: JSON.stringify(m.gear.loadouts),
    };
  }, blacksmith);
  await page.locator('.building-context [data-action="magic-items"]').click();
  await page.locator('.modal-footer [data-action="trader"]').click();
  await expect(page.locator('#modal-title')).toHaveText('Weekly Deals');
  await expect(page.locator('.trader-deal')).toHaveCount(7);
  await page.locator('[data-action="trader-equipment"]').click();
  await expect(page.locator('#modal-title')).toHaveText('Epic Equipment');
  return before;
}

for (const width of [390, 1440])
  test(`Trader equipment purchases persist without changing weekly deals at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const before = await openTrader(page, width);
    const spiky = page.locator('[data-epic="spiky-ball"]');
    await expect(spiky).toBeVisible();
    await expect(spiky.locator('[data-action="epic-buy:spiky-ball"]')).toContainText('1,500');
    await expect
      .poll(() =>
        spiky
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    await spiky.locator('[data-action="epic-buy:spiky-ball"]').click();
    await expect(spiky.locator('[data-action="epic-buy:spiky-ball"]')).toBeDisabled();
    await expect(spiky).toContainText('Owned');
    expect(
      await page.evaluate(() => [
        window.__game.model.state.gems,
        window.__game.model.gear.levels['spiky-ball'],
      ]),
    ).toEqual([3500, 1]);
    expect(await page.evaluate(() => window.__game.model.buyEpicItem('spiky-ball'))).toBe(false);
    await page.locator('[data-action="trader-equipment-hero:queen"]').click();
    const mirror = page.locator('[data-epic="magic-mirror"]');
    await mirror.locator('[data-action="epic-buy:magic-mirror"]').click();
    await expect(mirror.locator('[data-action="epic-buy:magic-mirror"]')).toBeDisabled();
    expect(
      await page.evaluate(() => [
        window.__game.model.state.gems,
        window.__game.model.gear.levels['magic-mirror'],
      ]),
    ).toEqual([2000, 1]);
    const after = await page.evaluate(async () => {
      const { GameModel } = await import('/src/game/model.ts');
      const { validateSave } = await import('/src/game/save.ts');
      const m = window.__game.model;
      const saved = JSON.parse(JSON.stringify(m.state));
      const restored = new GameModel(saved);
      return {
        deals: m.traderDeals.map((d) => d.id),
        trader: JSON.stringify(m.state.trader),
        loadouts: JSON.stringify(m.gear.loadouts),
        valid: validateSave(saved),
        owned: [restored.gear.levels['spiky-ball'], restored.gear.levels['magic-mirror']],
      };
    });
    expect({ deals: after.deals, trader: after.trader, loadouts: after.loadouts }).toEqual(before);
    expect(after.valid).toBe(true);
    expect(after.owned).toEqual([1, 1]);
    if (width === 390) {
      for (const [w, h] of [
        [320, 480],
        [568, 320],
        [700, 390],
        [701, 390],
        [390, 844],
      ]) {
        await page.setViewportSize({ width: w, height: h });
        for (const title of ['Epic Equipment', 'Weekly Deals']) {
          await expect(page.locator('#modal-title')).toHaveText(title);
          const issues = await page.evaluate(() => {
            const modal = document.querySelector('.modal').getBoundingClientRect();
            const body = document.querySelector('.modal-body');
            const failures = [];
            if (
              modal.left < 0 ||
              modal.right > innerWidth ||
              modal.top < 0 ||
              modal.bottom > innerHeight
            )
              failures.push('modal outside viewport');
            if (body.scrollWidth > body.clientWidth + 1) failures.push('horizontal body overflow');
            for (const button of document.querySelectorAll('.trader-footer button')) {
              const r = button.getBoundingClientRect();
              if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight)
                failures.push('footer button outside viewport');
              if (
                !button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
              )
                failures.push('footer button obscured');
            }
            return failures;
          });
          expect(issues, `${w}x${h} ${title}`).toEqual([]);
          await page
            .locator(
              `[data-action="${title === 'Epic Equipment' ? 'trader' : 'trader-equipment'}"]`,
            )
            .click();
        }
      }
    }
    await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
    await page.screenshot({ path: `output/playtest/trader-equipment-${width}-${browserName}.png` });
    await page.locator('.modal-footer [data-action="trader"]').click();
    await expect(page.locator('#modal-title')).toHaveText('Weekly Deals');
    await expect(page.locator('.trader-deal')).toHaveCount(7);
    await expect(page.locator('[data-action="trader-buy:free-glowy-ore"]')).toBeDisabled();
    await page.locator('[data-action="trader-equipment"]').click();
    await page.locator('[data-action="trader-equipment-hero:queen"]').click();
    await page.locator('[data-action="native-item:magic-mirror"]').click();
    await expect(page.locator('#modal-title')).toHaveText('Hero Equipment');
    await expect(page.locator('.equipment-detail h2')).toHaveText('Magic Mirror');
    expect(errors).toEqual([]);
  });

test('Trader equipment explains Blacksmith, gem and hero requirements before purchase', async ({
  page,
  browserName,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openTrader(page, 390, false);
  const row = page.locator('[data-epic="spiky-ball"]');
  const buy = row.locator('[data-action="epic-buy:spiky-ball"]');
  await expect(row).toContainText('Build a Blacksmith');
  await expect(buy).toBeDisabled();
  expect(await page.evaluate(() => window.__game.model.buyEpicItem('spiky-ball'))).toBe(false);
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const m = window.__game.model;
    m.state.buildings.push(makeBuilding(3, 'blacksmith', 10, 10, 1));
    m.state.gems = 1499;
    m.changed();
  });
  await expect(row).toContainText('Not enough gems');
  await expect(buy).toBeDisabled();
  expect(await page.evaluate(() => window.__game.model.buyEpicItem('spiky-ball'))).toBe(false);
  expect(await page.evaluate(() => window.__game.model.state.gems)).toBe(1499);
  await page.evaluate(() => {
    window.__game.model.state.gems = 1500;
    window.__game.model.changed();
  });
  await expect(buy).toBeEnabled();
  await buy.click();
  await expect(buy).toBeDisabled();
  expect(await page.evaluate(() => window.__game.model.state.gems)).toBe(0);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.king = undefined;
    m.state.heroes = {};
    m.state.buildings = m.state.buildings.filter((b) => b.kind !== 'herohall');
    m.changed();
  });
  await expect(page.locator('.trader-equipment-body')).toContainText('Recruit a hero');
  await expect(page.locator('.trader-epic')).toHaveCount(0);
  await page.screenshot({ path: `output/playtest/trader-equipment-empty-${browserName}.png` });
  expect(errors).toEqual([]);
});
