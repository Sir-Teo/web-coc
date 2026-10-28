import { expect, test } from '@playwright/test';
import { superWallBreakerRecording } from '../fixtures/attacking-super-wall-breaker';
import { nativeTargetingSpellRecording } from '../fixtures/native-targeting-spells';

for (const c of [
  { version: 205, level: 1, target: 'storage', width: 390 },
  { version: 205, level: 10, target: 'cannon', width: 1440 },
  { version: 205, level: 10, target: 'wall', width: 390 },
  { version: 205, level: 1, target: 'cannon', width: 390 },
  { version: 204, level: 1, target: 'storage', width: 1440 },
  { version: 204, level: 10, target: 'wall', width: 390 },
] as const)
  test(`Super Wall Breaker ${c.level} ${c.target} charge and death, version ${c.version} at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = superWallBreakerRecording(
        c.version,
        c.level,
        c.target,
        c.target === 'wall' ? 6.9 : c.target === 'storage' ? 18.6 : 11.4,
      ),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
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
        throw Error('Super Wall Breaker replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    const seek = (at: number) =>
      page.evaluate(
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
        { at, id: r.id },
      );
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(s.at);
      expect(JSON.parse(state.battle)).toEqual(s.battle);
      expect(state.readOnly).toBe(true);
    }
    // Capture the original living body before approach and the historical attack wait.
    await seek(r.born);
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
    await page.screenshot({
      path: `output/playtest/super-wall-breaker-${c.version}-${c.level}-${c.target}-${c.width}-alive.png`,
    });
    if (c.version === 205) {
      const charged = r.snapshots.find((s) => s.at > r.born && s.at < r.defeated)!;
      await seek(charged.at);
      const phase = await page.evaluate((id) => {
        const { model, scene } = window.__game;
        scene.drawOverlay(0);
        const u = model.battle.units.find((u) => u.id === id);
        return {
          offset: u.native?.attackWindup?.animationOffset,
          state: scene.troopNativePresentation.views.get(id)?.state,
        };
      }, r.id);
      expect(phase.offset).toBeLessThan(0);
      expect(phase.state).toBe('attack');
      await page.screenshot({
        path: `output/playtest/super-wall-breaker-charge-${c.version}-${c.level}-${c.target}-${c.width}.png`,
      });
    }
    const settled = await seek(r.exploded);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      settled.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

for (const level of [1, 4])
  test(`Super Wall Breaker cancels a charge on actual Angry Spell ${level}`, async ({ page }) => {
    test.setTimeout(120000);
    const r = nativeTargetingSpellRecording('AngrySpell', level, 205, 'superwallbreaker', 2, 0.1),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.setViewportSize({
      width: level === 1 ? 390 : 1440,
      height: level === 1 ? 844 : 960,
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Angry Super Wall Breaker replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    const seek = (at: number) =>
      page.evaluate(
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
        { at, id: r.unitId },
      );
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(s.at);
      expect(JSON.parse(state.battle)).toEqual(s.battle);
      expect(state.readOnly).toBe(true);
    }
    await seek(r.pending);
    expect(
      await page.evaluate(
        (id) =>
          window.__game.model.battle.units.find((u) => u.id === id).native.attackWindup.engaged,
        r.unitId,
      ),
    ).toBe(true);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            return scene.troopNativePresentation.views.get(id)?.state;
          }, r.unitId),
        { timeout: 30000 },
      )
      .toBe('attack');
    await page.screenshot({ path: `output/playtest/super-wall-breaker-angry-${level}-charge.png` });
    const after = await seek(r.impact),
      u = JSON.parse(after.battle).units.find((u) => u.id === r.unitId);
    expect(u.native.attackWindup.engaged).toBeUndefined();
    expect(u.native.attacks ?? 0).toBe(0);
    expect(u.target).toBe(3);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      after.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
