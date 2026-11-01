import { expect, test, type Page } from '@playwright/test';
import { flameFlingerOverlapRecording } from '../fixtures/flame-flinger-overlap';

async function seek(page: Page, at: number, id: number, body = false) {
  return page.evaluate(
    async ({ at, id, body }) => {
      const { model, scene } = window.__game,
        { iso } = await import('/src/game/scene.ts');
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const unit = model.battle.units.find((u) => u.id === id),
        point = body
          ? iso(unit.x, unit.y)
          : model.battle.nativeSpells?.some((c) => c.name === 'FireSpiritExplosion')
            ? iso(15, 12.5)
            : iso(unit.x + 2, unit.y),
        before = JSON.stringify(model.battle);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.05 : 1.6).centerOn(point.x, point.y - 45);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id, body },
  );
}

for (const c of [
  { level: 1, version: 227, x: 5, width: 390 },
  { level: 5, version: 227, x: 11.4, width: 1440 },
  { level: 5, version: 226, x: 5, width: 390 },
  { level: 1, version: 226, x: 11.4, width: 1440 },
] as const)
  test(`Flame Flinger overlap ${c.level}, replay${c.version} at${c.width}`, async ({ page }) => {
    test.setTimeout(180000);
    const r = flameFlingerOverlapRecording(c.level, c.version, c.x),
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
        throw Error('Flame Flinger replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.readOnly).toBe(true);
    }
    await seek(page, r.first + 0.05, r.id, true);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            const body = scene.troopNativePresentation.views.get(id);
            return (
              body?.kind === 'flameflinger' &&
              body.view.objects.some(
                (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
              )
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    const guide = await page.evaluate(() => {
      const { hud, model } = window.__game;
      hud.inspectedTroop = 'flameflinger';
      const before = JSON.stringify(model.battle),
        doc = new DOMParser().parseFromString(hud.troopInfo(), 'text/html');
      return {
        labels: [...doc.querySelectorAll('.troop-stats dt')].map((el) => el.textContent),
        readOnly: before === JSON.stringify(model.battle),
      };
    });
    expect(guide.readOnly).toBe(true);
    expect(guide.labels.includes('Overlapping areas')).toBe(c.version >= 227);
    expect(guide.labels.includes('Maximum sustained burn DPS')).toBe(c.version >= 227);
    expect(guide.labels.includes('Wall bonus per burn pulse')).toBe(true);
    await seek(page, r.overlap + 5.2, r.id);
    await page.screenshot({
      path: `output/playtest/flame-flinger-overlap-${c.level}-${c.version}-${c.width}.png`,
      animations: 'disabled',
    });
    const last = await seek(page, r.snapshots.at(-1)!.at, r.id);
    expect(
      await page.evaluate(() => !!window.__game.model.battle.nativeFlameFlingerBurnOverlap),
    ).toBe(c.version >= 227);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
