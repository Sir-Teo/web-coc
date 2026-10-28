import { expect, test } from '@playwright/test';
import { babyDragonRecording, babyDragonAllyRecording } from '../fixtures/attacking-baby-dragon';

for (const c of [
  { version: 186, width: 390, level: 1, guard: false },
  { version: 186, width: 1440, level: 12, guard: true },
  { version: 186, width: 390, level: 12, guard: 'air' },
  { version: 185, width: 1440, level: 12, guard: false },
  { version: 185, width: 390, level: 1, guard: true },
  { version: 185, width: 1440, level: 1, guard: 'air' },
] as const)
  test(`Baby Dragon ${c.level} ${c.guard || 'Cannon'}, version ${c.version} at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = babyDragonRecording(c.version, c.level, c.guard),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
    });
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Baby Dragon replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    const seek = (at: number) =>
      page.evaluate(
        async ({ at, id, defenderId }) => {
          const { model, scene } = window.__game,
            { iso } = await import('/src/game/scene.ts');
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          model.changed();
          scene.sync();
          const u = model.battle.units.find((u) => u.id === id),
            d = model.battle.defenders?.find((d) => d.id === defenderId),
            p = iso(d ? (u.x + d.x) / 2 : u.x, d ? (u.y + d.y) / 2 : u.y),
            before = JSON.stringify(model.battle);
          scene.cameras.main.useBounds = false;
          scene.cameras.main.setZoom(innerWidth < 500 ? 1.35 : 1.7).centerOn(p.x, p.y - 40);
          scene.cameras.main.preRender();
          scene.drawOverlay(0);
          return { battle: before, readOnly: before === JSON.stringify(model.battle) };
        },
        { at, id: r.id, defenderId: r.defenderId },
      );
    for (const s of r.snapshots) {
      const result = await seek(s.at);
      expect(JSON.parse(result.battle)).toEqual(s.battle);
      expect(result.readOnly).toBe(true);
    }
    if (c.version === 186) {
      await seek(r.charged!);
      expect(
        await page.evaluate(
          (id) =>
            window.__game.model.battle.units.find((u) => u.id === id).native.attackWindup
              .animationOffset,
          r.id,
        ),
      ).toBeLessThan(0);
    }
    const first = await seek(r.first);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            return (
              scene.troopNativePresentation.views
                .get(id)
                ?.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                ) ?? false
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    if (c.version === 186) {
      expect(
        await page.evaluate(
          (id) => window.__game.model.battle.projectiles.find((p) => p.sourceId === id).fromAir,
          r.id,
        ),
      ).toBe(true);
      const shotId = await page.evaluate(
        (id) =>
          window.__game.model.battle.projectiles.find(
            (p) => p.sourceId === id && p.native?.kind === 'babydragon',
          ).id,
        r.id,
      );
      await expect
        .poll(
          () =>
            page.evaluate((id) => {
              const { scene } = window.__game;
              scene.drawOverlay(0);
              return (
                scene.nativeProjectiles.views
                  .get(id)
                  ?.view.objects.some(
                    (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                  ) ?? false
              );
            }, shotId),
          { timeout: 30000 },
        )
        .toBe(true);
    }
    await page.screenshot({
      path: `output/playtest/baby-dragon-charge-${c.level}-${c.guard || 'cannon'}-${c.version}-${c.width}.png`,
    });
    await seek(r.born);
    expect(await seek(r.first)).toEqual(first);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      first.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

for (const c of [
  { level: 1, width: 390 },
  { level: 12, width: 1440 },
])
  test(`Baby Dragon ${c.level} ally arrival remains exact at ${c.width}px`, async ({ page }) => {
    test.setTimeout(120000);
    const r = babyDragonAllyRecording(c.level),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
    });
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Baby Dragon ally replay rejected');
      model.replay.paused = true;
    }, r.data);
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const result = await page.evaluate(
        async ({ at, id }) => {
          const { model, scene } = window.__game,
            { iso } = await import('/src/game/scene.ts');
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          model.changed();
          scene.sync();
          const u = model.battle.units.find((u) => u.id === id),
            p = iso(u.x, u.y),
            before = JSON.stringify(model.battle);
          scene.cameras.main.useBounds = false;
          scene.cameras.main.setZoom(innerWidth < 500 ? 1.35 : 1.7).centerOn(p.x, p.y - 40);
          scene.cameras.main.preRender();
          scene.drawOverlay(0);
          return { battle: before, readOnly: before === JSON.stringify(model.battle) };
        },
        { at: s.at, id: r.id },
      );
      expect(JSON.parse(result.battle)).toEqual(s.battle);
      expect(result.readOnly).toBe(true);
    }
    expect(
      r.snapshots.find((s) => s.at === r.calm)!.battle.units.find((u) => u.id === r.id)!.native!
        .alone,
    ).toBe(false);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
