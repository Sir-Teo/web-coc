import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__passiveSpeed;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const unit = model.battle.units.find((u) => u.id === r.unitId);
    const stats = model.unitStats(unit);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(unit.x + 0.5, unit.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.2 : 1.8).centerOn(point.x, point.y - 25);
    scene.drawOverlay(0);
    return {
      damage: stats.damage,
      interval: stats.rate,
      cooldown: unit.cooldown,
      attacking: unit.attacking,
      totalDamage: model.battle.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0),
      projectile: model.battle.projectiles?.find((p) => p.sourceId === unit.id)?.damage,
    };
  }, at);
}

for (const { width, index } of [
  { width: 1440, index: 0 },
  { width: 390, index: 2 },
]) {
  test(`passive attack speed preserves Hero hit damage and panel stats at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const expected = await page.evaluate(async (index) => {
      const { passiveSpeedRecording } = await import('/tests/fixtures/hero-passive-speed.ts');
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      const r = passiveSpeedRecording(index);
      window.__passiveSpeed = r;
      const { model, scene } = window.__game;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Passive speed replay rejected');
      scene.sync();
      return {
        first: r.first,
        final: r.final,
        damage: r.source.damage,
        speed: r.source.speed,
        interval: r.source.rate / (1 + r.source.speed),
        kind: r.source.kind,
      };
    }, index);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const first = await seek(page, expected.first);
    expect(first.damage).toBeCloseTo(expected.damage, 10);
    expect(first.interval).toBeCloseTo(expected.interval, 12);
    expect(first.cooldown).toBeCloseTo(expected.interval - 0.2, 9);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.children.list.some(
            (o) =>
              o.visible &&
              o.alpha > 0 &&
              o.getData?.('nativeHero') === window.__passiveSpeed.unitId &&
              o.texture?.key.startsWith('baked:heroes-native/'),
          );
        }),
      )
      .toBe(true);
    if (index === 2) {
      expect(first.projectile).toBeCloseTo(expected.damage, 10);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const shot = model.battle.projectiles.find(
              (p) => p.sourceId === window.__passiveSpeed.unitId,
            );
            return (
              scene.nativeProjectiles.views
                .get(shot.id)
                ?.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                ) ?? false
            );
          }),
        )
        .toBe(true);
    }
    await page.screenshot({
      path: `output/playtest/hero-passive-speed-${expected.kind}-${width}.png`,
    });
    const final = await seek(page, expected.final);
    expect(await seek(page, expected.first)).toEqual(first);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, expected.final)).toEqual(final);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.returnHome();
      if (!model.openReplay({ ...window.__passiveSpeed.data, version: 83 }))
        throw Error('Legacy passive speed replay rejected');
    });
    const oldFirst = await seek(page, expected.first);
    expect(oldFirst.damage).toBeCloseTo(expected.damage / (1 + expected.speed), 10);
    expect(oldFirst.interval).toBe(first.interval);
    expect(oldFirst.cooldown).toBe(first.cooldown);
    expect((await seek(page, expected.final)).totalDamage).toBeLessThan(final.totalDamage);
    // The normal Hero panel reads the same current equipment stats as a new battle.
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model, scene } = window.__game;
      const source = window.__passiveSpeed.source;
      model.returnHome();
      model.state.obstacles = [];
      model.state.buildings = [
        makeBuilding(1, 'townhall', 20, 20, 18),
        makeBuilding(2, 'herohall', 4, 4, 12),
        makeBuilding(3, 'blacksmith', 8, 4, 9),
        makeBuilding(4, 'builder', 30, 30),
      ];
      model.state.king = { level: 1 };
      model.state.heroes = source.kind === 'champion' ? { champion: { level: 1 } } : {};
      delete model.state.equipment;
      model.state.gear = {
        levels: Object.fromEntries(source.items.map((i) => [i.slug, i.level])),
        loadouts: { [source.kind]: source.items.map((i) => i.slug) },
      };
      model.changed();
      scene.sync();
    });
    await page.locator('.train-add').click();
    await page.locator('[data-action="heroes"]').click();
    const stats = page.locator(`[data-hero="${expected.kind}"] .hero-stat-grid > div`);
    const displayed = async (label: string) =>
      stats
        .filter({ hasText: label })
        .locator('b')
        .evaluate((el) => el.textContent.split(' →')[0]);
    const formatted = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    expect(await displayed('Damage per hit')).toBe(formatted(expected.damage));
    expect(await displayed('Damage per second')).toBe(
      formatted(expected.damage / expected.interval),
    );
    expect(await displayed('Attack interval')).toBe(`${formatted(expected.interval)}s`);
    await page.locator(`[data-hero="${expected.kind}"] .hero-overview`).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `output/playtest/hero-passive-speed-panel-${expected.kind}-${width}.png`,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}
