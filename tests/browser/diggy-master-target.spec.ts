import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__diggyMaster;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const pet = model.battle.units.find((u) => u.id === r.petId);
    const master = model.battle.units.find((u) => u.id === r.masterId);
    const target = model.battle.buildings.find((b) => b.id === r.targetId);
    const { iso } = await import('/src/game/scene.ts');
    const champion = master.kind === 'royalchampion';
    const p = iso(champion ? 11.5 : target.x, target.y + 1);
    scene.cameras.main
      .setZoom(innerWidth === 390 ? (champion ? 0.7 : 0.85) : 1.5)
      .centerOn(p.x, p.y - 40);
    scene.drawOverlay(0);
    return {
      x: pet.x,
      y: pet.y,
      target: pet.target,
      defenderTarget: pet.defenderTarget,
      masterTarget: master.native?.wallTarget ?? master.defenderTarget ?? master.target,
      masterWall: master.native?.wallTarget,
      masterDefender: master.defenderTarget,
      kind: target.kind,
      hp: target.hp,
      maxHp: target.maxHp,
      until: model.battle.defenseStuns[target.id],
    };
  }, at);
}

for (const { mode, width } of [
  { mode: 'wall' as const, width: 1440 },
  { mode: 'defense' as const, width: 390 },
  { mode: 'defender-wall' as const, width: 390 },
]) {
  test(`Diggy follows the actual ${mode} Hero target at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const times = await page.evaluate(async (mode) => {
      const { diggyMasterRecording } = await import('/tests/fixtures/diggy-master-target.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = diggyMasterRecording(mode);
      window.__diggyMaster = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Diggy master replay rejected');
      scene.sync();
      return { moving: r.moving, hit: r.hit, following: r.following, targetId: r.targetId };
    }, mode);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const hit = await seek(page, times.hit);
    expect(hit.target).toBe(times.targetId);
    expect(hit.masterTarget).toBe(times.targetId);
    expect(hit.hp).toBeLessThan(hit.maxHp);
    if (mode !== 'defense') {
      expect(hit.kind).toBe('wall');
      expect(hit.masterWall).toBe(times.targetId);
    } else expect(hit.kind).toBe('cannon');
    if (mode === 'defender-wall') expect(typeof hit.masterDefender).toBe('number');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.children.list.some(
            (o) =>
              o.visible &&
              o.alpha > 0 &&
              o.getData?.('nativeHero') === window.__diggyMaster.petId &&
              o.texture?.key.startsWith('baked:heroes-native/diggy/'),
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/diggy-master-${mode}-${width}.png` });
    const following = await seek(page, times.following);
    expect(following.target).toBe(times.targetId);
    if (mode === 'defense') expect(following.until).toBeGreaterThan(times.following);
    await seek(page, times.moving);
    expect(await seek(page, times.hit)).toEqual(hit);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, times.following)).toEqual(following);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__diggyMaster.data, version: 90 }))
        throw Error('Legacy Diggy master replay rejected');
    });
    const old = await seek(page, times.following);
    expect(old.target).toBe(mode === 'defense' ? 3 : mode === 'wall' ? 1 : null);
    if (mode === 'defender-wall') expect(typeof old.defenderTarget).toBe('number');
    expect(old.target).not.toBe(times.targetId);
    if (mode === 'defense') expect(old.until).toBeUndefined();
    else expect(old.hp).toBeGreaterThan(following.hp);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
