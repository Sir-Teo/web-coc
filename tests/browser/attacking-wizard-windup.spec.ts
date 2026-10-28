import { expect, test } from '@playwright/test';
import { nativeTargetingSpellRecording } from '../fixtures/native-targeting-spells';
import {
  wizardRecording,
  frozenGuardWizardRecording,
  siegeWizardRecording,
} from '../fixtures/attacking-wizard';

for (const c of [
  { version: 194, width: 390, level: 1, guard: false },
  { version: 194, width: 1440, level: 14, guard: true },
  { version: 194, width: 390, level: 14, guard: 'air' },
  { version: 193, width: 1440, level: 14, guard: false },
  { version: 193, width: 390, level: 1, guard: true },
  { version: 193, width: 1440, level: 1, guard: 'air' },
  { version: 194, width: 390, level: 1, guard: 'siege', item: 1 },
  { version: 194, width: 1440, level: 14, guard: 'siege', item: 6 },
  { version: 193, width: 1440, level: 14, guard: 'siege', item: 6 },
] as const)
  test(`Wizard ${c.level} ${c.guard || 'Storage'}, version ${c.version} at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r =
        c.guard === 'siege'
          ? siegeWizardRecording(c.item, c.level, c.version)
          : c.guard === 'air'
            ? frozenGuardWizardRecording(c.level, c.version, true)
            : c.guard
              ? frozenGuardWizardRecording(c.level, c.version)
              : wizardRecording(c.version, c.level),
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
        throw Error('Wizard replay rejected');
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
    if (c.version === 194) {
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
    if (c.version === 194) {
      expect(
        await page.evaluate(
          (id) => window.__game.model.battle.projectiles.find((p) => p.sourceId === id).fromAir,
          r.id,
        ),
      ).toBe(false);
      const shotId = await page.evaluate(
        (id) =>
          window.__game.model.battle.projectiles.find(
            (p) => p.sourceId === id && p.native?.kind === 'wizard',
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
      path: `output/playtest/wizard-charge-${c.level}-${c.guard || 'storage'}-${c.version}-${c.width}.png`,
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
  { level: 4, width: 1440 },
])
  test(`actual Angry Spell ${c.level} redirects a charging Wizard at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = nativeTargetingSpellRecording('AngrySpell', c.level, 194, 'wizard'),
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
        throw Error('Angry Wizard replay rejected');
      model.replay.paused = true;
      scene.sync();
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
          scene.cameras.main.setZoom(innerWidth < 500 ? 1.2 : 1.6).centerOn(p.x, p.y - 80);
          scene.cameras.main.preRender();
          scene.drawOverlay(0);
          return {
            battle: before,
            unchanged: before === JSON.stringify(model.battle),
            gl: window.__game.game.renderer.gl.getError(),
          };
        },
        { at: s.at, id: r.unitId },
      );
      expect(JSON.parse(result.battle)).toEqual(s.battle);
      expect(result.unchanged).toBe(true);
      expect(result.gl).toBe(0);
      if (s.at === r.impact) {
        const battle = JSON.parse(result.battle),
          u = battle.units.find((u) => u.id === r.unitId);
        expect(u.target).toBe(3);
        expect(u.native.attackWindup.engaged).toBeUndefined();
        expect(u.native.attacks ?? 0).toBe(0);
        expect(battle.buildings.find((b) => b.id === 2).hp).toBe(
          battle.buildings.find((b) => b.id === 2).maxHp,
        );
      }
      if (s.at === r.pending)
        await page.screenshot({
          path: `output/playtest/wizard-angry-pending-${c.level}-${c.width}.png`,
        });
    }
    expect(errors).toEqual([]);
  });
