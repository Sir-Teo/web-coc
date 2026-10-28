import { expect, test, type Page } from '@playwright/test';
import { attackingGiantRecording } from '../fixtures/attacking-giant';

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
  { version: 171, width: 390, superTroop: false, level: 1, x: 11.4 },
  { version: 171, width: 1440, superTroop: false, level: 14, x: 6.9 },
  { version: 171, width: 390, superTroop: true, level: 1, x: 11.4 },
  { version: 171, width: 1440, superTroop: true, level: 10, x: 6.9 },
  { version: 170, width: 1440, superTroop: false, level: 1, x: 11.4 },
  { version: 170, width: 390, superTroop: true, level: 10, x: 6.9 },
])
  test(`${c.superTroop ? 'Super Giant' : 'Giant'} ${c.level} source swing at ${c.width}px, version=${c.version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    const r = attackingGiantRecording(c.version, c.x, c.level, c.superTroop),
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
        throw Error('Giant replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
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
    const offset = await page.evaluate(
      (id) =>
        window.__game.model.battle.units.find((u) => u.id === id).native?.attackWindup
          ?.animationOffset,
      r.id,
    );
    if (c.version >= 171) expect(offset).toBeLessThan(0);
    else expect(offset).toBeUndefined();
    await page.screenshot({
      path: `output/playtest/attacking-giant-windup-${c.superTroop ? 'super' : 'normal'}-${c.level}-${c.version}-${c.width}.png`,
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
