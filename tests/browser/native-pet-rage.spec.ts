import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__yak;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const battle = model.battle;
    const pet = battle.units.find((u) => u.id === r.petId);
    const hero = battle.units.find((u) => u.id === r.heroId);
    const { iso } = await import('/src/game/scene.ts');
    const { unitDamageScale, unitSpeedBonus } = await import('/src/game/native-status.ts');
    const point = iso(pet.x, pet.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.2 : 1.7).centerOn(point.x, point.y - 60);
    const before = JSON.stringify(battle);
    scene.drawOverlay(0);
    const sprite = scene.heroNativePresentation.sprites.get(pet.id);
    return {
      heroDown: hero.hp <= 0,
      petAlive: pet.hp > 0,
      used: !!battle.nativeHeroes[0].petHeroDeathUsed,
      damage: unitDamageScale(pet, battle.elapsed),
      speed: unitSpeedBonus(pet, battle.elapsed),
      visible: !!sprite?.visible,
      texture: sprite?.texture.key ?? null,
      tint: sprite?.tintTopLeft ?? null,
      unchanged: before === JSON.stringify(battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}

for (const { level, width } of [
  { level: 1, width: 390 },
  { level: 15, width: 1440 },
])
  test(`Mighty Yak ${level} self-rage survives source replay seeks at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const times = await page.evaluate(async (level) => {
      const { nativePetRageRecording } = await import('/tests/fixtures/native-pet-rage.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = nativePetRageRecording(level);
      window.__yak = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Yak replay rejected');
      scene.sync();
      scene.drawOverlay(0);
      return { initial: r.initial, raged: r.raged, expired: r.expired };
    }, level);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const initial = await seek(page, times.initial);
    expect(initial.used || initial.heroDown).toBe(false);
    expect(initial.damage).toBe(1);
    const raged = await seek(page, times.raged);
    expect(raged).toMatchObject({
      heroDown: true,
      petAlive: true,
      used: true,
      damage: 1.7,
      speed: 2,
      visible: true,
      tint: 0xffbd76,
      unchanged: true,
      gl: 0,
    });
    expect(raged.texture).toMatch(/^baked:heroes-native\/yak\//);
    await page.screenshot({ path: `output/playtest/yak-rage-${level}-${width}.png` });
    const expired = await seek(page, times.expired);
    expect(expired).toMatchObject({
      heroDown: true,
      petAlive: true,
      used: true,
      damage: 1,
      speed: 0,
      tint: 0xffffff,
      unchanged: true,
      gl: 0,
    });
    expect(await seek(page, times.raged)).toEqual(raged);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, times.raged)).toEqual(raged);
    await page.evaluate(async () => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      const old = structuredClone(window.__yak.data);
      old.version = 96;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(old)))))
        throw Error('Historical Yak replay rejected');
      scene.sync();
    });
    const old = await seek(page, times.raged);
    expect(old).toMatchObject({
      heroDown: true,
      used: false,
      damage: 1,
      speed: 0,
      unchanged: true,
      gl: 0,
    });
    expect(errors).toEqual([]);
  });
