import { test, expect } from '@playwright/test';
import { initialSave } from '../../src/game/model';

test('the phone shop places a full-size Cannon at the far corner and persists its footprint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  const before = await page.evaluate(() => {
    const { model: m } = window.__game;
    m.townhall.level = 8;
    m.state.settings.reducedMotion = true;
    m.state.obstacles = [];
    m.changed();
    return { gold: m.state.gold, id: m.state.nextId };
  });
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Defenses"]').click();
  await page.locator('[data-action="build:cannon"]').click();
  await page.evaluate(() => {
    const s = window.__game.scene;
    s.cameras.main.centerOn(896, 1500);
    s.clampCamera();
  });
  await page.waitForTimeout(100);
  const p = await page.evaluate(() => window.__game.scene.screenFor(43.2, 43.2));
  await page.mouse.move(p.x, p.y);
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.ghost?.tintTopLeft))
    .toBe(0xd9ffb0);
  await page.screenshot({
    path: `output/playtest/native-grid-far-corner-${test.info().project.name || 'chromium'}.png`,
    animations: 'disabled',
  });
  await page.mouse.click(p.x, p.y);
  await expect
    .poll(() =>
      page.evaluate(
        (id) => window.__game.model.state.buildings.find((b) => b.id === id)?.x,
        before.id,
      ),
    )
    .toBe(43);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(
    await page.evaluate((id) => {
      const m = window.__game.model,
        b = m.state.buildings.find((b) => b.id === id);
      return {
        kind: b.kind,
        x: b.x,
        y: b.y,
        gold: m.state.gold,
        overlap: m.canPlace('wall', 45, 45),
        adjacent: m.canPlace('wall', 42, 45),
        outside: m.canPlace('wall', 46, 45),
      };
    }, before.id),
  ).toEqual({
    kind: 'cannon',
    x: 43,
    y: 43,
    gold: before.gold - 250,
    overlap: false,
    adjacent: true,
    outside: false,
  });
});

test('an existing version-2 village expands once, discloses relocation and retains paid construction through reload', async ({
  page,
}) => {
  const old = initialSave();
  (old as unknown as { version: number }).version = 2;
  old.tutorial = true;
  const cannon = old.buildings.find((b) => b.kind === 'cannon')!;
  cannon.x = 9;
  cannon.y = 10;
  cannon.hp = cannon.maxHp * 0.4;
  cannon.upgradeStart = old.lastTick - 1000;
  cannon.upgradeEnd = old.lastTick + 600000;
  old.gold = 87654;
  await page.addInitScript((save) => {
    if (sessionStorage.getItem('native-grid-seeded')) return;
    localStorage.setItem('crown-clan-save-v1', JSON.stringify(save));
    sessionStorage.setItem('native-grid-seeded', 'yes');
  }, old);
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await expect(page.locator('#toast')).toContainText('1 building moved to clear ground');
  const snapshot = () =>
    page.evaluate((id) => {
      const m = window.__game.model,
        b = m.state.buildings.find((b) => b.id === id);
      return {
        version: m.state.version,
        building: structuredClone(b),
        gold: m.state.gold,
        notice: m.state.mapUpgrade ?? null,
        ids: m.state.buildings.map((b) => b.id),
      };
    }, cannon.id);
  const before = await snapshot();
  expect(before.version).toBe(3);
  expect(before.notice).toBeNull();
  expect(before.gold).toBe(87654);
  expect(before.building).toMatchObject({
    id: cannon.id,
    level: cannon.level,
    hp: cannon.hp,
    upgradeStart: cannon.upgradeStart,
    upgradeEnd: cannon.upgradeEnd,
  });
  expect([before.building.x, before.building.y]).not.toEqual([9, 10]);
  expect(before.ids).toEqual(old.buildings.map((b) => b.id));
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  expect(await snapshot()).toEqual(before);
  await expect(page.locator('#toast')).not.toContainText('building moved');
});

test('an overlapping imported village is refused while the current village remains usable', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  const original = await page.evaluate(() => structuredClone(window.__game.model.state));
  const invalid = structuredClone(original);
  invalid.gold = 1;
  invalid.buildings[1].x = invalid.buildings[0].x;
  invalid.buildings[1].y = invalid.buildings[0].y;
  await page
    .locator('#import-file')
    .setInputFiles({
      name: 'overlapping.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(invalid)),
    });
  await expect(page.locator('#toast')).toHaveText(
    'That backup is not a valid Crown & Clan village.',
  );
  expect(await page.evaluate(() => window.__game.model.state.gold)).toBe(original.gold);
  expect(
    await page.evaluate(() => window.__game.model.state.buildings.map((b) => [b.id, b.x, b.y])),
  ).toEqual(original.buildings.map((b) => [b.id, b.x, b.y]));
});
