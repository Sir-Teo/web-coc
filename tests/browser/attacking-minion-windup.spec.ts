import { expect, test } from '@playwright/test';
import { minionRecording, frozenDragonMinionRecording } from '../fixtures/attacking-minion';

for (const c of [
  { version: 188, width: 390, level: 1, guard: false },
  { version: 188, width: 1440, level: 14, guard: true },
  { version: 188, width: 390, level: 14, guard: 'air' },
  { version: 187, width: 1440, level: 14, guard: false },
  { version: 187, width: 390, level: 1, guard: true },
  { version: 187, width: 1440, level: 1, guard: 'air' },
] as const)
  test(`Minion ${c.level} ${c.guard || 'Cannon'}, version ${c.version} at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r =
        c.guard === 'air'
          ? frozenDragonMinionRecording(c.level, c.version)
          : minionRecording(c.version, c.level, c.guard),
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
        throw Error('Minion replay rejected');
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
    if (c.version === 188) {
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
    if (c.version === 188) {
      expect(
        await page.evaluate(
          (id) => window.__game.model.battle.projectiles.find((p) => p.sourceId === id).fromAir,
          r.id,
        ),
      ).toBe(true);
      const shotId = await page.evaluate(
        (id) =>
          window.__game.model.battle.projectiles.find(
            (p) => p.sourceId === id && p.native?.kind === 'minion',
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
      path: `output/playtest/minion-charge-${c.level}-${c.guard || 'cannon'}-${c.version}-${c.width}.png`,
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
