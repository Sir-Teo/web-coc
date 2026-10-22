import { expect, test } from '@playwright/test';

test('selected Invisibility uses its 4.5-tile ring and practice scouting label', async ({
  page,
  browserName,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const id = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { iso } = await import('/src/game/scene.ts');
    const { model, scene } = window.__game;
    model.state.obstacles = [];
    model.townhall!.level = 18;
    const tower = makeBuilding(model.state.nextId++, 'spelltower', 24, 14, 3);
    tower.spellTowerWeapon = 'rage';
    model.state.buildings.push(tower);
    model.selected = tower.id;
    model.changed();
    scene.sync();
    const point = iso(25, 15);
    scene.cameras.main.centerOn(point.x, point.y);
    return tower.id;
  });
  const mode = page.getByRole('button', { name: 'Change the Spell Tower spell' });
  await mode.click();
  await mode.click();
  await expect(mode).toContainText('Invisibility');
  const ring = await page.evaluate(async (id) => {
    const { iso } = await import('/src/game/scene.ts');
    const { model, scene } = window.__game;
    const tower = model.state.buildings.find((b) => b.id === id);
    const center = iso(tower.x + 1, tower.y + 1);
    const graphics = scene.overlay;
    const stroke = graphics.strokeEllipse;
    let result: { width: number; height: number } | null = null;
    graphics.strokeEllipse = function (x: number, y: number, width: number, height: number) {
      if (Math.abs(x - center.x) < 0.001 && Math.abs(y - center.y) < 0.001)
        result = { width, height };
      return stroke.call(this, x, y, width, height);
    };
    try {
      scene.drawOverlay(0);
    } finally {
      graphics.strokeEllipse = stroke;
    }
    return result;
  }, id);
  expect(ring).not.toBeNull();
  expect(ring!.width).toBeCloseTo(4.5 * 64 * Math.SQRT2, 6);
  expect(ring!.height).toBeCloseTo(4.5 * 32 * Math.SQRT2, 6);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.startBattle(0, true);
    scene.paused = true;
    scene.sync();
  });
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  const report = await page.evaluate((id) => {
    const { model, scene } = window.__game;
    const tower = model.battle.buildings.find((b) => b.id === id);
    if (!tower) throw Error('Practice lost the selected Spell Tower');
    const sprite = scene.sprites.get(id);
    const cam = scene.cameras.main;
    cam.centerOn(sprite.x, sprite.y - 30);
    let hit: { x: number; y: number } | undefined;
    for (let dy = 40; dy >= -160 && !hit; dy -= 4)
      for (let dx = 0; Math.abs(dx) <= 80 && !hit; dx = dx > 0 ? -dx : -dx + 4) {
        const point = { x: sprite.x + dx, y: sprite.y + dy };
        const grid = {
          x: ((point.x - 896) / 32 + (point.y - 112) / 16) / 2,
          y: ((point.y - 112) / 16 - (point.x - 896) / 32) / 2,
        };
        if (
          scene.pickBuilding(point.x, point.y, grid) === tower &&
          model.deployBlocked(grid.x, grid.y)
        )
          hit = point;
      }
    if (!hit) throw Error('No selectable point on the practice Spell Tower');
    const notes: string[] = [];
    const notify = model.notify;
    const worldPoint = cam.getWorldPoint;
    model.notify = (message: string) => notes.push(message);
    cam.getWorldPoint = () => hit;
    try {
      scene.tap({ x: 0, y: 0 });
    } finally {
      model.notify = notify;
      cam.getWorldPoint = worldPoint;
    }
    scene.sync();
    scene.drawOverlay(0);
    return { notes, selected: model.selected, glError: scene.game.renderer.gl.getError() };
  }, id);
  expect(report.notes).toEqual([
    expect.stringContaining('Spell Tower · Level 3 · Range 4.5 tiles'),
  ]);
  expect(report.selected).toBe(id);
  expect(report.glError).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `output/playtest/spell-tower-invisibility-range-${browserName}.png`,
  });
});
