import { test, expect } from '@playwright/test';
import { legacyArmyVillage } from '../fixtures/legacy-army-village';

for (const [kind, width, cost] of [
  ['camp', 88, 200],
  ['herohall', 187, 20000],
] as const) {
  test(`the phone shop places a 4×4 ${kind} with an aligned preview and persistent full footprint`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('[data-action="skip-tutorial"]').click();
    const before = await page.evaluate(() => {
      const m = window.__game.model;
      m.townhall.level = 8;
      m.state.settings.reducedMotion = true;
      m.state.obstacles = [];
      m.changed();
      return { id: m.state.nextId, elixir: m.state.elixir };
    });
    await page.locator('[data-action="shop"]').last().click();
    await page.locator('[data-action="tab:Army"]').click();
    await page.locator(`[data-action="build:${kind}"]`).click();
    await page.evaluate(() => {
      const s = window.__game.scene;
      s.cameras.main.centerOn(896, 1490);
      s.clampCamera();
    });
    await page.waitForTimeout(100);
    const blocked = await page.evaluate(() => window.__game.scene.screenFor(43.2, 42.2));
    await page.mouse.move(blocked.x, blocked.y);
    await expect
      .poll(() => page.evaluate(() => window.__game.scene.ghost?.tintTopLeft))
      .toBe(0xff7272);
    const clear = await page.evaluate(() => window.__game.scene.screenFor(42.2, 42.2));
    await page.mouse.move(clear.x, clear.y);
    await expect
      .poll(() => page.evaluate(() => window.__game.scene.ghost?.tintTopLeft))
      .toBe(kind === 'camp' ? 0xffffff : 0xd9ffb0);
    expect(
      await page.evaluate(() => {
        const g = window.__game.scene.ghost;
        return { x: g.x, y: g.y, width: g.displayWidth, texture: g.texture.key };
      }),
    ).toEqual({ x: 896, y: 1520, width, texture: kind });
    await page.screenshot({
      path: `output/playtest/army-footprint-${kind}-${test.info().project.name || 'chromium'}.png`,
      animations: 'disabled',
    });
    await page.mouse.click(clear.x, clear.y);
    await expect
      .poll(() =>
        page.evaluate(
          (id) => window.__game.model.state.buildings.find((b) => b.id === id)?.x,
          before.id,
        ),
      )
      .toBe(42);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    expect(
      await page.evaluate((id) => {
        const { model: m, scene } = window.__game;
        const b = m.state.buildings.find((b) => b.id === id);
        return {
          kind: b.kind,
          x: b.x,
          y: b.y,
          elixir: m.state.elixir,
          occupied: m.canPlace('wall', 45, 45),
          adjacent: m.canPlace('wall', 41, 45),
          width: scene.sprites.get(id).displayWidth,
        };
      }, before.id),
    ).toEqual({
      kind,
      x: 42,
      y: 42,
      elixir: before.elixir - cost,
      occupied: false,
      adjacent: true,
      width,
    });
  });
}

test('a version-3 village migrates camps and the Hero Hall once and preserves paid upgrades across reload and import', async ({
  page,
}) => {
  const old = legacyArmyVillage();
  await page.addInitScript((save) => {
    if (sessionStorage.getItem('army-footprint-seeded')) return;
    localStorage.setItem('crown-clan-save-v1', JSON.stringify(save));
    sessionStorage.setItem('army-footprint-seeded', 'yes');
  }, old);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await expect(page.locator('#toast')).toContainText('2 buildings moved to clear ground');
  const snapshot = () =>
    page.evaluate(() => {
      const m = window.__game.model;
      return {
        version: m.state.version,
        buildings: structuredClone(m.state.buildings),
        obstacles: structuredClone(m.obstacles),
        gold: m.state.gold,
        king: structuredClone(m.state.king),
        notice: m.state.mapUpgrade ?? null,
      };
    });
  const migrated = await snapshot();
  expect(migrated.version).toBe(4);
  expect(migrated.notice).toBeNull();
  expect(migrated.gold).toBe(old.gold);
  expect(migrated.king).toEqual(old.king);
  expect(migrated.obstacles).toEqual(old.obstacles);
  for (const b of migrated.buildings) {
    const original = old.buildings.find((o) => o.id === b.id)!;
    expect({ ...b, x: original.x, y: original.y }).toEqual(original);
  }
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(await snapshot()).toEqual(migrated);
  await expect(page.locator('#toast')).not.toContainText('buildings moved');
  await page.locator('#import-file').setInputFiles({
    name: 'old-army-village.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(old)),
  });
  await expect(page.locator('#toast')).toContainText('2 buildings moved to clear ground');
  expect(await snapshot()).toEqual(migrated);
});
