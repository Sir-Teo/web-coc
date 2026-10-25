import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__heroAttacks;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((u) => u.id === r.unitId);
    const enemy = model.battle.defenders.find((d) => d.id === r.enemyId);
    const shot = model.battle.projectiles?.find((p) => p.sourceId === r.unitId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(unit ? (unit.x + enemy.x) / 2 : enemy.x, enemy.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.15 : 1.8).centerOn(point.x, point.y - 40);
    scene.drawOverlay(0);
    return {
      present: !!unit,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      shot: shot ? { name: shot.native?.name, weapon: shot.weapon, damage: shot.damage } : null,
    };
  }, at);
}

for (const { kind, width } of [
  { kind: 'queen' as const, width: 1440 },
  { kind: 'warden' as const, width: 390 },
  { kind: 'duke' as const, width: 390 },
]) {
  test(`${kind} uses its native defender attack at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const times = await page.evaluate(async (kind) => {
      const { heroDefenderRecording } = await import('/tests/fixtures/hero-defender-attacks.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = heroDefenderRecording(kind, kind === 'queen');
      window.__heroAttacks = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Hero attack replay rejected');
      scene.sync();
      return { active: r.active, recalled: r.recalled, hit: r.hit };
    }, kind);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const active = await seek(page, times.active);
    if (kind === 'queen') {
      expect(active.shot?.name).toBe('ArcherQueen arrow lvl1');
      expect(active.hp).toBe(active.maxHp);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const p = model.battle.projectiles.find(
              (p) => p.sourceId === window.__heroAttacks.unitId,
            );
            return (
              scene.nativeProjectiles.views
                .get(p.id)
                ?.view.objects.some(
                  (o) =>
                    o.visible &&
                    o.alpha > 0 &&
                    !['__MISSING', '__DEFAULT'].includes(o.texture?.key),
                ) ?? false
            );
          }),
        )
        .toBe(true);
    } else {
      expect(active.shot).toBeNull();
      expect(active.hp).toBeLessThan(active.maxHp);
    }
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.children.list.some(
            (o) =>
              o.visible &&
              o.alpha > 0 &&
              o.getData?.('nativeHero') === window.__heroAttacks.unitId &&
              o.texture?.key.startsWith('baked:heroes-native/'),
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/hero-defender-${kind}-${width}.png` });
    if (kind === 'queen') {
      const recalled = await seek(page, times.recalled);
      expect(recalled.present).toBe(false);
      expect(recalled.shot?.name).toBe('ArcherQueen arrow lvl1');
      expect((await seek(page, times.hit)).hp).toBeCloseTo(recalled.hp - recalled.shot!.damage, 8);
    }
    const hit = await seek(page, times.hit);
    expect(hit.hp).toBeLessThan(hit.maxHp);
    expect(await seek(page, times.active)).toEqual(active);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, times.hit)).toEqual(hit);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__heroAttacks.data, version: 87 }))
        throw Error('Legacy Hero attack replay rejected');
    });
    const old = await seek(page, times.active);
    expect(old.shot?.name).toBeUndefined();
    expect(old.shot?.weapon).toBe(kind === 'duke' ? 'bomb' : 'arrow');
    if (kind !== 'queen') expect(old.hp).toBeGreaterThan(active.hp);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
