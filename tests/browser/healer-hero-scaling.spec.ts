import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__healerScaling;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const battle = model.battle;
    const hero = battle.units.find((u) => u.id === r.heroId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(hero.x, hero.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.2 : 1.7).centerOn(point.x, point.y - 60);
    scene.cameras.main.preRender();
    const before = JSON.stringify(battle);
    scene.drawOverlay(0);
    return {
      hp: hero.hp,
      scale: battle.projectiles?.find((p) => p.weapon === 'healing')?.healingHeroScale ?? null,
      visible: !!scene.heroNativePresentation.sprites.get(hero.id)?.visible,
      unchanged: before === JSON.stringify(battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}

for (const { level, width, ratio, gain, oldGain, hps } of [
  { level: 5, width: 390, ratio: 0.67, gain: 33.768, oldGain: 27.72, hps: '48.24' },
  { level: 11, width: 1440, ratio: 1.08, gain: 61.992, oldGain: 31.57, hps: '88.56' },
]) {
  test(`Healer ${level} Hero recovery and inspection match its source tier at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(async (level) => {
      const { healerHeroScalingRecording } = await import('/tests/fixtures/healer-hero-scaling.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = healerHeroScalingRecording(level, 98);
      window.__healerScaling = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Healer scaling replay rejected');
      scene.sync();
      scene.drawOverlay(0);
      return { initial: r.initial, before: r.before, healed: r.healed };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const initial = await seek(page, r.initial);
    expect(initial.scale).toBe(ratio);
    const before = await seek(page, r.before);
    expect(before.scale).toBe(ratio);
    const healed = await seek(page, r.healed);
    expect(healed.hp - before.hp).toBeCloseTo(gain, 8);
    expect(healed.visible && healed.unchanged).toBe(true);
    expect(healed.gl).toBe(0);
    await page.screenshot({ path: `output/playtest/healer-hero-scaling-${level}-${width}.png` });
    expect(await seek(page, r.before)).toEqual(before);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, r.healed)).toEqual(healed);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      const old = structuredClone(window.__healerScaling.data);
      old.version = 97;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(old)))))
        throw Error('Historical Healer replay rejected');
      scene.sync();
    });
    const olderBefore = await seek(page, r.before);
    expect(olderBefore.scale).toBeNull();
    const olderHealed = await seek(page, r.healed);
    expect(olderHealed.hp - olderBefore.hp).toBeCloseTo(oldGain, 8);
    const historicalInfo = await page.evaluate(() => {
      const { hud } = window.__game;
      hud.inspectedTroop = 'healer';
      const panel = document.createElement('div');
      panel.innerHTML = hud.troopInfo();
      return panel.textContent;
    });
    expect(historicalInfo).toContain('Heroes receive 55% healing');
    const info = await page.evaluate(
      ({ level }) => {
        const { model, hud } = window.__game;
        model.returnHome();
        model.state.troopLevels = { ...model.state.troopLevels, healer: level, druid: 6 };
        function text(kind: string) {
          hud.inspectedTroop = kind;
          const panel = document.createElement('div');
          panel.innerHTML = hud.troopInfo();
          return panel.textContent;
        }
        return { healer: text('healer'), druid: text('druid') };
      },
      { level },
    );
    expect(info.healer).toContain(`Hero healing per second${hps}`);
    expect(info.healer).toContain(`Heroes receive ${Math.round(ratio * 100)}% healing`);
    expect(info.druid).toContain('Hero healing per second132.25');
    expect(info.druid).toContain('Heroes receive 115% healing');
    expect(info.druid).toContain('Friendly ground and air troops');
    expect(errors).toEqual([]);
  });
}
