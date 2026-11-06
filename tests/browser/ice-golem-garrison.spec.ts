import { expect, test, type Page } from '@playwright/test';
import { iceGolemGarrisonRecording } from '../fixtures/ice-golem-garrison';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const defender = model.battle.defenders.find((d) => d.id === id);
      const { iso } = await import('/src/game/scene.ts');
      const point = iso(defender.x, defender.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.5 : 2).centerOn(point.x, point.y - 40);
      const before = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return {
        battle: JSON.parse(JSON.stringify(model.battle)),
        readOnly: before === JSON.stringify(model.battle),
      };
    },
    { at, id },
  );
}
for (const width of [1440, 390])
  test(`Ice Golem defender, native death-freeze and reverse seeks at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = iceGolemGarrisonRecording(),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Ice Golem replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const checkpoint of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const actual = await seek(page, checkpoint.at, r.id);
      expect(actual.battle).toEqual(checkpoint.battle);
      expect(actual.readOnly).toBe(true);
    }
    await seek(page, r.melee, r.id);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            return (
              scene.garrisonPresentation.defenders
                .get(id)
                ?.objects.some(
                  (o) =>
                    o.visible && o.alpha > 0 && o.texture?.key.includes('character-icegolem-lvl5'),
                ) ?? false
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/ice-golem-defender-${width}.png` });
    await seek(page, r.frozen, r.id);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const { scene, model } = window.__game;
            scene.drawOverlay(0);
            return model.battle.units
              .filter((u) => (u.native?.effects?.frozenUntil ?? 0) > model.battle.elapsed)
              .some((u) =>
                scene.troopNativePresentation.views
                  .get(u.id)
                  ?.view.objects.some(
                    (o) =>
                      o.visible &&
                      o.alpha > 0 &&
                      (o.vertices !== undefined || o.nativeColored ? o.tint : o.tintTopLeft) ===
                        0xa8e6ff,
                  ),
              );
          }),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/ice-golem-defensive-freeze-${width}.png` });
    const unchanged = await page.evaluate(() => {
      const { model, scene } = window.__game;
      const before = JSON.stringify(model.battle);
      model.toggleReducedMotion();
      scene.drawOverlay(0);
      return before === JSON.stringify(model.battle);
    });
    expect(unchanged).toBe(true);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
