import { expect, test } from '@playwright/test';
import {
  archerRecording,
  frozenDragonArcherRecording,
  archerPuppetRecording,
} from '../fixtures/attacking-archer';

for (const c of [
  { version: 191, width: 390, level: 1, guard: false },
  { version: 191, width: 1440, level: 14, guard: true },
  { version: 191, width: 390, level: 14, guard: 'air' },
  { version: 190, width: 1440, level: 14, guard: false },
  { version: 190, width: 390, level: 1, guard: true },
  { version: 190, width: 1440, level: 1, guard: 'air' },
  { version: 191, width: 390, level: 1, guard: 'puppet', item: 1 },
  { version: 191, width: 1440, level: 14, guard: 'puppet', item: 18 },
  { version: 190, width: 1440, level: 14, guard: 'puppet', item: 1 },
] as const)
  test(`Archer ${c.level} ${c.guard || 'Air Defense'}, version ${c.version} at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r =
        c.guard === 'puppet'
          ? archerPuppetRecording(c.item, c.level, c.version)
          : c.guard === 'air'
            ? frozenDragonArcherRecording(c.level, c.version)
            : archerRecording(c.version, c.level, c.guard),
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
        throw Error('Archer replay rejected');
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
    if (c.version === 191) {
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
    if (c.version === 191) {
      expect(
        await page.evaluate(
          (id) => window.__game.model.battle.projectiles.find((p) => p.sourceId === id).fromAir,
          r.id,
        ),
      ).toBe(false);
      const shotId = await page.evaluate(
        (id) =>
          window.__game.model.battle.projectiles.find(
            (p) => p.sourceId === id && p.native?.kind === 'archer',
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
      path: `output/playtest/archer-charge-${c.level}-${c.guard || 'airdefense'}-${c.version}-${c.width}.png`,
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

test('decoded Archer art replaces its fallback while a cold Freeze replay stays paused', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/troops-native/archer/graph.json', async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const r = frozenDragonArcherRecording(3);
    await page.evaluate(({ data, first, id }) => {
      const { model, scene } = window.__game;
      if (!model.openReplay(data)) throw Error('Replay rejected');
      model.replay.paused = true;
      model.seekReplay(first);
      while (model.replay.seeking) model.step(0.05);
      const u = model.battle.units.find((unit: { id: number }) => unit.id === id);
      scene.cameras.main.centerOn(896 + (u.x - u.y) * 32, 112 + (u.x + u.y) * 16);
    }, r);
    const pose = () =>
      page.evaluate((id) => {
        const { model, scene } = window.__game;
        return {
          time: model.replay.time,
          paused: model.replay.paused,
          native: scene.troopNativePresentation.views.get(id)?.sample?.name ?? null,
          fallback: scene.unitSprites.get(id)?.visible ?? false,
        };
      }, r.id);
    await expect.poll(pose).toMatchObject({ paused: true, native: null, fallback: true });
    const time = (await pose()).time;
    release();
    // Let only the ordinary render loop run. A camera move or forced overlay redraw would
    // conceal a missed invalidation on either graph or texture readiness.
    await expect
      .poll(pose, { timeout: 20_000 })
      .toMatchObject({ time, paused: true, native: /^archer2_attack/, fallback: false });
  } finally {
    release();
  }
});
