import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('training from a campaign scout returns to the same opponent and visible action', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.locator('.train-add').tap();
  await page.locator('[data-action="clear-army"]').tap();
  await page.locator('[data-action="close-drawer"]').tap();
  await page.locator('.attack-btn').tap();
  await page.locator('[data-action="campaign-scout:0"]').tap();
  const scout = page.locator('.campaign-scout');
  await expect(scout.getByRole('heading', { name: 'Payback' })).toBeVisible();
  await expect(scout.getByRole('button', { name: 'Back to campaign' })).toBeVisible();
  const prepare = scout.getByRole('button', { name: 'Prepare army' });
  const offset = () => scout.evaluate((element) => element.scrollTop);
  await prepare.scrollIntoViewIfNeeded();
  const before = await offset();
  expect(before).toBeGreaterThan(0);
  await prepare.tap();
  await expect(page.locator('.drawer-sheet')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__game.model.battle)).toBeNull();
  await page.locator('[data-action="close-drawer"]').tap();
  await expect(scout.getByRole('heading', { name: 'Payback' })).toBeVisible();
  expect(await offset()).toBe(before);
  await expect(prepare).toBeInViewport();
  await expect(prepare).toBeFocused();
  await scout.evaluate((element) => {
    document.addEventListener(
      'click',
      () => {
        document.body.dataset.scoutReturnOffset = String(element.scrollTop);
      },
      { capture: true, once: true },
    );
  });
  await prepare.tap();
  const secondOffset = Number(await page.locator('body').getAttribute('data-scout-return-offset'));
  expect(secondOffset).toBeGreaterThan(0);
  await page.locator('[data-action="train:swordsman"]').tap();
  await page.locator('[data-action="close-drawer"]').tap();
  await expect(scout.getByRole('heading', { name: 'Payback' })).toBeVisible();
  const attack = scout.getByRole('button', { name: 'Attack', exact: true });
  const maxScroll = await scout.evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(await offset()).toBe(Math.min(secondOffset, maxScroll));
  await expect(attack).toBeInViewport();
  await expect(attack).toBeFocused();
  await attack.tap();
  await expect(page.locator('.battle-enemy h2')).toHaveText('Payback');
  await expect(page.locator('.prep-banner')).toBeVisible();
  await page.locator('.end-battle[data-action="home"]').tap();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        troops: window.__game.model.state.army.swordsman,
        raids: window.__game.model.state.raidLog?.length ?? 0,
      })),
    )
    .toEqual({ troops: 1, raids: 0 });
});

test('an empty army can prepare a campaign rematch from the Battle Log', async ({ page }, info) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const m = window.__game.model;
    for (let attempt = 0; attempt < 4; attempt++) {
      m.state.army = { ...emptyArmy(), swordsman: 1 };
      m.startCampaign(0);
      m.activeTroop = 'swordsman';
      if (!m.deploy(2, 2)) throw Error('Payback deployment refused');
      m.finishBattle();
      if (attempt < 3) m.returnHome();
    }
  });
  await page.locator('.result-modal [data-action="home"]').tap();
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="battle-log"]').tap();
  const log = page.locator('.battle-log-body');
  const record = page.locator('.raid-record').last();
  await expect(record.getByRole('heading', { name: 'Payback' })).toBeVisible();
  const retry = record.getByRole('button', { name: /Prepare army|Attack village/ });
  await expect(retry).toBeEnabled();
  await retry.scrollIntoViewIfNeeded();
  const logScroll = await log.evaluate((el) => el.scrollTop);
  expect(logScroll).toBeGreaterThan(0);
  await retry.tap();
  const scout = page.locator('.campaign-scout');
  await expect(scout.getByRole('heading', { name: 'Payback' })).toBeVisible();
  await scout.getByRole('button', { name: 'Prepare army' }).tap();
  await expect(page.locator('.drawer-sheet')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__game.model.battle)).toBeNull();
  await page.locator('[data-action="close-drawer"]').tap();
  await scout.getByRole('button', { name: 'Back to battle log', exact: true }).tap();
  await expect(log).toBeVisible();
  await expect(retry).toBeFocused();
  expect(await log.evaluate((el) => el.scrollTop)).toBeCloseTo(logScroll, 0);
  expect(await page.evaluate(() => window.__game.model.armySize)).toBe(0);
  await retry.tap();
  await scout.getByRole('button', { name: 'Prepare army' }).tap();
  await page.locator('[data-action="train:swordsman"]').tap();
  await page.locator('[data-action="close-drawer"]').tap();
  await scout.getByRole('button', { name: 'Attack', exact: true }).tap();
  await expect(page.locator('.battle-enemy h2')).toHaveText('Payback');
  await expect(page.locator('.prep-banner')).toBeVisible();
  await page.screenshot({ path: info.outputPath('campaign-rematch-from-log.png') });
  await page.locator('.end-battle[data-action="home"]').tap();
  expect(
    await page.evaluate(() => ({
      army: window.__game.model.armySize,
      records: window.__game.model.state.raidLog?.length,
    })),
  ).toEqual({ army: 1, records: 4 });
});
