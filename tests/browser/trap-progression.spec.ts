import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
});

for (const [kind, cost, upgrade, seconds, th, damage, nextDamage] of [
  ['bomb', 400, 1000, 60, 3, '20', '24'],
  ['giantbomb', 12500, 75000, 3600, 6, '175', '200'],
  ['airbomb', 4000, 20000, 1800, 5, '100', '120'],
  ['springtrap', 2000, 130000, 3600, 7, '0', '250'],
] as const)
  test(`${kind} places immediately with busy builders and its paid upgrade survives reload`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(
      ({ th, cost }) => {
        const { model: m, scene } = window.__game;
        m.townhall.level = th;
        m.state.obstacles = [];
        m.state.gold = cost;
        for (const b of m.state.buildings.filter((b) => b.kind === 'cannon')) {
          b.upgradeStart = m.clock;
          b.upgradeEnd = m.clock + 10000000;
        }
        m.changed();
        scene.cameras.main.centerOn(896, 208);
      },
      { th, cost },
    );
    await page.locator('.shop-btn').click();
    await page.locator('[data-action="tab:Traps"]').click();
    await page.locator(`[data-action="build:${kind}"]`).click();
    const p = await page.evaluate(() => window.__game.scene.screenFor(3, 3));
    await page.mouse.click(p.x, p.y);
    const state = await page.evaluate((kind) => {
      const m = window.__game.model,
        b = m.state.buildings.find((b) => b.kind === kind);
      return {
        id: b?.id,
        constructing: !!b?.constructing,
        end: b?.upgradeEnd ?? null,
        gold: m.state.gold,
        busy: m.busy,
      };
    }, kind);
    expect(state.id).toBeDefined();
    expect(state).toMatchObject({ constructing: false, end: null, gold: 0, busy: 2 });
    await expect(page.locator('.building-context')).toContainText('Armed');
    await page.locator('[data-action="info"]').click();
    const row = page
      .locator('.info-table tr')
      .filter({ has: page.getByRole('cell', { name: 'Damage', exact: true }) });
    await expect(row.locator('td').nth(1)).toHaveText(damage);
    await expect(row.locator('td').nth(2)).toContainText(nextDamage);
    const button = page.locator(`.info-upgrade [data-action="upgrade:${state.id}"]`);
    await expect(button).toBeDisabled();
    await page.evaluate((upgrade) => {
      const m = window.__game.model;
      for (const b of m.state.buildings.filter((b) => b.kind === 'cannon')) {
        delete b.upgradeStart;
        delete b.upgradeEnd;
      }
      m.state.gold = upgrade;
      m.changed();
    }, upgrade);
    await expect(button).toBeEnabled();
    if (kind === 'giantbomb') {
      const radius = page.locator('.info-table tr').filter({ hasText: 'Blast radius' });
      await expect(radius.locator('td').nth(1)).toHaveText('3 tiles');
      await expect(radius.locator('td').nth(2)).toContainText('3.5 tiles');
    }
    if (kind === 'springtrap') {
      await expect(page.locator('.info-table')).toContainText('1 tile');
      await expect(page.locator('.info-table')).toContainText('10 spaces');
      await expect(page.locator('.info-table')).toContainText('12 spaces');
    }
    await page.screenshot({
      path: `output/playtest/${kind}-audit-${test.info().project.name || 'chromium'}.png`,
      animations: 'disabled',
    });
    await button.click();
    const end = await page.evaluate((id) => {
      const m = window.__game.model,
        b = m.state.buildings.find((b) => b.id === id);
      return {
        end: b.upgradeEnd,
        duration: b.upgradeEnd - b.upgradeStart,
        gold: m.state.gold,
        busy: m.busy,
      };
    }, state.id);
    expect(end).toMatchObject({ duration: seconds * 1000, gold: 0, busy: 1 });
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(
      await page.evaluate(
        (id) => window.__game.model.state.buildings.find((b) => b.id === id).upgradeEnd,
        state.id,
      ),
    ).toBe(end.end);
    await page.evaluate(
      ({ id, end }) => {
        const m = window.__game.model;
        m.tick(end);
        m.selected = id;
        m.changed();
      },
      { id: state.id, end: end.end },
    );
    await expect(page.locator('.building-context')).toContainText('Level 2');
    await expect(page.locator('.building-context')).toContainText('Armed');
  });

test('a sprung hero rises in place on battle time, pauses, and respects reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 720 });
  const first = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    scene.paused = true;
    const hall = { ...m.townhall, id: 9000, x: 22, y: 22, level: 7 };
    const base = {
      ...m.state.buildings.find((b) => b.kind === 'cannon'),
      upgradeEnd: undefined,
      upgradeStart: undefined,
    };
    m.state.buildings = [
      hall,
      { ...base, id: 9001, kind: 'springtrap', x: 10, y: 10, level: 2 },
      { ...base, id: 9002, kind: 'herohall', x: 23, y: 2, level: 1 },
    ];
    m.state.nextId = 9003;
    m.state.king = { level: 1 };
    m.state.obstacles = [];
    m.startBattle(0, true);
    scene.sync();
    if (!m.deployHero(10.5, 10.5)) throw Error('Hero deployment failed');
    m.step(0.05);
    scene.drawOverlay(0);
    const u = m.battle.units.find((u) => u.hero);
    const im = scene.unitSprites.get(u.id);
    scene.cameras.main.centerOn(im.x, im.y);
    scene.zoomBy(1.5);
    return { id: u.id, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp, spriteY: im.y };
  });
  expect(first.hp).toBe(first.maxHp - 125);
  const springLabels = await page.evaluate(() =>
    window.__game.scene.children.list
      .filter((child) => child.type === 'Text' && /Spring Trap|SPRUNG!/.test(child.text))
      .map((child) => child.text),
  );
  expect(springLabels).toEqual(['SPRUNG!']);
  const advance = async (seconds: number) =>
    page.evaluate((seconds) => {
      const { model: m, scene } = window.__game;
      m.step(seconds);
      scene.drawOverlay(0);
      const u = m.battle.units.find((u) => u.hero),
        im = scene.unitSprites.get(u.id);
      return {
        x: u.x,
        y: u.y,
        spriteY: im.y,
        lift: im.getData('springLift'),
        attacking: u.attacking,
      };
    }, seconds);
  const peak = await advance(0.3);
  expect(peak.x).toBe(first.x);
  expect(peak.y).toBe(first.y);
  expect(peak.lift).toBeCloseTo(45);
  expect(peak.spriteY).toBeCloseTo(first.spriteY - 45);
  expect(peak.attacking).toBe(false);
  await page.waitForTimeout(200);
  expect(await advance(0)).toEqual(peak);
  await page.screenshot({
    path: `output/playtest/spring-toss-${test.info().project.name || 'chromium'}.png`,
    animations: 'disabled',
  });
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.state.settings.reducedMotion = true;
    scene.drawOverlay(0);
  });
  expect((await advance(0)).lift).toBe(0);
  const landed = await advance(0.3);
  expect(landed.lift).toBe(0);
  expect(landed.x).toBe(first.x);
  expect(landed.y).toBe(first.y);
});
