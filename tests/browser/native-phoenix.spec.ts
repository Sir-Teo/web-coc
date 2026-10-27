import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene, hud } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const b = model.battle,
      owner = b.nativeHeroes[0];
    const hero = b.units.find((u) => u.id === owner.unitId);
    const bird = b.units.find((u) => u.id === owner.petId);
    const egg = b.units.find((u) => u.id === owner.phoenix?.eggId);
    const { iso } = await import('/src/game/scene.ts');
    const { phoenixLifeFraction } = await import('/src/game/native-status.ts');
    const point = iso(hero?.x ?? bird?.x ?? 8, hero?.y ?? bird?.y ?? 6.5);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.15 : 1.7).centerOn(point.x, point.y - 50);
    scene.drawOverlay(0);
    const card = document.createElement('div');
    card.innerHTML = hud.nativeHeroCard('king');
    const bar = card.querySelector('.hero-health i');
    const packet = b.projectiles?.find((p) => p.native?.phoenixRevive);
    return {
      hp: hero?.hp ?? null,
      hasEgg: !!egg,
      waitingBird: !!bird?.native?.phoenixWaiting,
      birdAlive: !!bird && bird.hp > 0,
      pending: !!owner.phoenix?.pending,
      used: !!owner.phoenix?.used,
      life: hero ? (phoenixLifeFraction(hero, b.elapsed) ?? null) : null,
      until: hero?.native?.effects?.phoenixRevive?.until ?? null,
      paused: owner.phoenix?.pausedRevive ?? null,
      shot: packet?.native?.name ?? null,
      text: card.querySelector('.troop-name').textContent,
      width: parseFloat(bar.style.width),
      color: bar.style.backgroundColor,
    };
  }, at);
}

for (const { level, recall, width } of [
  { level: 1, recall: false, width: 390 },
  { level: 10, recall: false, width: 1440 },
  { level: 5, recall: true, width: 390 },
]) {
  test(`Phoenix ${level} revives once with Recall=${recall} at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const requested: string[] = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(
      async ({ level, recall }) => {
        const { nativePhoenixRecording } = await import('/tests/fixtures/native-phoenix.ts');
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        const r = nativePhoenixRecording(level, recall);
        window.__phoenix = r;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
          throw Error('Phoenix replay rejected');
        scene.sync();
        return {
          waiting: r.waiting,
          inFlight: r.inFlight,
          revived: r.revived,
          until: r.revivedUntil,
          expired: r.expired,
          recalled: r.recalled,
          held: r.held,
          redeployed: r.redeployed,
        };
      },
      { level, recall },
    );
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const waiting = await seek(page, r.waiting);
    expect(waiting.hasEgg && waiting.waitingBird).toBe(true);
    expect(waiting.used).toBe(false);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          const r = window.__phoenix;
          const egg = scene.heroNativePresentation.sprites.get(r.eggId);
          const bird = scene.heroNativePresentation.sprites.get(r.initialBirdId);
          return (
            egg?.visible &&
            egg.texture.key === 'baked:heroes-native/phoenixegg/walk.png' &&
            !bird?.visible
          );
        }),
      )
      .toBe(true);
    expect(requested).toContain('/assets/projectiles-native/phoenixresurrect/graph.json');
    await page.screenshot({ path: `output/playtest/phoenix-${level}-${recall}-${width}-egg.png` });
    const inFlight = await seek(page, r.inFlight);
    expect(inFlight.hp).toBeLessThanOrEqual(0);
    expect(inFlight.shot).toBe('PhoenixResurrect');
    expect(inFlight.pending && inFlight.used && !inFlight.hasEgg).toBe(true);
    expect(inFlight.text).toBe('Reviving');
    const revived = await seek(page, r.revived);
    expect(revived.hp).toBe(1);
    expect(revived.life).toBeGreaterThan(0.95);
    expect(revived.text).toBe('Phoenix revival');
    expect(revived.color).toBe('rgb(255, 242, 191)');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          scene.drawOverlay(0);
          const id = model.battle.nativeHeroes[0].petId;
          const sprite = scene.heroNativePresentation.sprites.get(id);
          return !!sprite?.visible && sprite.texture.key.startsWith('baked:heroes-native/phoenix/');
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/phoenix-${level}-${recall}-${width}-revived.png`,
    });
    if (recall) {
      const recalled = await seek(page, r.recalled);
      const held = await seek(page, r.held);
      expect(recalled.hp).toBeNull();
      expect(held.paused).toBe(recalled.paused);
      expect(held.width).toBe(recalled.width);
      expect(held.text).toBe('Deploy King');
      const back = await seek(page, r.redeployed);
      expect(back.hp).toBe(1);
      expect(back.hasEgg).toBe(false);
      expect(back.until).toBeCloseTo(r.until, 10);
    }
    const expired = await seek(page, r.expired);
    expect(expired.hp).toBe(0);
    expect(expired.life).toBeNull();
    expect(expired.text).toBe('Defeated');
    expect(expired.birdAlive).toBe(true);
    expect(await seek(page, r.waiting)).toEqual(waiting);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, r.revived)).toEqual(revived);
    expect(await seek(page, r.expired)).toEqual(expired);
    if (!recall) {
      await page.evaluate(() => {
        const { model } = window.__game;
        model.returnHome();
        if (!model.openReplay({ ...window.__phoenix.data, version: 94 }))
          throw Error('Old Phoenix replay rejected');
      });
      const old = await seek(page, r.waiting);
      expect(old.hasEgg || old.waitingBird || old.used).toBe(false);
    }
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
