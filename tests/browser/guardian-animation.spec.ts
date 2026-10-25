import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, index: number) {
  return page.evaluate(async (index) => {
    const { model, scene } = window.__game;
    const recording = window.__guardianAnimation;
    const sample = recording.samples[index];
    model.seekReplay(sample.at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const g = model.battle.defenders.find((d) => d.id === recording.guardianId);
    const target = model.battle.units.find((u) => u.id === g.target);
    const { iso } = await import('/src/game/scene.ts');
    const { bakedDirection } = await import('/src/game/hero-native-scene.ts');
    const point = iso(g.x, g.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.1 : 1.7).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    const atlas = window.__guardianAtlas;
    const direction = bakedDirection(target.x - g.x, target.y - g.y);
    const frame =
      atlas.states.attack.frames[direction][Math.floor(sample.age * atlas.states.attack.fps)];
    const first = atlas.states.attack.frames[direction][0];
    return {
      attacking: g.attacking,
      poison: !!g.poison && g.poison.until > model.battle.elapsed,
      clock: g.clock,
      texture: `baked:guardians-native/${g.guardian}/${frame.image}`,
      frame: `${frame.x}:${frame.y}:${frame.w}:${frame.h}`,
      first: `${first.x}:${first.y}:${first.w}:${first.h}`,
      phase: g.phase,
    };
  }, index);
}

for (const { kind, width, poison } of [
  { kind: 'longshot' as const, width: 1440, poison: false },
  { kind: 'smasher' as const, width: 390, poison: true },
  { kind: 'logger' as const, width: 390, poison: true },
]) {
  test(`${kind} body repeats attack clips on its ${poison ? 'poisoned ' : ''}combat clock at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(
      async ({ kind, poison }) => {
        const { guardianAnimationRecording } =
          await import('/tests/fixtures/guardian-animation.ts');
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        const recording = guardianAnimationRecording(kind, poison);
        window.__guardianAnimation = recording;
        window.__guardianAtlas = await (
          await fetch(`/assets/guardians-native/${kind}/atlas.json`)
        ).json();
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
          throw Error('Guardian animation replay rejected');
        scene.sync();
      },
      { kind, poison },
    );
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const drawn = () =>
      page.evaluate(() => {
        const { scene } = window.__game;
        scene.drawOverlay(0);
        const sprite = scene.children.list.find(
          (o) =>
            o.visible &&
            o.alpha > 0 &&
            o.getData?.('nativeHero') === window.__guardianAnimation.guardianId,
        );
        return { frame: sprite?.frame?.name, texture: sprite?.texture?.key };
      });
    const snapshots = [];
    for (const index of [0, 1, 2]) {
      const state = await seek(page, index);
      expect(state.attacking).toBe(true);
      expect(state.phase).toBe('fighting');
      expect(state.poison).toBe(poison);
      await expect.poll(drawn).toEqual({ frame: state.frame, texture: state.texture });
      snapshots.push(state);
    }
    await page.screenshot({ path: `output/playtest/guardian-animation-${kind}-${width}.png` });
    expect(await seek(page, 0)).toEqual(snapshots[0]);
    expect(await drawn()).toEqual({ frame: snapshots[0].frame, texture: snapshots[0].texture });
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await expect.poll(async () => (await drawn()).frame).toBe(snapshots[0].first);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await expect.poll(drawn).toEqual({ frame: snapshots[0].frame, texture: snapshots[0].texture });
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
