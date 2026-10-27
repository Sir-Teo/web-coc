import { expect, test, type Page } from '@playwright/test';
import { attackingBowlerRecording } from '../fixtures/attacking-bowler';

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

for (const { version, x, width } of [
  { version: 156, x: 11.4, width: 390 },
  { version: 156, x: 6.9, width: 1440 },
  { version: 155, x: 11.4, width: 1440 },
  { version: 155, x: 6.9, width: 390 },
])
  test(`attacking Bowler windup from x=${x} at ${width}px, version=${version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = attackingBowlerRecording(version, x),
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
        throw Error('Bowler windup replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    const phase = await seek(page, r.engaged, r.id);
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
      path: `output/playtest/attacking-bowler-windup-${version}-${width}-${x}.png`,
    });
    await seek(page, r.third, r.id);
    expect(await seek(page, r.engaged, r.id)).toEqual(phase);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      phase.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
