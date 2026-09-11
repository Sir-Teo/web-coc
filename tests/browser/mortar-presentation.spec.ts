import { test, expect } from '@playwright/test';

async function prepare(page, reduced = false) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.setViewportSize({ width: 1000, height: 720 });
  await page.evaluate((reduced) => {
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.state.settings.reducedMotion = reduced;
    const hall = { ...m.townhall, id: 9000, x: 22, y: 22 };
    const mortar = {
      ...m.state.buildings.find((b) => b.kind === 'cannon'),
      id: 9001,
      kind: 'mortar',
      x: 10,
      y: 10,
      level: 1,
      hp: 400,
      maxHp: 400,
      cooldown: 0,
    };
    m.state.buildings = [hall, mortar];
    m.state.nextId = 9002;
    m.state.obstacles = [];
    for (const k of Object.keys(m.state.army)) m.state.army[k] = k === 'giant' ? 1 : 0;
    for (const k of Object.keys(m.state.spells)) m.state.spells[k] = 0;
    m.startBattle(0, true);
    scene.sync();
    m.activeTroop = 'giant';
    if (!m.deploy(17, 11)) throw Error('Mortar presentation fixture could not deploy');
    m.step(0.05);
    scene.drawOverlay(0);
  }, reduced);
}
async function read(page) {
  return page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const shell = scene.children.list.find((g) => g.getData?.('mortarShell'));
    const flashes = scene.children.list.filter((g) => g.getData?.('muzzle'));
    return {
      shells: m.battle.shells.length,
      hp: m.battle.units[0].hp,
      maxHp: m.battle.units[0].maxHp,
      pose: shell ? { x: shell.x, y: shell.y, progress: shell.getData('flightProgress') } : null,
      flashes: flashes.map((g) => ({ x: g.x, y: g.y, alpha: g.alpha })),
      impacts: scene.children.list.filter((g) => g.getData?.('impact') === 'mortar').length,
    };
  });
}
async function advance(page, seconds) {
  await page.evaluate((seconds) => {
    const { model, scene } = window.__game;
    model.step(seconds);
    scene.drawOverlay(0);
  }, seconds);
}

test('Mortar flashes at its muzzle, follows a paused arc, and bursts on the ground at impact', async ({
  page,
}) => {
  await prepare(page);
  const first = await read(page);
  expect(first.shells).toBe(1);
  expect(first.hp).toBe(first.maxHp);
  expect(first.pose).not.toBeNull();
  expect(first.flashes).toHaveLength(1);
  expect(first.pose!.x).toBeCloseTo(first.flashes[0].x);
  expect(first.pose!.y).toBeCloseTo(first.flashes[0].y);
  await page.waitForTimeout(450);
  expect(await read(page)).toEqual(first);
  await advance(page, 0.575);
  const middle = await read(page);
  expect(middle.pose!.progress).toBeCloseTo(0.5);
  expect(middle.pose!.y).toBeLessThan(first.pose!.y);
  expect(middle.flashes).toHaveLength(0);
  expect(middle.hp).toBe(first.hp);
  await page.screenshot({
    path: `output/playtest/mortar-arc-${test.info().project.name}.png`,
    animations: 'disabled',
  });
  await advance(page, 0.574);
  expect((await read(page)).hp).toBe(first.hp);
  await advance(page, 0.001);
  const impact = await read(page);
  expect(impact.pose).toBeNull();
  expect(impact.shells).toBe(0);
  expect(impact.hp).toBe(first.hp - 20);
  expect(impact.impacts).toBe(1);
  await page.screenshot({
    path: `output/playtest/mortar-impact-${test.info().project.name}.png`,
    animations: 'disabled',
  });
  await advance(page, 0.3);
  expect((await read(page)).impacts).toBe(0);
});

for (const fromStart of [true, false]) {
  test(`reduced motion suppresses Mortar flight ${fromStart ? 'from launch' : 'when enabled mid-flight'} without early damage`, async ({
    page,
  }) => {
    await prepare(page, fromStart);
    if (!fromStart) {
      expect((await read(page)).pose).not.toBeNull();
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.state.settings.reducedMotion = true;
        scene.sync();
        scene.drawOverlay(0);
      });
    }
    const first = await read(page);
    expect(first.shells).toBe(1);
    expect(first.pose).toBeNull();
    expect(first.flashes).toHaveLength(0);
    expect(first.hp).toBe(first.maxHp);
    await advance(page, 1.15);
    expect((await read(page)).hp).toBe(first.hp - 20);
    expect((await read(page)).impacts).toBe(1);
    await advance(page, 0.2);
    expect((await read(page)).impacts).toBe(0);
  });
}

test('seeking reconstructs the correct airborne shell and leaving playback clears its effects', async ({
  page,
}) => {
  await prepare(page);
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    for (let i = 0; i < 119; i++) m.step(0.05);
    m.finishBattle();
    m.startReplay(m.state.raidLog[0].id);
    m.toggleReplay();
    m.seekReplay(0.9);
    while (m.replay.seeking) m.step(0.05);
    scene.sync();
    scene.drawOverlay(0);
  });
  const later = await read(page);
  expect(later.pose).not.toBeNull();
  expect(later.flashes).toHaveLength(0);
  const before = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.seekReplay(0.4);
    while (m.replay.seeking) m.step(0.05);
    scene.sync();
    scene.drawOverlay(0);
    return m.battle.shells[0].launched;
  });
  expect(before).toBe(0.05);
  const earlier = await read(page);
  expect(earlier.pose).not.toBeNull();
  expect(earlier.pose).not.toEqual(later.pose);
  expect(earlier.flashes).toHaveLength(0);
  await page.waitForTimeout(350);
  expect(await read(page)).toEqual(earlier);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.returnHome();
    scene.sync();
    scene.drawOverlay(0);
  });
  expect(
    await page.evaluate(
      () =>
        window.__game.scene.children.list.filter(
          (g) =>
            g.getData?.('mortarShell') ||
            g.getData?.('muzzle') ||
            g.getData?.('impact') === 'mortar',
        ).length,
    ),
  ).toBe(0);
});
