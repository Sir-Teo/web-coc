import { expect, test } from '@playwright/test';
import {
  superMinionOpeningRecording,
  superMinionDefenderRecording,
} from '../fixtures/attacking-super-minion';

for (const c of [
  { version: 187, width: 390, level: 5, guard: false },
  { version: 187, width: 1440, level: 11, guard: false },
  { version: 187, width: 1440, level: 11, guard: true },
  { version: 187, width: 390, level: 11, guard: 'air' },
  { version: 186, width: 1440, level: 11, guard: false },
  { version: 186, width: 390, level: 5, guard: false },
  { version: 186, width: 390, level: 5, guard: true },
  { version: 186, width: 1440, level: 5, guard: 'air' },
] as const)
  test(`Super Minion ${c.level} ${c.guard || 'Storage'}, version ${c.version} at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = c.guard
        ? superMinionDefenderRecording(c.version, c.level, c.guard === 'air')
        : superMinionOpeningRecording(c.level, c.version),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
    });
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    if (c.version === 187) {
      const paths = await page.evaluate(async (level) => {
        const { model, scene } = window.__game,
          { superLevelOffset } = await import('/src/game/special-troops.ts'),
          { nativeProjectilePack } = await import('/src/game/native-projectile-poses.ts');
        scene.paused = true;
        model.state.army.superminion = 1;
        model.state.troopLevels = {
          ...model.state.troopLevels,
          minion: level + superLevelOffset('superminion'),
        };
        scene.sync();
        return ['super_gargoyle_projectile', 'super_gargoyle_projectile_big'].map(
          nativeProjectilePack,
        );
      }, c.level);
      expect(paths.every(Boolean)).toBe(true);
      await expect
        .poll(
          () =>
            page.evaluate((paths) => {
              const { model, scene } = window.__game;
              return (
                !model.battle &&
                paths.every((path) => scene.nativeProjectiles.packs.packs.has(path))
              );
            }, paths),
          { timeout: 30000 },
        )
        .toBe(true);
    }
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Super Minion replay rejected');
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
        { at, id: r.id, defenderId: 'defenderId' in r ? r.defenderId : undefined },
      );
    for (const s of r.snapshots) {
      const result = await seek(s.at);
      expect(JSON.parse(result.battle)).toEqual(s.battle);
      expect(result.readOnly).toBe(true);
    }
    if (c.version === 187) {
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
    if (c.version === 187) {
      expect(
        await page.evaluate(
          (id) => window.__game.model.battle.projectiles.find((p) => p.sourceId === id).fromAir,
          r.id,
        ),
      ).toBe(true);
      const shotId = await page.evaluate(
        (id) =>
          window.__game.model.battle.projectiles.find(
            (p) => p.sourceId === id && p.native?.kind === 'superminion',
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
    if (c.version === 187 && 'ninth' in r) {
      await seek(r.ninth);
      const shot = await page.evaluate(
        (id) => window.__game.model.battle.projectiles.filter((p) => p.sourceId === id).at(-1),
        r.id,
      );
      expect(shot.native.name).toBe('super_gargoyle_projectile');
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
            }, shot.id),
          { timeout: 30000 },
        )
        .toBe(true);
    }
    await page.screenshot({
      path: `output/playtest/super-minion-charge-${c.level}-${c.guard || 'storage'}-${c.version}-${c.width}.png`,
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
