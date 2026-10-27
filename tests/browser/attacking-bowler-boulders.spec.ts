import { expect, test, type Page } from '@playwright/test';
import { bowlerBouldersRecording } from '../fixtures/bowler-boulders';

async function seek(page: Page, at: number, id: number, shotId?: string) {
  return page.evaluate(
    async ({ at, id, shotId }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const unit = model.battle.units.find((u) => u.id === id) ?? model.battle.units[0],
        { iso } = await import('/src/game/scene.ts'),
        projectile = model.battle.projectiles?.find((p) => p.id === shotId),
        t = projectile
          ? Math.max(
              0,
              Math.min(1, (at - projectile.launched) / (projectile.impact - projectile.launched)),
            )
          : 0,
        p = projectile
          ? iso(
              projectile.fromX + (projectile.x - projectile.fromX) * t,
              projectile.fromY + (projectile.y - projectile.fromY) * t,
            )
          : iso(unit.x, unit.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.1 : 1.5).centerOn(p.x, p.y - 40);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle, readOnly: battle === JSON.stringify(model.battle) };
    },
    { at, id, shotId },
  );
}

for (const { version, width } of [
  { version: 157, width: 390 },
  { version: 157, width: 1440 },
  { version: 156, width: 1440 },
  { version: 156, width: 390 },
])
  test(`native Bowler defender boulders at ${width}px, version=${version}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = bowlerBouldersRecording(version),
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
        throw Error('Boulder replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.id, r.shotId);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    const flight = await seek(page, r.flying, r.id, r.shotId);
    if (version === 157) {
      for (const { at, id, leg } of [
        { at: r.flying, id: r.shotId, leg: 'first' },
        { at: r.bounce!, id: r.bounceId!, leg: 'bounce' },
      ]) {
        await seek(page, at, r.id, id);
        await expect
          .poll(
            () =>
              page.evaluate((id) => {
                const scene = window.__game.scene;
                scene.drawOverlay(0);
                return (
                  scene.nativeProjectiles.views
                    .get(id)
                    ?.view.objects.some(
                      (o) =>
                        o.visible &&
                        o.alpha > 0 &&
                        typeof o.texture?.key === 'string' &&
                        o.texture.key !== '__MISSING',
                    ) ?? false
                );
              }, id),
            { timeout: 30000 },
          )
          .toBe(true);
        await page.screenshot({
          path: `output/playtest/attacking-bowler-boulder-${width}-${leg}.png`,
        });
      }
    } else {
      expect(
        await page.evaluate((id) => window.__game.scene.nativeProjectiles.views.has(id), r.shotId),
      ).toBe(false);
      expect(r.bounce).toBeUndefined();
    }
    expect(await seek(page, r.flying, r.id, r.shotId)).toEqual(flight);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      flight.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
