import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`Goblin buildings preserve native identity and grid registration at ${viewport.width}`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.evaluate(async () => {
      const { makeNpcBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.state.settings.reducedMotion = true;
      m.startBattle(0);
      m.discardRecording();
      // This is a rendering fixture, not one of the native campaign layouts.
      m.battle.buildings = [
        makeNpcBuilding(1000, 'goblin-townhall', 20, 20),
        makeNpcBuilding(1001, 'goblin-hut', 25, 20),
        makeNpcBuilding(1002, 'tutorial-cannon', 20, 25),
      ];
      m.changed();
      scene.sync();
      scene.setZoom(innerWidth < 500 ? 0.7 : innerWidth < 1000 ? 0.7 : 1.2);
      scene.cameras.main.centerOn(896, 810);
    });
    const sprites = await page.evaluate(async () => {
      const { npcArt } = await import('/src/game/npc-buildings.ts');
      const { model: m, scene } = window.__game;
      return m.battle.buildings.map((b) => {
        const sprite = scene.sprites.get(b.id),
          art = npcArt(b.npc);
        return {
          npc: b.npc,
          texture: sprite.texture.key,
          width: sprite.displayWidth,
          originX: sprite.originX,
          originY: sprite.originY,
          expected: art || null,
          visible: sprite.visible,
          tint: sprite.tintTopLeft,
        };
      });
    });
    expect(sprites.map((s) => s.texture)).toEqual([
      'goblin-townhall-v1',
      'goblin-hut-v1',
      'cannon',
    ]);
    for (const sprite of sprites) {
      expect(sprite.visible).toBe(true);
      expect(sprite.tint).toBe(0xffffff);
      if (sprite.expected) {
        expect(sprite.width).toBeCloseTo(sprite.expected.width);
        expect(sprite.originX).toBe(sprite.expected.originX);
        expect(sprite.originY).toBe(sprite.expected.originY);
      }
    }
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/goblin-buildings-${viewport.width}-${browserName}.png`,
    });
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.damage(m.battle.buildings[1], 250);
      m.changed();
      scene.sync();
    });
    expect(await page.evaluate(() => window.__game.model.battle.defenders ?? [])).toEqual([]);
    expect(errors).toEqual([]);
  });
}
