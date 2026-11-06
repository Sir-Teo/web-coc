import { expect, test } from '@playwright/test';
import { iceGolemDeathRecording } from '../fixtures/ice-golem-death';
import { iceGolemGarrisonRecording } from '../fixtures/ice-golem-garrison';

for (const side of ['attack', 'defense'] as const)
  for (const width of [1440, 390])
    test(`original Ice Golem ${side} death frost, preloading and rewind at ${width}px`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      const r = side === 'attack' ? iceGolemDeathRecording() : iceGolemGarrisonRecording();
      const name = side === 'attack' ? 'IceGolemFreeze' : 'IceGolemFreeze_DEF';
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.evaluate(async (data) => {
        const { model, scene } = window.__game;
        const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
        scene.paused = true;
        if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
          throw Error('Frost replay rejected');
        model.replay.paused = true;
        scene.sync();
      }, r.data);
      await expect
        .poll(
          () =>
            page.evaluate((name) => {
              const { model, scene } = window.__game;
              scene.drawOverlay(0);
              return scene.fieldSpellPresentations.get(name).hasArt(model.battle, false);
            }, name),
          { timeout: 30000 },
        )
        .toBe(true);
      const sample = async (at: number) =>
        page.evaluate(
          async ({ at, name }) => {
            const { model, scene, game } = window.__game;
            model.seekReplay(at);
            while (model.replay.seeking) model.step(0.05);
            model.changed();
            scene.sync();
            const cast = model.battle.nativeSpellCastHistory?.find((c) => c.name === name);
            const { iso } = await import('/src/game/scene.ts');
            if (cast) {
              const p = iso(cast.x, cast.y);
              scene.cameras.main.useBounds = false;
              scene.cameras.main.setZoom(innerWidth < 500 ? 0.7 : 1.1).centerOn(p.x, p.y);
            }
            const before = JSON.stringify(model.battle);
            scene.drawOverlay(0);
            const layer = scene.fieldSpellPresentations.get(name).layer;
            const objects = [...layer.views.values()]
              .flatMap((v) => v.objects)
              .filter((o) => o.visible && o.alpha > 0);
            return {
              battle: JSON.parse(before),
              readOnly: before === JSON.stringify(model.battle),
              emitters: [...new Set(objects.map((o) => o.getData('nativeEffect')))].sort(),
              missing: objects.some((o) => o.texture.key === '__MISSING'),
              gl: game.renderer.gl.getError(),
            };
          },
          { at, name },
        );
      const actual = await sample(r.frozen);
      expect(actual.battle).toEqual(r.snapshots.find((s) => s.at === r.frozen)!.battle);
      expect(actual.readOnly).toBe(true);
      expect(actual.emitters.some((e) => e.startsWith('IceGolem Freeze'))).toBe(true);
      expect(actual.missing).toBe(false);
      expect(actual.gl).toBe(0);
      await page.screenshot({ path: `output/playtest/ice-golem-${side}-frost-${width}.png` });
      await sample(r.snapshots.at(-1)!.at);
      expect(await sample(r.frozen)).toEqual(actual);
      const reduced = await page.evaluate((name) => {
        const { model, scene } = window.__game;
        const before = JSON.stringify(model.battle);
        model.toggleReducedMotion();
        scene.drawOverlay(0);
        return {
          unchanged: before === JSON.stringify(model.battle),
          visible: [...scene.fieldSpellPresentations.get(name).layer.views.values()].some((v) =>
            v.objects.some((o) => o.visible),
          ),
        };
      }, name);
      expect(reduced).toEqual({ unchanged: true, visible: false });
      expect(errors).toEqual([]);
    });
