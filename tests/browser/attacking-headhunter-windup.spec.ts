import { expect, test } from '@playwright/test';
import {
  attackingHeadhunterRecording,
  chargingHeadhunterHeroRecording,
} from '../fixtures/attacking-headhunter';

for (const c of [
  { version: 181, level: 1, width: 390, hero: true, air: false, guard: false },
  { version: 181, level: 4, width: 1440, hero: true, air: true, guard: false },
  { version: 180, level: 4, width: 390, hero: true, air: true, guard: false },
  { version: 180, level: 1, width: 1440, hero: true, air: false, guard: false },
  { version: 181, level: 1, width: 390, hero: false, air: false, guard: false },
  { version: 181, level: 4, width: 1440, hero: false, air: false, guard: true },
  { version: 181, level: 4, width: 390, hero: false, air: true, guard: 'air' },
  { version: 180, level: 1, width: 1440, hero: false, air: false, guard: false },
] as const)
  test(`Headhunter ${c.level} ${c.hero ? 'Hero' : c.guard || 'Cannon'} air=${c.air}, version ${c.version}, ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = c.hero
        ? chargingHeadhunterHeroRecording(c.level, c.air, c.version)
        : attackingHeadhunterRecording(c.version, c.level, c.guard),
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
        throw Error('Headhunter replay rejected');
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
          scene.cameras.main.setZoom(innerWidth < 500 ? 1.45 : 1.8).centerOn(p.x, p.y - 40);
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
    if (c.version === 181) {
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
    const shot = await page.evaluate(
      (id) => window.__game.model.battle.projectiles.find((p) => p.sourceId === id),
      r.id,
    );
    if (c.version === 181 || c.hero || !c.guard) {
      expect(shot.native.kind).toBe('headhunter');
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
      path: `output/playtest/headhunter-charge-${c.level}-${c.hero ? 'hero' : c.guard || 'cannon'}-${c.air}-${c.version}-${c.width}.png`,
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
