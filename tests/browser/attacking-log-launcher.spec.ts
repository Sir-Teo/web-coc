import { expect, test, type Page } from '@playwright/test';
import { logLauncherRecording } from '../fixtures/attacking-log-launcher';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game,
        { iso } = await import('/src/game/scene.ts');
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const unit = model.battle.units.find((u) => u.id === id),
        point = iso(unit.x + 3, unit.y),
        before = JSON.stringify(model.battle);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.4 : 2).centerOn(point.x, point.y - 45);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

for (const c of [
  { level: 1, version: 224, x: 5, width: 390 },
  { level: 6, version: 224, x: 7, width: 1440 },
  { level: 6, version: 223, x: 5, width: 390 },
  { level: 1, version: 223, x: 7, width: 1440 },
] as const)
  test(`Log Launcher ${c.level}, replay${c.version} at${c.width}`, async ({ page }) => {
    test.setTimeout(180000);
    const r = logLauncherRecording(c.level, c.version, c.x),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Log Launcher replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.readOnly).toBe(true);
    }
    await seek(page, 1.5, r.id);
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ id, version }) => {
              const { scene, model } = window.__game;
              scene.drawOverlay(0);
              const visible = (v) =>
                v?.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                );
              const body = scene.troopNativePresentation.views.get(id),
                shotId =
                  version >= 224
                    ? model.battle.nativeRollingLogs[0].id
                    : model.battle.projectiles[0].id;
              return (
                body?.kind === 'loglauncher' &&
                visible(body) &&
                visible(scene.nativeProjectiles.views.get(shotId))
              );
            },
            { id: r.id, version: c.version },
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    if (c.version >= 224) {
      // Exercise cached presentation changing from a full flight to an early stop.
      await seek(page, 3.5, r.id);
      const stopped = await page.evaluate(() => {
        const { model, scene } = window.__game;
        const shot = model.battle.nativeRollingLogs[0];
        return {
          length: shot.length,
          cached: scene.nativeProjectiles.history.get(shot.id)?.piercing?.length,
        };
      });
      expect(stopped.length).toBeLessThan(20);
      expect(stopped.cached).toBe(stopped.length);
      await seek(page, 1.5, r.id);
    }
    await page.screenshot({
      path: `output/playtest/log-launcher-${c.level}-${c.version}-${c.width}.png`,
      animations: 'disabled',
    });
    const last = await seek(page, r.snapshots.at(-1)!.at, r.id);
    expect(await page.evaluate(() => !!window.__game.model.battle.nativeLogLauncherPiercing)).toBe(
      c.version >= 224,
    );
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
