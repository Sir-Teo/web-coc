import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
}
async function open(page: Page, level: number) {
  return page.evaluate(async (level) => {
    const { gauntletKnockoutRecording } = await import('/tests/fixtures/giant-gauntlet.ts');
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    const r = gauntletKnockoutRecording(level);
    window.__gauntletGrowth = r;
    const { model, scene } = window.__game;
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
      throw Error('Gauntlet knockout replay rejected');
    scene.sync();
    return {
      alive: r.alive,
      held: r.held,
      fading: r.fading,
      gone: r.gone,
      scale: level === 1 ? 1.7 : 2.15,
    };
  }, level);
}
async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__gauntletGrowth;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((u) => u.id === r.unitId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(unit.x - 0.6, unit.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.15 : 1.65).centerOn(point.x, point.y - 50);
    scene.drawOverlay(0);
    return { hp: unit.hp, fallen: unit.defeatedAt, elapsed: model.battle.elapsed };
  }, at);
}
async function drawn(page: Page, fallback = false) {
  return page.evaluate((fallback) => {
    const { scene } = window.__game;
    scene.drawOverlay(0);
    const sprite = scene.children.list.find(
      (o) =>
        o.getData?.(fallback ? 'nativeTroop' : 'nativeHero') === window.__gauntletGrowth.unitId,
    );
    return sprite
      ? {
          visible: sprite.visible && sprite.alpha > 0,
          scale: sprite.scaleX,
          width: sprite.displayWidth,
          alpha: sprite.alpha,
          angle: sprite.angle,
          frame: sprite.frame?.name,
          texture: sprite.texture?.key,
        }
      : null;
  }, fallback);
}

for (const { width, level } of [
  { width: 1440, level: 1 },
  { width: 390, level: 27 },
]) {
  test(`Gauntlet ${level} grows and holds its real knockout at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await boot(page, width);
    const expected = await open(page, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const atlas = await page.evaluate(async () => {
      const { heroArtDirectory } = await import('/src/game/hero-native-scene.ts');
      const atlas = await (
        await fetch(`${heroArtDirectory('heroes-native/king')}/atlas.json`)
      ).json();
      const frame = atlas.states.die.frames[1].at(-1);
      return { scale: atlas.scale, frame: `${frame.x}:${frame.y}:${frame.w}:${frame.h}` };
    });
    expect((await seek(page, expected.alive)).hp).toBeGreaterThan(0);
    await expect
      .poll(async () => (await drawn(page))?.scale)
      .toBeCloseTo(atlas.scale * expected.scale, 12);
    const held = await seek(page, expected.held);
    expect(held.hp).toBeLessThanOrEqual(0);
    expect(held.elapsed - held.fallen).toBeGreaterThanOrEqual(2 - 1e-9);
    await expect.poll(async () => (await drawn(page))?.visible).toBe(true);
    expect((await drawn(page))?.alpha).toBe(1);
    expect((await drawn(page))?.angle).toBe(-70);
    expect((await drawn(page))?.scale).toBeCloseTo(atlas.scale * expected.scale, 12);
    expect((await drawn(page))?.frame).toBe(atlas.frame);
    await page.screenshot({ path: `output/playtest/gauntlet-knockout-${level}-${width}.png` });
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await drawn(page))?.frame).toBe(atlas.frame);
    expect((await drawn(page))?.alpha).toBe(1);
    await seek(page, expected.fading);
    expect((await drawn(page))?.scale).toBeCloseTo(atlas.scale, 12);
    expect((await drawn(page))?.alpha).toBeCloseTo(0.5, 9);
    await seek(page, expected.gone);
    expect(await drawn(page)).toBeNull();
    expect((await drawn(page, true))?.visible).toBe(false);
    expect(await seek(page, expected.held)).toEqual(held);
    expect((await drawn(page))?.alpha).toBe(1);
    expect((await drawn(page))?.scale).toBeCloseTo(atlas.scale * expected.scale, 12);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('Gauntlet portrait fallback retains enlarged knockout size and fade on phone', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.route('**/assets/characters/king-v1/atlas.json', (route) => route.abort());
  await boot(page, 390);
  const expected = await open(page, 1);
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  await seek(page, expected.held);
  await expect.poll(async () => (await drawn(page, true))?.texture).not.toBe('troop-fallback');
  const held = await drawn(page, true);
  expect(held?.visible).toBe(true);
  expect(held?.alpha).toBe(1);
  expect(await drawn(page)).toBeNull();
  await page.screenshot({ path: 'output/playtest/gauntlet-knockout-fallback-390.png' });
  await seek(page, expected.fading);
  const fading = await drawn(page, true);
  expect(held!.width / fading!.width).toBeCloseTo(1.7, 12);
  expect(fading?.alpha).toBeCloseTo(0.5, 9);
  await seek(page, expected.gone);
  expect((await drawn(page, true))?.visible).toBe(false);
  await page.evaluate(() => window.__game.model.toggleReducedMotion());
  await seek(page, expected.held);
  expect((await drawn(page, true))?.visible).toBe(true);
  expect((await drawn(page, true))?.alpha).toBe(1);
});
