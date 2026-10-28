import { expect, test } from '@playwright/test';
import { nativeTargetingSpellRecording } from '../fixtures/native-targeting-spells';
import { troopSoundCues, BattleSoundLog } from '../../src/game/troop-sounds';

for (const c of [
  { kind: 'archer', version: 197, width: 390, far: false },
  { kind: 'dragon', version: 197, width: 1440, far: false },
  { kind: 'electrodragon', version: 197, width: 1440, far: false },
  { kind: 'bowler', version: 197, width: 390, far: true },
  { kind: 'archer', version: 196, width: 1440, far: false },
  { kind: 'bowler', version: 196, width: 1440, far: true },
  { kind: 'electrodragon', version: 196, width: 390, far: false },
] as const)
  test(`Angry ${c.kind} charge reset v${c.version} at ${c.width}px`, async ({ page }) => {
    test.setTimeout(120000);
    const r = nativeTargetingSpellRecording(
        'AngrySpell',
        1,
        c.version,
        c.kind,
        c.far ? 1 : undefined,
      ),
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
      const { model, scene, audio } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Angry charge replay rejected');
      model.replay.paused = true;
      scene.sync();
      scene.drawOverlay(0);
    }, r.data);
    if (c.kind === 'bowler')
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                window.__game.audio.samples.has('troop-rock_troll_throw_01.ogg') &&
                window.__game.audio.samples.has('troop-rock_troll_throw_02.ogg'),
            ),
          { timeout: 30000 },
        )
        .toBe(true);
    const seek = (at: number) =>
      page.evaluate(
        async ({ at, id }) => {
          const { model, scene } = window.__game,
            { iso } = await import('/src/game/scene.ts'),
            { troopSoundCues, BattleSoundLog } = await import('/src/game/troop-sounds.ts');
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          model.changed();
          scene.sync();
          const u = model.battle.units.find((u) => u.id === id),
            p = iso(u.x + 2, u.y),
            before = JSON.stringify(model.battle);
          scene.cameras.main.useBounds = false;
          scene.cameras.main.setZoom(innerWidth < 500 ? 0.9 : 1.3).centerOn(p.x, p.y - 70);
          scene.cameras.main.preRender();
          scene.drawOverlay(0);
          return {
            battle: before,
            readOnly: before === JSON.stringify(model.battle),
            gl: window.__game.game.renderer.gl.getError(),
            cues: troopSoundCues(model.battle, new BattleSoundLog()).filter((c) =>
              c.key.includes(':preAttack:'),
            ),
          };
        },
        { at, id: r.unitId },
      );
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const result = await seek(s.at);
      expect(JSON.parse(result.battle)).toEqual(s.battle);
      expect(result.readOnly).toBe(true);
      expect(result.gl).toBe(0);
      expect(result.cues).toEqual(
        troopSoundCues(s.battle as any, new BattleSoundLog()).filter((c) =>
          c.key.includes(':preAttack:'),
        ),
      );
      if (s.at === r.impact) {
        const u = JSON.parse(result.battle).units.find((u) => u.id === r.unitId);
        expect(u.target).toBe(c.version >= 197 || c.kind === 'bowler' ? 3 : null);
        if (c.version === 196 && c.kind === 'bowler') {
          expect(u.native.bowler).toMatchObject({
            engaged: true,
            target: { id: 2, building: true },
          });
          expect(result.cues.length).toBeGreaterThan(0);
        }
        if (c.version >= 197) {
          if (c.kind === 'electrodragon') expect(u.native.electroDragon.charge).toBeUndefined();
          else
            expect(
              (c.kind === 'bowler' ? u.native.bowler : u.native.attackWindup).engaged,
            ).toBeUndefined();
          if (c.kind === 'bowler') expect(result.cues).toHaveLength(0);
        }
      }
    }
    await seek(r.draining);
    await page.screenshot({
      path: `output/playtest/angry-charge-${c.kind}-${c.version}-${c.width}.png`,
    });
    const state = await seek(r.impact);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      state.battle,
    );
    expect(errors).toEqual([]);
  });
