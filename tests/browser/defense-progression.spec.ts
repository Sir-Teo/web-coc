import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
});

for (const [kind, hp, nextHp, cost, seconds, label] of [
  ['cannon', 470, 520, 4000, 600, '10m'],
  ['archertower', 420, 460, 5000, 2700, '45m'],
  ['mortar', 450, 500, 100000, 14400, '4h'],
] as const) {
  test(`${kind} Info and saved timer agree with the destination level`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await page.evaluate(
      ({ kind, cost, hp }) => {
        const m = window.__game.model;
        m.townhall!.level = kind === 'mortar' ? 5 : 3;
        if (kind === 'mortar') {
          m.state.obstacles = [];
          m.state.buildings.push({
            id: m.state.nextId++,
            kind,
            x: 2,
            y: 2,
            level: 2,
            hp,
            maxHp: hp,
            stored: 0,
            cooldown: 0,
          });
        }
        m.state.gold = cost;
        m.selected = m.state.buildings.find((b) => b.kind === kind)!.id;
        m.changed();
        return m.selected;
      },
      { kind, cost, hp },
    );
    await page
      .locator('.building-context')
      .getByRole('button', { name: 'Info', exact: true })
      .click();
    const row = page.locator('.info-table tr').filter({ hasText: 'Hitpoints' });
    await expect(row.locator('td').nth(1)).toHaveText(String(hp));
    await expect(row.locator('td').nth(2)).toHaveText(new RegExp(String(nextHp)));
    const stats =
      kind === 'cannon'
        ? { dps: '11', nextDps: '15', hit: '8.8', nextHit: '12', range: '9 tiles', rate: '0.8s' }
        : kind === 'archertower'
          ? {
              dps: '15',
              nextDps: '19',
              hit: '7.5',
              nextHit: '9.5',
              range: '10 tiles',
              rate: '0.5s',
            }
          : { dps: '5', nextDps: '6', hit: '25', nextHit: '30', range: '4–11 tiles', rate: '5s' };
    for (const [label, current, next] of [
      ['Damage per second', stats.dps, stats.nextDps],
      ['Damage per hit', stats.hit, stats.nextHit],
      ['Range', stats.range, stats.range],
      ['Attack speed', stats.rate, stats.rate],
    ]) {
      const stat = page
        .locator('.info-table tr')
        .filter({ has: page.getByRole('cell', { name: label, exact: true }) });
      await expect(stat.locator('td').nth(1)).toHaveText(current);
      await expect(stat.locator('td').nth(2)).toContainText(next);
    }
    if (kind === 'mortar')
      await expect(
        page.locator('.info-table tr').filter({ hasText: 'Splash radius' }),
      ).toContainText('1.5 tiles');
    await expect(page.locator('.info-cost')).toContainText(cost.toLocaleString('en-US'));
    await expect(page.locator('.info-cost')).toContainText(label);
    await page.screenshot({
      path: `output/playtest/${kind}-progression-${test.info().project.name}.png`,
      animations: 'disabled',
    });
    await page.locator(`.info-upgrade [data-action="upgrade:${id}"]`).click();
    const end = await page.evaluate((id) => {
      const m = window.__game.model,
        b = m.state.buildings.find((b) => b.id === id)!;
      return {
        end: b.upgradeEnd!,
        duration: b.upgradeEnd! - b.upgradeStart!,
        gold: m.state.gold,
        hp: b.hp,
        busy: m.busy,
      };
    }, id);
    expect(end).toEqual({ end: end.end, duration: seconds * 1000, gold: 0, hp, busy: 1 });
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    const restored = await page.evaluate((id) => {
      const m = window.__game.model,
        b = m.state.buildings.find((b) => b.id === id)!;
      return { end: b.upgradeEnd, hp: b.hp, level: b.level, busy: m.busy };
    }, id);
    expect(restored).toEqual({ end: end.end, hp, level: 2, busy: 1 });
    await page.evaluate(
      ({ id, end }) => {
        const m = window.__game.model;
        m.tick(end);
        m.selected = id;
        m.changed();
      },
      { id, end: end.end },
    );
    expect(
      await page.evaluate((id) => {
        const m = window.__game.model,
          b = m.state.buildings.find((b) => b.id === id)!;
        return [b.level, b.hp, b.maxHp, m.busy];
      }, id),
    ).toEqual([3, nextHp, nextHp, 0]);
    await expect(page.locator('.context-info > span')).toContainText('Level 3');
  });
}

test('new villages respect defense counts and the shop unlocks the next pieces at the right Town Halls', async ({
  page,
}) => {
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Defenses"]').click();
  const tile = (kind: string) =>
    page.locator('.shop-tile').filter({ has: page.locator(`[data-action="build:${kind}"]`) });
  await expect(tile('cannon')).toContainText('2/2');
  await expect(tile('archertower')).toContainText('1/1');
  await expect(page.locator('[data-action="build:cannon"]')).toBeDisabled();
  await expect(page.locator('[data-action="build:archertower"]')).toBeDisabled();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 4;
    m.changed();
  });
  await expect(page.locator('[data-action="build:cannon"]')).toBeDisabled();
  await expect(tile('archertower')).toContainText('1/2');
  await expect(page.locator('[data-action="build:archertower"]')).toContainText('1,000');
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 5;
    m.changed();
  });
  await expect(tile('cannon')).toContainText('2/3');
  await expect(page.locator('[data-action="build:cannon"]')).toBeEnabled();
  await expect(page.locator('[data-action="build:cannon"]')).toContainText('250');
});

test('older combat recordings retain the result and explain why playback is unavailable', async ({
  page,
}) => {
  await page.evaluate(() => {
    const m = window.__game.model;
    m.startBattle(0, true);
    m.deploy(1, 13);
    m.step(0.05);
    m.finishBattle();
    m.state.raidLog[0].replay.version = 4;
    m.returnHome();
    m.changed();
  });
  await page.locator('[data-action="battle-log"]').click();
  await expect(page.locator('.raid-record')).toHaveCount(1);
  await expect(page.locator('.replay-unavailable')).toHaveText(
    'Replay unavailable · Recorded before a combat update.',
  );
  await expect(page.getByRole('button', { name: 'Watch replay', exact: true })).toHaveCount(0);
  await expect(page.locator('.raid-score')).toContainText('0%');
});
