import { expect, test, type Page } from '@playwright/test';
import { flameFlingerBurnRecording } from '../fixtures/flame-flinger-wall-burn';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game,
        { iso } = await import('/src/game/scene.ts');
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const unit = model.battle.units.find((u) => u.id === id),
        point = model.battle.nativeSpells?.some((c) => c.name === 'FireSpiritExplosion')
          ? iso(15, 12.5)
          : iso(unit.x + 2, unit.y),
        before = JSON.stringify(model.battle);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.05 : 1.6).centerOn(point.x, point.y - 45);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

for (const c of [
  { level: 1, version: 226, x: 5, width: 390 },
  { level: 5, version: 226, x: 11.4, width: 1440 },
  { level: 5, version: 225, x: 5, width: 390 },
  { level: 1, version: 225, x: 11.4, width: 1440 },
] as const)
  test(`Flame Flinger ${c.level}, replay${c.version} at${c.width}`, async ({ page }) => {
    test.setTimeout(180000);
    const r = flameFlingerBurnRecording(c.level, c.version, c.x),
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
    await seek(page, r.launched + 0.05, r.id);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const { scene, model } = window.__game;
            scene.drawOverlay(0);
            const body = scene.troopNativePresentation.views.get(id),
              packet = model.battle.projectiles.find((p) => p.native?.kind === 'flameflinger'),
              flight = packet && scene.nativeProjectiles.views.get(packet.id),
              visible = (v) =>
                v?.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                );
            return body?.kind === 'flameflinger' && visible(body) && visible(flight);
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    await seek(page, r.pulsed, r.id);
    const loss = await page.evaluate(() => {
      const b = window.__game.model.battle,
        wall = b.buildings.find((b) => b.id === 3),
        storage = b.buildings.find((b) => b.id === 4);
      return { wall: wall.maxHp - wall.hp, storage: storage.maxHp - storage.hp };
    });
    expect(loss.wall - loss.storage).toBeCloseTo(c.version >= 226 ? 24 : 0, 8);
    await page.screenshot({
      path: `output/playtest/flame-flinger-${c.level}-${c.version}-${c.width}.png`,
      animations: 'disabled',
    });
    const last = await seek(page, r.snapshots.at(-1)!.at, r.id);
    expect(
      await page.evaluate(() => !!window.__game.model.battle.nativeFlameFlingerWallPulse),
    ).toBe(c.version >= 226);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
