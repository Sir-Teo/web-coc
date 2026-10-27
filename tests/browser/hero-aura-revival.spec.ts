import { expect, test, type Page } from '@playwright/test';
import { heroAuraRevivalRecording } from '../fixtures/hero-aura-revival';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const unit = model.battle.units.find((unit) => unit.id === id);
      const { iso } = await import('/src/game/scene.ts');
      const point = iso(unit.x, unit.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.05 : 1.4).centerOn(point.x, point.y - 50);
      const before = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

for (const { equipment, revival, width, version } of [
  { equipment: 'electro-boots', revival: 'revive', width: 390 },
  { equipment: 'electro-boots', revival: 'phoenix', width: 1440 },
  { equipment: 'rage-gem', revival: 'revive', width: 1440 },
  { equipment: 'life-gem', revival: 'phoenix', width: 390 },
  { equipment: 'electro-boots', revival: 'revive', width: 390, version: 137 },
] as const)
  test(`${equipment} ${revival} restores its same-body aura at ${width}px, version=${version ?? 'current'}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = heroAuraRevivalRecording(equipment, revival, version);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (r) => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Aura replay rejected');
      scene.sync();
    }, r);
    for (const at of [r.deployed, r.dead, r.restored, r.later]) {
      expect(await seek(page, at, r.unitId)).toEqual({
        battle: JSON.stringify(r.snapshots.find((s) => s.at === at)!.battle),
        readOnly: true,
      });
    }
    const state = await page.evaluate(
      ({ id, allyId, equipment }) => {
        const { model, scene } = window.__game;
        const b = model.battle,
          hero = b.units.find((u) => u.id === id),
          ally = b.units.find((u) => u.id === allyId);
        const name = {
          'electro-boots': 'Electro Boots Aura',
          'rage-gem': 'Rage Gem Aura',
          'life-gem': 'Life Gem Aura',
        }[equipment];
        return {
          enabled: !!b.nativeHeroAuraRevival,
          alive: hero.hp > 0,
          aura: b.nativeSpells.filter((c) => c.follow === id && c.name === name && !c.ended).length,
          used: b.nativeHeroes[0].abilityUsed,
          allyDamageBoost: ally.native?.effects?.boost?.damage ?? 0,
          allyExtraHp: ally.native?.effects?.extraHp?.amount ?? 0,
          gl: window.__game.game.renderer.gl.getError(),
        };
      },
      { id: r.unitId, allyId: r.allyId, equipment },
    );
    expect(state).toMatchObject({
      enabled: version !== 137,
      alive: true,
      aura: version === 137 ? 0 : 1,
      used: true,
      gl: 0,
    });
    if (equipment === 'rage-gem') expect(state.allyDamageBoost).toBe(0.15);
    if (equipment === 'life-gem') expect(state.allyExtraHp).toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const scene = window.__game.scene;
            scene.drawOverlay(0);
            return scene.children.list.some(
              (object) =>
                object.visible &&
                object.alpha > 0 &&
                object.getData?.('nativeHero') === id &&
                object.texture?.key.startsWith('baked:heroes-native/'),
            );
          }, r.unitId),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/aura-revival-${equipment}-${revival}-${version ?? 138}-${width}.png`,
    });
    const later = JSON.stringify(r.snapshots.find((s) => s.at === r.later)!.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(later);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await seek(page, r.dead, r.unitId)).battle).toBe(
      JSON.stringify(r.snapshots.find((s) => s.at === r.dead)!.battle),
    );
    expect((await seek(page, r.restored, r.unitId)).battle).toBe(
      JSON.stringify(r.snapshots.find((s) => s.at === r.restored)!.battle),
    );
    expect(errors).toEqual([]);
  });
