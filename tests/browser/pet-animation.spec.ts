import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, index: number) {
  return page.evaluate(async (index) => {
    const { model, scene } = window.__game;
    const recording = window.__petAnimation;
    const sample = recording.snapshots[index];
    model.seekReplay(sample.at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const pet = model.battle.units.find((u) => u.id === recording.petId);
    const target = model.battle.buildings.find((b) => b.id === pet.target);
    const { BUILDINGS } = await import('/src/game/data.ts');
    const { iso } = await import('/src/game/scene.ts');
    const { bakedDirection } = await import('/src/game/hero-native-scene.ts');
    const point = iso(pet.x, pet.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.3 : 2).centerOn(point.x, point.y - 25);
    scene.drawOverlay(0);
    const direction = bakedDirection(
      target.x + BUILDINGS[target.kind].size / 2 - pet.x,
      target.y + BUILDINGS[target.kind].size / 2 - pet.y,
    );
    const atlas = window.__petAtlas;
    const frame = atlas.states.attack.frames[direction][index === 0 ? 2 : 4];
    const first = atlas.states.attack.frames[direction][0];
    return {
      cooldown: pet.cooldown,
      attacking: pet.attacking,
      poison: pet.native.effects.poison,
      expected: `${frame.x}:${frame.y}:${frame.w}:${frame.h}`,
      texture: `baked:heroes-native/frosty/${frame.image}`,
      first: `${first.x}:${first.y}:${first.w}:${first.h}`,
    };
  }, index);
}

for (const width of [1440, 390]) {
  test(`Frosty attack frames follow a Poison-scaled interval at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const base = await page.evaluate(async () => {
      const { petAnimationRecording } = await import('/tests/fixtures/pet-animation.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const recording = petAnimationRecording();
      window.__petAnimation = recording;
      window.__petAtlas = await (await fetch('/assets/heroes-native/frosty/atlas.json')).json();
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
        throw Error('Pet animation replay rejected');
      scene.sync();
      return recording.base;
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const drawn = () =>
      page.evaluate(() => {
        const { scene } = window.__game;
        scene.drawOverlay(0);
        const sprite = scene.children.list.find(
          (o) =>
            o.visible && o.alpha > 0 && o.getData?.('nativeHero') === window.__petAnimation.petId,
        );
        return {
          frame: sprite?.frame?.name,
          texture: sprite?.texture?.key,
          tint: sprite?.tintTopLeft,
        };
      });
    const states = [];
    for (const index of [0, 1]) {
      const state = await seek(page, index);
      expect(state.attacking).toBe(true);
      expect(state.cooldown).toBeGreaterThan(base);
      expect(state.poison.attackSpeed).toBeLessThan(0);
      await expect
        .poll(drawn)
        .toEqual({ frame: state.expected, texture: state.texture, tint: 0xa6e57a });
      states.push(state);
    }
    await page.screenshot({ path: `output/playtest/pet-animation-frosty-${width}.png` });
    expect(await seek(page, 0)).toEqual(states[0]);
    expect(await drawn()).toEqual({
      frame: states[0].expected,
      texture: states[0].texture,
      tint: 0xa6e57a,
    });
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await expect.poll(async () => (await drawn()).frame).toBe(states[0].first);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await expect
      .poll(drawn)
      .toEqual({ frame: states[0].expected, texture: states[0].texture, tint: 0xa6e57a });
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
