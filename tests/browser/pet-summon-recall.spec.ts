import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game,
      r = window.__petRecall;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const child = model.battle.units.find((u) => u.id === r.childIds[0]);
    const { iso } = await import('/src/game/scene.ts');
    const p = iso(child.x, child.y);
    scene.cameras.main.setZoom(1.4).centerOn(p.x, p.y - 60);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return {
      battle: before,
      children: model.battle.units.filter((u) => u.kind === 'booger' && u.hp > 0).length,
      pending: model.battle.nativePendingSpawns?.filter((p) => p.kind === 'booger').length ?? 0,
      owner: model.battle.nativeHeroes[0].petSummonerId ?? null,
      petId: model.battle.nativeHeroes[0].petId,
      unchanged: before === JSON.stringify(model.battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}

for (const { width, level } of [
  { width: 390, level: 1 },
  { width: 1440, level: 10 },
]) {
  test(`Sneezy preserves living Boogers and its summon cap through Recall at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (entry) => {
      if (entry.type() === 'error') errors.push(entry.text());
    });
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(async (level) => {
      const { petSummonRecallRecording } = await import('/tests/fixtures/pet-summon-recall.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = petSummonRecallRecording(level);
      window.__petRecall = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Pet summon Recall replay rejected');
      scene.sync();
      scene.drawOverlay(0);
      return {
        full: r.full,
        recalled: r.recalled,
        blocked: r.blocked,
        oldPetId: r.oldPetId,
        petId: r.petId,
      };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const full = await seek(page, r.full);
    expect(full).toMatchObject({
      children: 2,
      pending: 0,
      owner: r.oldPetId,
      unchanged: true,
      gl: 0,
    });
    const recalled = await seek(page, r.recalled);
    expect(recalled).toMatchObject({
      children: 2,
      pending: 0,
      petId: null,
      unchanged: true,
      gl: 0,
    });
    await page.waitForFunction(() => {
      const scene = window.__game.scene;
      scene.drawOverlay(0);
      return window.__petRecall.childIds.every(
        (id) => scene.heroNativePresentation.sprites.get(id)?.visible,
      );
    });
    const textures = await page.evaluate(() =>
      window.__petRecall.childIds.map(
        (id) => window.__game.scene.heroNativePresentation.sprites.get(id).texture.key,
      ),
    );
    expect(textures.every((key) => key.startsWith('baked:heroes-native/booger/'))).toBe(true);
    await page.screenshot({ path: `output/playtest/pet-summon-recall-${width}.png` });
    const blocked = await seek(page, r.blocked);
    expect(blocked).toMatchObject({
      children: 2,
      pending: 0,
      owner: r.oldPetId,
      petId: r.petId,
      unchanged: true,
      gl: 0,
    });
    expect(await seek(page, r.full)).toEqual(full);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, r.blocked)).toEqual(blocked);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      const data = structuredClone(window.__petRecall.data);
      data.version = 102;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Historical pet Recall replay rejected');
      scene.sync();
    });
    expect(await seek(page, r.blocked)).toMatchObject({
      children: 2,
      pending: 1,
      owner: null,
      unchanged: true,
      gl: 0,
    });
    expect(errors).toEqual([]);
  });
}
