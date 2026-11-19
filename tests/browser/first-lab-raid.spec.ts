import { test, expect, type Page, type TestInfo } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

for (const duringRaid of [false, true]) {
  test(`Laboratory research completing ${duringRaid ? 'during a live raid' : 'offline'} carries into new raids only`, ({
    page,
  }, info) => checkResearchAndRaid(page, info, duringRaid));
}

async function checkResearchAndRaid(page: Page, info: TestInfo, duringRaid: boolean) {
  test.setTimeout(120000);
  await page.clock.setFixedTime(Date.now());
  const ready = () => expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  const reload = async () => {
    await page.reload();
    await ready();
  };
  const snapshot = () =>
    page.evaluate(() => {
      const m = window.__game.model;
      const { gold, elixir, gems, xp, research, starter, raidLog, army, stats } = m.state;
      return {
        gold,
        elixir,
        gems,
        xp,
        research,
        starter,
        raidLog,
        army,
        raids: stats.raids,
        level: m.state.troopLevels?.swordsman ?? 1,
      };
    });
  await page.goto('/?lazyart');
  await ready();
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const m = window.__game.model;
    m.townhall!.level = 3;
    m.state.obstacles = [];
    m.state.buildings.push(makeBuilding(m.state.nextId++, 'laboratory', 24, 22, 1));
    m.state.elixir = 10000;
    // Seed the pre-research recording through ordinary combat and settlement.
    m.startCampaign(0);
    m.activeTroop = 'swordsman';
    if (!m.deploy(2, 2)) throw Error('Fixture deployment refused');
    for (let i = 0; i < 20; i++) m.step(0.05);
    m.finishBattle();
    m.returnHome();
  });
  const before = await snapshot();
  expect(before.raidLog![0].replay!.initial.troopLevels.swordsman).toBe(1);
  await page.locator('.train-add').tap();
  await page.locator('[data-action="research"]').tap();
  const research = page.locator('[data-action="research-start:swordsman"]');
  await expect(research).toContainText('10,000');
  await research.tap();
  const pending = await snapshot();
  expect(
    await page.evaluate(async () => {
      const { validateSave } = await import('/src/game/save.ts');
      return validateSave(JSON.parse(JSON.stringify(window.__game.model.state)));
    }),
  ).toBe(true);
  expect(pending).toMatchObject({ elixir: 0, gems: before.gems, xp: before.xp, level: 1 });
  expect(pending.research!.end).toBe((await page.evaluate(() => Date.now())) + 1800000);
  await page.getByRole('button', { name: 'Close dialog' }).tap();
  await page.locator('[data-action="close-drawer"]').tap();
  await reload();
  expect(await snapshot()).toEqual(pending);
  const deployBarbarian = async () => {
    await page.locator('.attack-btn').tap();
    await page.locator('[data-action="attack:0"]').tap();
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const troop = page.locator('[data-action="troop:swordsman"]');
    await troop.tap();
    const spot = await page.evaluate(() => {
      const { model, scene, game } = window.__game;
      for (let x = 1.5; x < 44; x++)
        for (let y = 1.5; y < 44; y++) {
          if (model.deployBlocked(x, y)) continue;
          const p = scene.screenFor(x, y);
          if (
            p.y > innerHeight * 0.3 &&
            p.y < innerHeight * 0.65 &&
            document.elementFromPoint(p.x, p.y) === game.canvas
          )
            return p;
        }
      throw Error('No visible ground for the next raid');
    });
    await page.touchscreen.tap(spot.x, spot.y);
  };
  const troopStats = () =>
    page.evaluate(() => {
      const m = window.__game.model;
      const barbarian = m.battle?.units.find((u) => u.kind === 'swordsman');
      return { hp: barbarian?.maxHp, damage: m.troopStats('swordsman').damage };
    });
  const completed = { ...pending, level: 2, research: undefined };
  if (duringRaid) {
    await deployBarbarian();
    await expect.poll(troopStats).toEqual({ hp: 45, damage: 9 });
    await page.clock.setFixedTime(pending.research!.end + 1);
    await expect.poll(async () => (await snapshot()).level).toBe(2);
    expect(await troopStats()).toEqual({ hp: 45, damage: 9 });
    await reload();
    const settled = await snapshot();
    expect(settled).toMatchObject({
      level: 2,
      research: undefined,
      gold: pending.gold,
      elixir: pending.elixir,
      xp: pending.xp,
      gems: pending.gems,
      raids: pending.raids + 1,
      army: { swordsman: pending.army.swordsman - 1 },
    });
    expect(settled.raidLog).toHaveLength(2);
    expect(settled.raidLog![0].deployed.swordsman).toBe(1);
    expect(settled.raidLog![0].replay!.initial.troopLevels.swordsman).toBe(1);
    await reload();
    expect(await snapshot()).toEqual(settled);
  } else {
    await page.goto('about:blank');
    await page.clock.setFixedTime(pending.research!.end + 1);
    await page.goto('/?lazyart');
    await ready();
    expect(await snapshot()).toEqual(completed);
    await reload();
    expect(await snapshot()).toEqual(completed);
  }

  await deployBarbarian();
  await expect.poll(troopStats).toEqual({ hp: 54, damage: 12 });
  const firstHit = await page.evaluate(() => {
    const { model, game } = window.__game;
    game.loop.sleep();
    try {
      const battle = model.battle!;
      const initialHp = battle.buildings.map((building) => building.hp);
      for (let tick = 0; tick < 600 && !battle.finished; tick++) {
        model.step(0.05);
        const hit = battle.buildings.findIndex((building, index) => building.hp < initialHp[index]);
        if (hit !== -1) return initialHp[hit] - battle.buildings[hit].hp;
      }
      return 0;
    } finally {
      game.loop.wake();
    }
  });
  expect(firstHit).toBe(12);
  await page.locator('[data-action="surrender"]').tap();
  await page.locator('[data-action="end"]').tap();
  await page.locator('.result-modal [data-action="home"]').tap();
  await reload();
  const finished = await snapshot();
  expect(finished.raidLog).toHaveLength(duringRaid ? 3 : 2);
  expect(finished.raidLog![0].replay!.initial.troopLevels.swordsman).toBe(2);
  expect(finished.raidLog!.at(-1)).toEqual(before.raidLog![0]);
  await page.locator('[data-action="battle-log"]').tap();
  for (const [index, stats] of [
    [0, { hp: 54, damage: 12 }],
    [1, { hp: 45, damage: 9 }],
  ] as const) {
    const record = page.locator('.raid-record').nth(index);
    await record.getByRole('button', { name: 'Watch replay' }).tap();
    await page.getByRole('button', { name: 'First deployment' }).tap();
    await expect.poll(troopStats).toEqual(stats);
    if (index === 0)
      await page.screenshot({ path: info.outputPath('researched-barbarian-replay.png') });
    await page.getByRole('button', { name: 'Back to log' }).tap();
  }
  expect(await snapshot()).toEqual(finished);
}
