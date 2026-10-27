import { expect, test } from '@playwright/test';
import { meteorStaffRecording } from '../fixtures/meteor-staff';

for (const { hidden, width, version } of [
  { hidden: true, width: 1440 },
  { hidden: false, width: 390 },
  { hidden: true, width: 390, version: 140 },
  { hidden: false, width: 1440, version: 140 },
] as const)
  test(`Meteor Staff target selection with invisible defense=${hidden}, version=${version ?? 'current'}, ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = meteorStaffRecording(hidden, version),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Meteor Staff replay rejected');
      scene.sync();
    }, r.data);
    const seek = (at: number) =>
      page.evaluate(async (at) => {
        const { model, scene } = window.__game;
        model.seekReplay(at);
        while (model.replay.seeking) model.step(0.05);
        model.changed();
        scene.sync();
        const { iso } = await import('/src/game/scene.ts'),
          b = model.battle;
        const prince = b.units.find((u) => u.hero === 'prince'),
          point = iso(prince.x, prince.y);
        scene.cameras.main.useBounds = false;
        scene.cameras.main.setZoom(innerWidth < 500 ? 1.05 : 1.4).centerOn(point.x, point.y - 45);
        const before = JSON.stringify(b);
        scene.drawOverlay(0);
        return {
          battle: before,
          readOnly: before === JSON.stringify(b),
          targets: (b.nativeSpells ?? [])
            .filter((c) => c.name === 'MPMeteorStaffSpell')
            .map((c) => [c.x, c.y]),
          health: b.buildings.map((b) => b.hp),
          hiddenUntil: b.buildingEffects?.[2]?.invisibleUntil ?? 0,
          elapsed: b.elapsed,
        };
      }, at);
    for (const s of r.snapshots) {
      const actual = await seek(s.at);
      expect(actual.battle).toBe(JSON.stringify(s.battle));
      expect(actual.readOnly).toBe(true);
    }
    const before = await seek(r.beforeCast);
    if (hidden) expect(before.hiddenUntil).toBeGreaterThan(before.elapsed);
    expect(before.targets).toEqual([]);
    const cast = await seek(r.cast);
    expect(cast.targets).toEqual(
      version === 140 ? (hidden ? [[14.5, 11.5]] : []) : hidden ? [[38, 38]] : [[14.5, 11.5]],
    );
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const scene = window.__game.scene;
            scene.drawOverlay(0);
            return scene.children.list.some(
              (o) =>
                o.visible &&
                o.alpha > 0 &&
                o.getData?.('nativeHero') === id &&
                o.texture?.key.startsWith('baked:heroes-native/'),
            );
          }, r.unitId),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/meteor-staff-${hidden ? 'invisible' : 'ordinary'}-${version ?? 141}-${width}.png`,
    });
    const beforeHit = await seek(r.beforeHit),
      hit = await seek(r.hit);
    if (hidden && version !== 140) expect(beforeHit.health[0] - hit.health[0]).toBe(250);
    if (!hidden && version === 140) expect(hit.health[0]).toBe(beforeHit.health[0]);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(hit.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await seek(r.beforeCast);
    expect(await seek(r.cast)).toEqual(cast);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
