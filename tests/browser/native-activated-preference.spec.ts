import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__activatedPreference;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { activeAsDefense } = await import('/src/game/native-defenses.ts');
    const hall = model.battle.buildings.find((b) => b.id === r.hallId),
      before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return {
      battle: before,
      first: model.battle.units.find((u) => u.id === r.firstId)?.target,
      second: model.battle.units.find((u) => u.id === r.secondId)?.target,
      awake: activeAsDefense(model.battle, hall),
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}
for (const width of [390, 1440])
  test(`an Earthquake-woken Town Hall attracts a new Super Giant at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (e) => {
      if (e.type() === 'error') errors.push(e.text());
    });
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(async () => {
      const { nativeActivatedPreferenceRecording } =
        await import('/tests/fixtures/native-activated-preference.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = nativeActivatedPreferenceRecording();
      window.__activatedPreference = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Activation replay rejected');
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
      return {
        dormant: r.dormant,
        awake: r.awake,
        targeted: r.targeted,
        hallId: r.hallId,
        storageId: r.storageId,
        secondId: r.secondId,
      };
    });
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    expect(await seek(page, r.dormant)).toMatchObject({
      first: r.storageId,
      awake: false,
      unchanged: true,
      gl: 0,
    });
    expect(await seek(page, r.awake)).toMatchObject({
      first: r.storageId,
      awake: true,
      unchanged: true,
      gl: 0,
    });
    const targeted = await seek(page, r.targeted);
    expect(targeted).toMatchObject({
      first: r.storageId,
      second: r.hallId,
      awake: true,
      unchanged: true,
      gl: 0,
    });
    await page.evaluate(async () => {
      const { scene } = window.__game,
        { iso } = await import('/src/game/scene.ts');
      const point = iso(14.5, 11.5);
      scene.cameras.main.setZoom(1.3).centerOn(point.x, point.y - 90);
      scene.drawOverlay(0);
    });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.children.list.some(
        (o) =>
          o.getData?.('nativeVillage') === window.__activatedPreference.hallId &&
          o.visible &&
          o.alpha > 0,
      );
    });
    await page.waitForFunction(() => {
      const { scene } = window.__game;
      scene.drawOverlay(0);
      return scene.troopNativePresentation.drewUnit(window.__activatedPreference.secondId);
    });
    await page.screenshot({ path: `output/playtest/native-activated-preference-${width}.png` });
    await page.evaluate(() => {
      window.__game.model.state.settings.reducedMotion = true;
    });
    await seek(page, r.dormant);
    expect((await seek(page, r.targeted)).battle).toBe(targeted.battle);
    await page.evaluate(async () => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const data = JSON.parse(JSON.stringify(window.__activatedPreference.data));
      data.version = 105;
      const { model, scene } = window.__game;
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Version 105 replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.targeted)).toMatchObject({
      second: r.storageId,
      awake: true,
      unchanged: true,
      gl: 0,
    });
    expect(errors).toEqual([]);
  });
