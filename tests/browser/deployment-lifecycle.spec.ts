import { expect, test, type Page } from '@playwright/test';
import { deploymentLifecycleRecording } from '../fixtures/deployment-lifecycle';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const unit = model.battle.units.find((u) => u.id === id) ?? model.battle.units[0],
        { iso } = await import('/src/game/scene.ts'),
        p = iso(unit.x, unit.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.1 : 1.5).centerOn(p.x, p.y - 40);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle, readOnly: battle === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

for (const { kind, width, version } of [
  { kind: 'furnace', width: 390, version: 149 },
  { kind: 'siegebarracks', width: 1440, version: 149 },
  { kind: 'druid', width: 390, version: 149 },
  { kind: 'furnace', width: 1440, version: 148 },
  { kind: 'siegebarracks', width: 390, version: 148 },
  { kind: 'druid', width: 1440, version: 148 },
] as const)
  test(`${kind} delayed lifecycle at ${width}px, version=${version}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = deploymentLifecycleRecording(kind, version),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Delayed deployment replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    const visibleAt = kind === 'druid' ? r.evolved : r.children,
      visible = await seek(page, visibleAt, r.id);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const scene = window.__game.scene;
            scene.drawOverlay(0);
            return (
              scene.troopNativePresentation.views
                .get(id)
                ?.view.objects.some(
                  (o) =>
                    o.visible &&
                    o.alpha > 0 &&
                    typeof o.texture?.key === 'string' &&
                    o.texture.key !== '__MISSING',
                ) ?? false
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/deployment-lifecycle-${kind}-${version}-${width}.png`,
    });
    if (kind !== 'druid') {
      await expect
        .poll(
          () =>
            page.evaluate((id) => {
              const { model, scene } = window.__game;
              scene.drawOverlay(0);
              return model.battle.units
                .filter((u) => u.native?.owner === id)
                .every((u) =>
                  scene.troopNativePresentation.views
                    .get(u.id)
                    ?.view.objects.some(
                      (o) =>
                        o.visible &&
                        o.alpha > 0 &&
                        typeof o.texture?.key === 'string' &&
                        o.texture.key !== '__MISSING',
                    ),
                );
            }, r.id),
          { timeout: 30000 },
        )
        .toBe(true);
    }
    await seek(page, r.entered, r.id);
    expect(await seek(page, visibleAt, r.id)).toEqual(visible);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      visible.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
