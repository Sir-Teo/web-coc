import { expect, test } from '@playwright/test';
import { houndDeathRecording } from '../fixtures/hound-death';

for (const c of [
  { version: 170, width: 390, ice: false, level: 1 },
  { version: 170, width: 1440, ice: false, level: 8 },
  { version: 170, width: 390, ice: true, level: 8 },
  { version: 170, width: 1440, ice: true, level: 1 },
  { version: 169, width: 1440, ice: false, level: 8 },
  { version: 169, width: 390, ice: true, level: 8 },
])
  test(`${c.ice ? 'Ice' : 'Lava'} Hound ${c.level} actual death wave at ${c.width}px, v${c.version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    // The historical path intentionally keeps host libm, so capture its expected states in Chromium.
    const r =
      c.version === 170
        ? houndDeathRecording(c.version, c.ice, c.level)
        : await page.evaluate(async (c) => {
            const { houndDeathRecording } = await import('/tests/fixtures/hound-death.ts');
            return houndDeathRecording(c.version, c.ice, c.level);
          }, c);
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Hound wave replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    const seek = async (at: number) =>
      page.evaluate(
        async ({ at, id }) => {
          const { model, scene } = window.__game;
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          model.changed();
          scene.sync();
          const { iso } = await import('/src/game/scene.ts'),
            parent = model.battle.units.find((u) => u.id === id),
            point = iso(parent.x, parent.y);
          scene.cameras.main.useBounds = false;
          scene.cameras.main.setZoom(innerWidth < 500 ? 1.1 : 1.5).centerOn(point.x, point.y - 80);
          const battle = JSON.stringify(model.battle);
          scene.drawOverlay(0);
          return { battle, readOnly: battle === JSON.stringify(model.battle) };
        },
        { at, id: r.id },
      );
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const actual = await seek(snapshot.at);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    await seek(r.moving);
    await expect
      .poll(
        () =>
          page.evaluate((ids) => {
            const scene = window.__game.scene;
            scene.drawOverlay(0);
            return ids.filter((id) =>
              scene.troopNativePresentation.views
                .get(id)
                ?.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                ),
            ).length;
          }, r.children),
        { timeout: 30000 },
      )
      .toBe(r.children.length);
    await page.screenshot({
      path: `output/playtest/hound-death-wave-${c.ice ? 'ice' : 'lava'}-${c.level}-${c.version}-${c.width}.png`,
    });
    const before = await page.evaluate(() => JSON.stringify(window.__game.model.battle));
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
