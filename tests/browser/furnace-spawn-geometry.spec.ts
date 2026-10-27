import { expect, test, type Page } from '@playwright/test';
import { furnaceSpawnGeometryRecording } from '../fixtures/furnace-spawn-geometry';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const unit = model.battle.units.find((u) => u.id === id) ?? model.battle.units[0],
        { iso } = await import('/src/game/scene.ts'),
        p = iso(unit.x, unit.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.1 : 1.5).centerOn(p.x, p.y - 40);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle, readOnly: battle === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

for (const { version, level, width } of [
  { version: 151, level: 1, width: 390 },
  { version: 151, level: 4, width: 1440 },
  { version: 150, level: 1, width: 1440 },
  { version: 150, level: 4, width: 390 },
])
  test(`Furnace ${level} full-stock geometry at ${width}px, version=${version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    let r = furnaceSpawnGeometryRecording(level, version);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    // Historical trig is intentionally host-dependent. Retain that path and compare its
    // complete recording within Chromium; current recordings must match Node bit-for-bit.
    if (version === 150)
      r = await page.evaluate(
        async ({ level, version }) => {
          const path = '/tests/fixtures/furnace-spawn-geometry.ts',
            { furnaceSpawnGeometryRecording } = await import(path);
          return furnaceSpawnGeometryRecording(level, version);
        },
        { level, version },
      );
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Furnace geometry replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const actual = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    const last = r.snapshots.at(-1)!,
      actual = await seek(page, last.at, r.id);
    expect(
      await page.evaluate(
        (id) => window.__game.model.battle.units.find((u) => u.id === id).native.released,
        r.id,
      ),
    ).toBe(level === 1 ? 19 : 22);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      actual.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
