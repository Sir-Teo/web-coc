import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const defenders = model.battle.defenders.filter((defender) => defender.kind === 'hero');
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(defenders[0].x, defenders[0].y);
    scene.cameras.main.setZoom(2).centerOn(point.x, point.y - 30);
    scene.drawOverlay(0);
    return defenders.map((defender) => ({
      id: defender.id,
      position: [defender.x, defender.y],
      loss: defender.maxHp - defender.hp,
      cooldown: defender.cooldown,
    }));
  }, at);
}

for (const kind of ['dash', 'freeze'] as const)
  for (const width of [1440, 390]) {
    test(`${kind} defender combat and old replay rules at ${width}px`, async ({ page }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      if (width === 390) await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const times = await page.evaluate(async (kind) => {
        const recording =
          kind === 'dash'
            ? (
                await import('/tests/fixtures/equipment-dash-defenders.ts')
              ).equipmentDashDefenderRecording()
            : (
                await import('/tests/fixtures/defending-hero-freeze-time.ts')
              ).defendingHeroFreezeRecording();
        window.__defenderCombatRecording = recording;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(recording.data)) throw Error('Defender combat replay rejected');
        scene.sync();
        return {
          first: kind === 'dash' ? recording.before : recording.frozen,
          check: kind === 'dash' ? recording.crossed : recording.thaw,
          damage: kind === 'dash' ? recording.damage : 0,
        };
      }, kind);
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      const first = await seek(page, times.first);
      const checked = await seek(page, times.check);
      if (kind === 'dash')
        expect(checked.map((defender) => defender.loss)).toEqual([times.damage, times.damage]);
      else expect(checked).toEqual(first);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const ids = model.battle.defenders
              .filter((defender) => defender.kind === 'hero')
              .map((defender) => defender.id);
            const visible = scene.children.list.filter(
              (object) =>
                object.visible && object.alpha > 0 && object.getData?.('nativeHero') !== undefined,
            );
            return ids.every((id) => visible.some((object) => object.getData('nativeHero') === id));
          }),
        )
        .toBe(true);
      await page.screenshot({ path: `output/playtest/defender-combat-${kind}-${width}.png` });
      expect(await seek(page, times.first)).toEqual(first);
      expect(await seek(page, times.check)).toEqual(checked);
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.returnHome();
        if (!model.openReplay({ ...window.__defenderCombatRecording.data, version: 68 }))
          throw Error('Version 68 defender replay rejected');
        scene.sync();
      });
      const old = await seek(page, times.check);
      if (kind === 'dash')
        expect(old.map((defender) => defender.loss)).toEqual([times.damage * 2, times.damage * 2]);
      else expect(old[0].position).not.toEqual(checked[0].position);
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
      expect(errors).toEqual([]);
    });
  }
