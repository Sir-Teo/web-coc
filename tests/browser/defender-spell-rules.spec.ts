import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const defender = model.battle.defenders.find(
      (defender) => defender.id === window.__defenderSpellRecording.defenderId,
    );
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(defender.x, defender.y);
    scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    return { hp: defender.hp, maxHp: defender.maxHp };
  }, at);
}

for (const kind of ['rootrider', 'electro-boots'] as const)
  for (const width of [1440, 390]) {
    test(`${kind} aura respects defending Hero rules at ${width}px`, async ({ page }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      if (width === 390) await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const times = await page.evaluate(async (kind) => {
        const { defenderSpellRuleRecording } =
          await import('/tests/fixtures/defender-spell-rules.ts');
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        const recording = defenderSpellRuleRecording(kind);
        window.__defenderSpellRecording = recording;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data)))))
          throw Error('Defender spell replay rejected');
        scene.sync();
        return { before: recording.before, hit: recording.hit };
      }, kind);
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      const before = await seek(page, times.before);
      const hit = await seek(page, times.hit);
      expect(before.hp - hit.hp).toBe(kind === 'rootrider' ? 0 : 13.25);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const id = window.__defenderSpellRecording.defenderId;
            const defenderDrawn = scene.children.list.some(
              (object) =>
                object.visible && object.alpha > 0 && object.getData?.('nativeHero') === id,
            );
            const owner = model.battle.units[0];
            const ownerDrawn = owner.hero
              ? scene.children.list.some(
                  (object) =>
                    object.visible &&
                    object.alpha > 0 &&
                    object.getData?.('nativeHero') === owner.id,
                )
              : scene.troopNativePresentation.drewUnit(owner.id);
            return defenderDrawn && ownerDrawn;
          }),
        )
        .toBe(true);
      await page.screenshot({ path: `output/playtest/defender-spell-${kind}-${width}.png` });
      expect(await seek(page, times.before)).toEqual(before);
      expect(await seek(page, times.hit)).toEqual(hit);
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.returnHome();
        if (!model.openReplay({ ...window.__defenderSpellRecording.data, version: 69 }))
          throw Error('Version 69 defender spell replay rejected');
        scene.sync();
      });
      expect((await seek(page, times.before)).hp - (await seek(page, times.hit)).hp).toBe(
        kind === 'rootrider' ? 4000 : 53,
      );
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
      expect(errors).toEqual([]);
    });
  }
