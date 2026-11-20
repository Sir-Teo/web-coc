import { expect, test } from '@playwright/test';

test('Fast Attack and geared defenses show their actual selection ranges', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const towers = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    model.state.obstacles = [];
    model.townhall!.level = 18;
    const gear = makeBuilding(model.state.nextId++, 'multigeartower', 24, 14, 1);
    gear.gearMode = 'long';
    const cannon = makeBuilding(model.state.nextId++, 'cannon', 28, 14, 8);
    cannon.geared = true;
    const archer = makeBuilding(model.state.nextId++, 'archertower', 32, 14, 10);
    archer.geared = true;
    const mortar = makeBuilding(model.state.nextId++, 'mortar', 36, 14, 8);
    mortar.geared = true;
    model.state.buildings.push(gear, cannon, archer, mortar);
    model.selected = gear.id;
    model.changed();
    scene.sync();
    return [
      { id: gear.id, range: 8, rangeLabel: '8 tiles', dps: '650', burst: 4 },
      { id: cannon.id, range: 7, rangeLabel: '7 tiles', dps: '96', burst: 4 },
      { id: archer.id, range: 8, rangeLabel: '8 tiles', dps: '126', burst: 1 },
      { id: mortar.id, range: 11, rangeLabel: '4–11 tiles', dps: '25', burst: 3 },
    ];
  });
  await page.getByRole('button', { name: 'Switch Multi-Gear Tower to Fast Attack mode' }).click();
  for (const tower of towers) {
    const ring = await page.evaluate(async (id) => {
      const { BUILDINGS } = await import('/src/game/data.ts');
      const { iso } = await import('/src/game/scene.ts');
      const { model, scene } = window.__game;
      model.selected = id;
      model.changed();
      scene.sync();
      const building = model.state.buildings.find((b) => b.id === id);
      const size = BUILDINGS[building.kind].size;
      const center = iso(building.x + size / 2, building.y + size / 2);
      scene.cameras.main.centerOn(center.x, center.y);
      const graphics = scene.overlay;
      const stroke = graphics.strokeEllipse;
      let result: { width: number; height: number } | null = null;
      graphics.strokeEllipse = function (x: number, y: number, width: number, height: number) {
        if (Math.abs(x - center.x) < 0.001 && Math.abs(y - center.y) < 0.001 && width > (result?.width ?? 0))
          result = { width, height };
        return stroke.call(this, x, y, width, height);
      };
      try {
        scene.drawOverlay(0);
      } finally {
        graphics.strokeEllipse = stroke;
      }
      return result;
    }, tower.id);
    expect(ring).not.toBeNull();
    expect(ring!.width).toBeCloseTo(tower.range * 64 * Math.SQRT2, 6);
    expect(ring!.height).toBeCloseTo(tower.range * 32 * Math.SQRT2, 6);
    await page.locator('.building-context [data-action="info"]').click();
    const stat = (label: RegExp) => page.locator('.info-table tr').filter({ hasText: label }).locator('td').nth(1);
    await expect(stat(/^\s*Range/)).toHaveText(tower.rangeLabel);
    await expect(stat(/Damage per second/)).toHaveText(tower.dps);
    const burst = stat(/Shots per burst/);
    if (tower.burst > 1) await expect(burst).toHaveText(String(tower.burst));
    else await expect(burst).toHaveCount(0);
    await page.locator('.modal [data-action="close"]').click();
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: `output/playtest/geared-defense-range-${browserName}.png` });
});
