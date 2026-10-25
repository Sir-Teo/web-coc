import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__jumperChase;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((u) => u.id === r.subjectId);
    const enemy = model.battle.defenders.find((d) => d.id === r.defenderId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(innerWidth === 390 ? (unit.x + enemy.x) / 2 : 9, 6.5);
    scene.cameras.main.setZoom(innerWidth === 390 ? 0.65 : 1.5).centerOn(point.x, point.y - 45);
    scene.drawOverlay(0);
    return {
      x: unit.x,
      target: unit.defenderTarget,
      enemyHp: enemy.hp,
      cooldown: unit.cooldown,
      wallsStanding: model.battle.buildings.filter((b) => b.kind === 'wall').every((b) => b.hp > 0),
    };
  }, at);
}

for (const { kind, width } of [
  { kind: 'lassi' as const, width: 1440 },
  { kind: 'warden' as const, width: 390 },
]) {
  test(`${kind} follows a defending Hero across an intact wall at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const expected = await page.evaluate(async (kind) => {
      const { jumperChaseRecording } = await import('/tests/fixtures/jumper-defender-chase.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = jumperChaseRecording(kind);
      window.__jumperChase = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Wall chase replay rejected');
      scene.sync();
      return {
        before: r.before,
        crossed: r.crossed,
        hit: r.hit,
        damage: r.damage,
        defenderId: r.defenderId,
      };
    }, kind);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const crossed = await seek(page, expected.crossed);
    expect(crossed.x).toBeGreaterThanOrEqual(9 - 1e-9);
    expect(crossed.target).toBe(expected.defenderId);
    expect(crossed.wallsStanding).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.children.list.some(
            (o) =>
              o.visible &&
              o.alpha > 0 &&
              o.getData?.('nativeHero') === window.__jumperChase.subjectId &&
              o.texture?.key.startsWith('baked:heroes-native/'),
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/jumper-chase-${kind}-${width}.png` });
    const hit = await seek(page, expected.hit);
    expect(hit.wallsStanding).toBe(true);
    const before = await seek(page, expected.before);
    expect(before.x).toBeLessThan(8);
    expect(await seek(page, expected.crossed)).toEqual(crossed);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, expected.hit)).toEqual(hit);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__jumperChase.data, version: 85 }))
        throw Error('Legacy wall chase replay rejected');
    });
    const old = await seek(page, expected.hit);
    expect(old.x).toBeLessThan(8);
    const extraHits = (old.enemyHp - hit.enemyHp) / expected.damage;
    expect(extraHits).toBeGreaterThanOrEqual(1 - 1e-8);
    expect(extraHits).toBeCloseTo(Math.round(extraHits), 8);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
