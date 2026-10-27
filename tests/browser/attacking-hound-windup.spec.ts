import { expect, test, type Page } from '@playwright/test';
import { attackingHoundRecording } from '../fixtures/attacking-hound';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const { iso } = await import('/src/game/scene.ts'),
        unit = model.battle.units.find((u) => u.id === id),
        p = iso(unit.x, unit.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.25 : 1.7).centerOn(p.x, p.y - 40);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle, readOnly: battle === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}
for (const c of [
  { version: 169, width: 390, ice: false, level: 1, x: 17.6 },
  { version: 169, width: 1440, ice: false, level: 8, x: 23.1 },
  { version: 169, width: 390, ice: true, level: 8, x: 23.1 },
  { version: 169, width: 1440, ice: true, level: 1, x: 17.6 },
  { version: 168, width: 1440, ice: false, level: 1, x: 17.6 },
  { version: 168, width: 390, ice: false, level: 8, x: 23.1 },
  { version: 168, width: 1440, ice: true, level: 8, x: 23.1 },
  { version: 168, width: 390, ice: true, level: 1, x: 17.6 },
])
  test(`${c.ice ? 'Ice Hound' : 'Lava Hound'} ${c.level} original windup at ${c.width}px, version=${c.version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    const r = attackingHoundRecording(c.version, c.x, c.level, c.ice),
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
        throw Error('Hound replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    if (c.version === 169 && !c.ice) {
      await seek(page, r.flying!, r.id);
      await expect
        .poll(
          () =>
            page.evaluate((shotId) => {
              const scene = window.__game.scene;
              scene.drawOverlay(0);
              return (
                scene.nativeProjectiles.views
                  .get(shotId)
                  ?.view.objects.some(
                    (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                  ) ?? false
              );
            }, r.shotId!),
          { timeout: 30000 },
        )
        .toBe(true);
    }
    const at = r.charged ?? r.first,
      windup = await seek(page, at, r.id);
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
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                ) ?? false
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    if (c.version === 169)
      expect(
        await page.evaluate(
          (id) =>
            window.__game.model.battle.units.find((u) => u.id === id).native.attackWindup
              .animationOffset,
          r.id,
        ),
      ).toBeLessThan(0);
    else
      expect(
        await page.evaluate(
          (id) => window.__game.model.battle.units.find((u) => u.id === id).native?.attackWindup,
          r.id,
        ),
      ).toBeUndefined();
    await page.screenshot({
      path: `output/playtest/attacking-hound-windup-${c.ice ? 'ice' : 'lava'}-${c.level}-${c.version}-${c.width}.png`,
    });
    await seek(page, r.engaged, r.id);
    expect(await seek(page, at, r.id)).toEqual(windup);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      windup.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
