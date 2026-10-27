import { expect, test } from '@playwright/test';
import { nativeEquipmentFlightRecording } from '../fixtures/native-equipment-flight';

for (const equipment of ['frost-charm', 'seeking-shield'] as const)
  test(`${equipment} moving-target trail agrees between played frames and a cold portable seek`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = nativeEquipmentFlightRecording(equipment);
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (r) => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Moving-target replay rejected');
      model.seekReplay(r.observation);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const { iso } = await import('/src/game/scene.ts');
      const point = iso(12, 11.5);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.centerOn(point.x, point.y - 50);
      scene.drawOverlay(0);
    }, r);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const scene = window.__game.scene;
            scene.drawOverlay(0);
            return scene.nativeProjectiles.layer.trailPoints.get(`${id}:trail`)?.size ?? 0;
          }, r.shotId),
        { timeout: 30000 },
      )
      .toBeGreaterThan(0);
    const result = await page.evaluate((r) => {
      const { model, scene } = window.__game;
      const points = () => [
        ...(scene.nativeProjectiles.layer.trailPoints.get(`${r.shotId}:trail`) ?? []),
      ];
      let unchanged = true;
      const played = (drawEvery: number) => {
        model.seekReplay(0);
        while (model.replay.seeking) model.step(0.05);
        scene.nativeProjectiles.clear();
        model.replay.paused = false;
        let frames = 0;
        while (model.battle.elapsed < r.observation - 1e-9) {
          model.step(0.05);
          if (++frames % drawEvery && model.battle.elapsed < r.observation - 1e-9) continue;
          model.changed();
          scene.sync();
          const before = JSON.stringify(model.battle);
          scene.drawOverlay(0);
          unchanged &&= before === JSON.stringify(model.battle);
        }
        model.replay.paused = true;
        return { points: points(), battle: JSON.stringify(model.battle) };
      };
      const dense = played(1),
        live = dense.points,
        battle = dense.battle;
      scene.nativeProjectiles.clear();
      scene.drawOverlay(0);
      const cold = points();
      model.seekReplay(0.1);
      while (model.replay.seeking) model.step(0.05);
      model.seekReplay(r.observation);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
      const sought = points(),
        soughtBattle = JSON.stringify(model.battle);
      const sparse = played(4);
      return {
        live,
        cold,
        sought,
        sparse,
        battle,
        unchanged,
        soughtBattle,
        readOnly: battle === JSON.stringify(model.battle),
        gl: window.__game.game.renderer.gl.getError(),
      };
    }, r);
    expect(result.live.length).toBeGreaterThan(0);
    expect(result.cold).toEqual(result.live);
    expect(result.sought).toEqual(result.live);
    expect(result.sparse.points).toEqual(result.live);
    expect(result.sparse.battle).toBe(result.battle);
    expect(result.battle).toBe(JSON.stringify(r.battle));
    expect(result.soughtBattle).toBe(result.battle);
    expect(result.unchanged && result.readOnly).toBe(true);
    expect(result.gl).toBe(0);
  });
