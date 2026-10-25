import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const defender = model.battle.defenders.find(
      (d) => d.id === window.__defendingHeroAnimation.defenderId,
    );
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(defender.x, defender.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.1 : 1.8).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    return { attacking: defender.attacking, cooldown: defender.cooldown, hp: defender.hp };
  }, at);
}

for (const { kind, width } of [
  { kind: 'king' as const, width: 1440 },
  { kind: 'queen' as const, width: 390 },
]) {
  test(`defending ${kind} attack frames follow combat cooldown at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const expected = await page.evaluate(async (kind) => {
      const { defendingHeroAnimationRecording } =
        await import('/tests/fixtures/defending-hero-animation.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const { heroArtDirectory } = await import('/src/game/hero-native-scene.ts');
      const recording = defendingHeroAnimationRecording(kind);
      window.__defendingHeroAnimation = recording;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
        throw Error('Defending Hero animation replay rejected');
      scene.sync();
      const atlas = await (
        await fetch(`${heroArtDirectory(`heroes-native/${kind}`)}/atlas.json`)
      ).json();
      // Defender faces screen SE toward the stationary attacker at x+0.1, y.
      const frame = atlas.states.attack.frames[1][recording.frame];
      const idle = atlas.states.idle.frames[1][0];
      return {
        first: recording.first,
        repeat: recording.repeat,
        texture: `baked:heroes-native/${kind}/${frame.image}`,
        frame: `${frame.x}:${frame.y}:${frame.w}:${frame.h}`,
        idle: `${idle.x}:${idle.y}:${idle.w}:${idle.h}`,
      };
    }, kind);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const first = await seek(page, expected.first);
    expect(first.attacking).toBe(true);
    const drawn = () =>
      page.evaluate(() => {
        const { scene } = window.__game;
        scene.drawOverlay(0);
        const sprite = scene.children.list.find(
          (o) =>
            o.visible &&
            o.alpha > 0 &&
            o.getData?.('nativeHero') === window.__defendingHeroAnimation.defenderId,
        );
        return { frame: sprite?.frame?.name, texture: sprite?.texture?.key };
      });
    await expect.poll(drawn).toEqual({ frame: expected.frame, texture: expected.texture });
    await page.screenshot({
      path: `output/playtest/defending-hero-animation-${kind}-${width}.png`,
    });
    const repeat = await seek(page, expected.repeat);
    expect(repeat.attacking).toBe(true);
    expect(await drawn()).toEqual({ frame: expected.frame, texture: expected.texture });
    expect(await seek(page, expected.first)).toEqual(first);
    expect(await drawn()).toEqual({ frame: expected.frame, texture: expected.texture });
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await expect.poll(async () => (await drawn()).frame).toBe(expected.idle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await expect.poll(drawn).toEqual({ frame: expected.frame, texture: expected.texture });
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
