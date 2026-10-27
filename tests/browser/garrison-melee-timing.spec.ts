import { expect, test, type Page } from '@playwright/test';
import { garrisonMeleeTimingRecording } from '../fixtures/garrison-melee-timing';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const unit = model.battle.defenders.find((d) => d.id === id) ?? model.battle.units[0],
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

for (const { kind, version, width, frozen } of [
  { kind: 'pekka', version: 152, width: 390, frozen: false },
  { kind: 'valkyrie', version: 152, width: 1440, frozen: false },
  { kind: 'pekka', version: 151, width: 1440, frozen: false },
  { kind: 'valkyrie', version: 151, width: 390, frozen: false },
  { kind: 'pekka', version: 152, width: 1440, frozen: true },
  { kind: 'valkyrie', version: 152, width: 390, frozen: true },
] as const)
  test(`${kind} original split-timer attacks at ${width}px, version=${version}, Freeze=${frozen}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = garrisonMeleeTimingRecording(kind, version, frozen),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Melee timing replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    const frame = frozen ? r.frozen! : r.first,
      actual = await seek(page, frame, r.id);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const scene = window.__game.scene;
            scene.drawOverlay(0);
            return (
              scene.garrisonPresentation.defenders
                .get(id)
                ?.objects.some(
                  (o) =>
                    o.visible &&
                    o.alpha > 0 &&
                    typeof o.texture?.key === 'string' &&
                    o.texture.key !== '__MISSING',
                ) ?? false
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/garrison-melee-${kind}-${version}-${width}-${frozen}.png`,
    });
    await seek(page, r.spawned, r.id);
    expect(await seek(page, frame, r.id)).toEqual(actual);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      actual.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
