import { test, expect } from '@playwright/test';

test('moving producers retire collection bubbles and restore them on cancel or placement', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  const result = await page.evaluate(async () => {
    const { model, scene } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.paused = true;
    model.state.obstacles = [];
    model.state.buildings = ['goldmine', 'collector', 'darkdrill'].map((kind, i) => {
      const b = makeBuilding(900 + i, kind, 10 + i * 5, 20, 1);
      b.stored = 150;
      return b;
    });
    const results = [];
    for (const b of model.state.buildings) {
      scene.sync();
      const original = scene.bubbles.get(b.id);
      if (!original) throw Error('Initial bubble missing');
      model.move(b.id);
      scene.sync();
      const hidden = !scene.bubbles.has(b.id);
      const disposed = !original.scene && scene.tweens.getTweensOf(original).length === 0;
      const others = scene.bubbles.size;
      if (model.place(0, 0)) throw Error('Invalid move accepted');
      scene.sync();
      const rejected = !scene.bubbles.has(b.id);
      model.cancel();
      scene.sync();
      const restored = scene.bubbles.has(b.id);
      model.move(b.id);
      scene.sync();
      const placed = model.place(b.x, 30);
      scene.sync();
      const bubble = scene.bubbles.get(b.id),
        point = iso(b.x + 1.5, b.y + 1.5);
      results.push({
        kind: b.kind,
        hidden,
        disposed,
        others,
        rejected,
        restored,
        placed,
        anchored: bubble?.x === point.x,
      });
    }
    model.move(902);
    scene.sync();
    scene.drawOverlay(0);
    return results;
  });
  for (const row of result)
    expect(row).toMatchObject({
      hidden: true,
      disposed: true,
      others: 2,
      rejected: true,
      restored: true,
      placed: true,
      anchored: true,
    });
  await page.screenshot({ path: `output/playtest/producer-movement-bubbles-${browserName}.png` });
});
