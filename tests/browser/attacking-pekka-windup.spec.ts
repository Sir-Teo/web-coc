import { expect, test, type Page } from '@playwright/test';
import { attackingPekkaRecording } from '../fixtures/attacking-pekka';

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
  { version: 164, width: 390, siege: false, level: 1, x: 11.4 },
  { version: 164, width: 1440, siege: false, level: 13, x: 6.9 },
  { version: 164, width: 390, siege: true, level: 1, x: 11.4 },
  { version: 163, width: 1440, siege: false, level: 1, x: 11.4 },
  { version: 163, width: 390, siege: false, level: 13, x: 6.9 },
  { version: 163, width: 1440, siege: true, level: 1, x: 11.4 },
])
  test(`${c.siege ? 'Siege Barracks Pekka' : 'Pekka'} ${c.level} original windup at ${c.width}px, version=${c.version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    const r = attackingPekkaRecording(c.version, c.x, c.level, c.siege),
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
        throw Error('Pekka replay rejected');
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
    if (c.version === 164)
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
      path: `output/playtest/attacking-pekka-windup-${c.siege ? 'siege' : c.level}-${c.version}-${c.width}.png`,
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
