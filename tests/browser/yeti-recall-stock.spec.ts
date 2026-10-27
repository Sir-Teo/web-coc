import { expect, test, type Page } from '@playwright/test';
import { yetiRecallRecording } from '../fixtures/yeti-recall';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((u) => u.kind === 'yeti' || u.kind === 'superyeti'),
      child = model.battle.units.find((u) => u.kind === 'yetimite' || u.kind === 'electromite');
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(
      ((unit?.x ?? 6.9) + (child?.x ?? unit?.x ?? 6.9)) / 2,
      ((unit?.y ?? 11.5) + (child?.y ?? unit?.y ?? 11.5)) / 2,
    );
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setZoom(innerWidth < 500 ? 1.1 : 1.5).centerOn(point.x, point.y - 40);
    const battle = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return { battle, readOnly: battle === JSON.stringify(model.battle) };
  }, at);
}

for (const { kind, level, version, width } of [
  { kind: 'yeti', level: 1, version: 145, width: 390 },
  { kind: 'yeti', level: 8, version: 145, width: 1440 },
  { kind: 'superyeti', level: 1, version: 145, width: 1440 },
  { kind: 'superyeti', level: 8, version: 145, width: 390 },
  { kind: 'yeti', level: 1, version: 144, width: 1440 },
  { kind: 'superyeti', level: 8, version: 144, width: 390 },
] as const)
  test(`${kind} ${level} retains its Recall stock at ${width}px, version=${version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = yetiRecallRecording(kind, level, version),
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
        throw Error('Yeti Recall replay rejected');
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
        (kind) => window.__game.model.battle.units.filter((u) => u.kind === kind).length,
        kind === 'yeti' ? 'yetimite' : 'electromite',
      ),
    ).toBe(version === 145 ? 1 : 0);
    await expect
      .poll(
        () =>
          page.evaluate(
            (ids) => {
              const scene = window.__game.scene;
              scene.drawOverlay(0);
              return ids.every((id) =>
                scene.troopNativePresentation.views
                  .get(id)
                  ?.view.objects.some(
                    (o) =>
                      o.visible &&
                      o.alpha > 0 &&
                      typeof o.texture?.key === 'string' &&
                      o.texture.key !== '__MISSING',
                  ),
              );
            },
            [r.newId, ...r.childIds],
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/yeti-recall-${kind}-${level}-${version}-${width}.png`,
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
