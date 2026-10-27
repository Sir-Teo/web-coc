import { expect, test, type Page } from '@playwright/test';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    const r = window.__friendly;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const battle = model.battle;
    const actor = battle.units.find((u) => u.id === r.actorId);
    const other = battle.units.find((u) => u.id === r.otherId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(actor.x, actor.y);
    scene.cameras.main.setZoom(innerWidth === 390 ? 1.15 : 1.6).centerOn(point.x, point.y - 50);
    const before = JSON.stringify(battle);
    scene.drawOverlay(0);
    return {
      enabled: !!battle.nativeFriendlyEligibility,
      target: battle.units.find((u) => u.id === actor.healTarget)?.kind ?? null,
      alone: actor.native?.alone ?? null,
      waiting: !!other.native?.phoenixWaiting,
      immune: !!other.native?.noHealing,
      damaged: other.hp < other.maxHp,
      shots: (battle.projectiles ?? [])
        .filter((p) => p.weapon === 'healing')
        .map((p) => p.targetId),
      visible:
        !!scene.unitSprites.get(actor.id)?.visible ||
        !!scene.troopNativePresentation.views.get(actor.id)?.view.objects.some((o) => o.visible),
      unchanged: before === JSON.stringify(battle),
      gl: window.__game.game.renderer.gl.getError(),
    };
  }, at);
}

for (const mode of ['healing', 'rage'] as const)
  for (const width of [390, 1440]) {
    test(`friendly ${mode} eligibility survives replay seeks at ${width}px`, async ({ page }) => {
      test.setTimeout(120000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const r = await page.evaluate(async (mode) => {
        const { nativeFriendlyRecording } = await import('/tests/fixtures/native-friendly.ts');
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        const r = nativeFriendlyRecording(mode);
        window.__friendly = r;
        const { model, scene } = window.__game;
        scene.paused = true;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
          throw Error('Friendly replay rejected');
        scene.sync();
        scene.drawOverlay(0);
        return { initial: r.initial, changed: r.changed };
      }, mode);
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      const initial = await seek(page, r.initial);
      expect(initial.enabled && initial.visible && initial.unchanged).toBe(true);
      if (mode === 'healing') {
        expect(initial.target).toBeNull();
        expect(initial.immune && initial.damaged).toBe(true);
        expect(initial.shots).toEqual([]);
      } else {
        expect(initial.alone && initial.waiting).toBe(true);
      }
      await page.screenshot({ path: `output/playtest/friendly-${mode}-${width}-initial.png` });
      const changed = await seek(page, r.changed);
      if (mode === 'healing') {
        expect(changed.target).toBe('giant');
        expect(changed.shots).toHaveLength(1);
      } else {
        expect(changed.alone || changed.waiting).toBe(false);
      }
      expect(changed.visible && changed.unchanged).toBe(true);
      expect(changed.gl).toBe(0);
      await page.screenshot({ path: `output/playtest/friendly-${mode}-${width}-changed.png` });
      expect(await seek(page, r.initial)).toEqual(initial);
      await page.evaluate(() => window.__game.model.toggleReducedMotion());
      expect(await seek(page, r.changed)).toEqual(changed);
      await page.evaluate(async () => {
        const { model, scene } = window.__game;
        model.returnHome();
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        const older = structuredClone(window.__friendly.data);
        older.version = 95;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(older)))))
          throw Error('Historical friendly replay rejected');
        scene.sync();
      });
      const older = await seek(page, r.initial);
      expect(older.enabled).toBe(false);
      if (mode === 'healing') expect(older.target).not.toBeNull();
      else expect(older.alone).toBe(false);
      expect(older.unchanged).toBe(true);
      expect(older.gl).toBe(0);
      expect(errors).toEqual([]);
    });
  }
