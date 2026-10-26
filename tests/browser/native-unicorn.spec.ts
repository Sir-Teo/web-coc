import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__unicorn;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const battle = model.battle;
    const hero = battle.units.find((u) => u.id === r.heroId);
    const pet = battle.units.find((u) => u.id === r.petId);
    const giant = battle.units.find((u) => u.id === r.giantId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(hero.x, hero.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.15 : 1.65).centerOn(point.x, point.y - 60);
    const before = JSON.stringify(battle);
    scene.drawOverlay(0);
    const sprite = scene.heroNativePresentation.sprites.get(pet.id);
    return {
      target: pet.healTarget ?? null,
      fullHero: hero.hp === hero.maxHp,
      hurtGiant: giant.hp > 0 && giant.hp < giant.maxHp,
      visible: !!sprite?.visible,
      texture: sprite?.texture.key ?? null,
      unchanged: before === JSON.stringify(battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}

for (const { kind, level, width } of [
  { kind: 'king' as const, level: 1, width: 390 },
  { kind: 'warden' as const, level: 15, width: 1440 },
]) {
  test(`Unicorn ${level} keeps its ${kind} Hero through replay seeks at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = await page.evaluate(
      async ({ kind, level }) => {
        const { nativeUnicornRecording } = await import('/tests/fixtures/native-unicorn.ts');
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        const r = nativeUnicornRecording(kind, level);
        window.__unicorn = r;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
          throw Error('Unicorn replay rejected');
        scene.sync();
        scene.drawOverlay(0);
        return {
          initial: r.initial,
          wounded: r.wounded,
          following: r.following,
          heroId: r.heroId,
          giantId: r.giantId,
        };
      },
      { kind, level },
    );
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const initial = await seek(page, r.initial);
    expect(initial.target).toBe(r.heroId);
    const wounded = await seek(page, r.wounded);
    expect(wounded).toMatchObject({
      target: r.heroId,
      fullHero: true,
      hurtGiant: true,
      visible: true,
      unchanged: true,
      gl: 0,
    });
    expect(wounded.texture).toMatch(/^baked:heroes-native\/unicorn\//);
    const following = await seek(page, r.following);
    expect(following.target).toBe(r.heroId);
    await page.screenshot({ path: `output/playtest/unicorn-${kind}-${level}-${width}.png` });
    expect(await seek(page, r.wounded)).toEqual(wounded);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, r.following)).toEqual(following);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      const old = structuredClone(window.__unicorn.data);
      old.version = 98;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(old)))))
        throw Error('Historical Unicorn replay rejected');
      scene.sync();
    });
    const old = await seek(page, r.wounded);
    expect(old.target).toBe(r.giantId);
    expect(old.fullHero && old.hurtGiant && old.unchanged).toBe(true);
    expect(old.gl).toBe(0);
    expect(errors).toEqual([]);
  });
}
