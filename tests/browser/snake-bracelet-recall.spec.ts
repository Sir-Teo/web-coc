import { expect, test, type Page } from '@playwright/test';
import { snakeBraceletRecallRecording } from '../fixtures/snake-bracelet';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((u) => u.hero === 'king'),
      snake = model.battle.units.find((u) => u.kind === 'snake');
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(
      ((unit?.x ?? 6.9) + (snake?.x ?? unit?.x ?? 6.9)) / 2,
      ((unit?.y ?? 11.5) + (snake?.y ?? unit?.y ?? 11.5)) / 2,
    );
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setZoom(innerWidth < 500 ? 1.1 : 1.5).centerOn(point.x, point.y - 40);
    const battle = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return { battle, readOnly: battle === JSON.stringify(model.battle) };
  }, at);
}

for (const { level, version, width } of [
  { level: 1, version: 144, width: 390 },
  { level: 27, version: 144, width: 1440 },
  { level: 1, version: 143, width: 1440 },
])
  test(`Snake Bracelet ${level} retains Recall progress at ${width}px, version=${version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = snakeBraceletRecallRecording(level, version),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Snake Bracelet replay rejected');
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at);
      expect(actual.battle).toBe(JSON.stringify(snapshot.battle));
      expect(actual.readOnly).toBe(true);
    }
    const spawned = await seek(page, r.spawned);
    expect(
      await page.evaluate(
        () => window.__game.model.battle.units.filter((u) => u.kind === 'snake').length,
      ),
    ).toBe(version === 144 ? 1 : 0);
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ heroId, snakeIds }) => {
              const scene = window.__game.scene;
              scene.drawOverlay(0);
              return (
                scene.children.list.some(
                  (o) =>
                    o.visible &&
                    o.alpha > 0 &&
                    o.getData?.('nativeHero') === heroId &&
                    o.texture?.key.startsWith('baked:heroes-native/'),
                ) &&
                snakeIds.every((id) =>
                  scene.troopNativePresentation.views
                    .get(id)
                    ?.view.objects.some(
                      (o) =>
                        o.visible &&
                        o.alpha > 0 &&
                        typeof o.texture?.key === 'string' &&
                        o.texture.key !== '__MISSING',
                    ),
                )
              );
            },
            { heroId: r.newId, snakeIds: r.snakeIds },
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/snake-bracelet-recall-${level}-${version}-${width}.png`,
    });
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      spawned.battle,
    );
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await seek(page, r.held);
    expect(await seek(page, r.spawned)).toEqual(spawned);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
