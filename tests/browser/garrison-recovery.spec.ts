import { expect, test, type Page } from '@playwright/test';
import { garrisonRecoveryRecording } from '../fixtures/garrison-recovery';

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

for (const { kind, version, width } of [
  { kind: 'electrodragon', version: 153, width: 390 },
  { kind: 'bowler', version: 153, width: 1440 },
  { kind: 'golem', version: 153, width: 390 },
  { kind: 'lavahound', version: 153, width: 1440 },
  { kind: 'electrodragon', version: 152, width: 1440 },
  { kind: 'bowler', version: 152, width: 390 },
] as const)
  test(`${kind} source recovery at ${width}px, version=${version}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = garrisonRecoveryRecording(kind, version),
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
        throw Error('Recovery replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    const actual = await seek(page, r.returned, r.id);
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
      path: `output/playtest/garrison-recovery-${kind}-${version}-${width}.png`,
    });
    await seek(page, r.first, r.id);
    expect(await seek(page, r.returned, r.id)).toEqual(actual);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      actual.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
