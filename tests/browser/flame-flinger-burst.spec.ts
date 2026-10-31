import { expect, test, type Page } from '@playwright/test';
import { flameFlingerBurstRecording } from '../fixtures/flame-flinger-burst';

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
        point = iso(unit.x, unit.y),
        before = JSON.stringify(model.battle);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.8 : 2.3).centerOn(point.x, point.y - 45);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

for (const c of [
  { level: 1, version: 228, x: 11.4, target: 'storage', width: 390 },
  { level: 5, version: 228, x: 5, target: 'storage', width: 1440 },
  { level: 5, version: 228, x: 11.4, target: 'garrison', width: 1440 },
  { level: 5, version: 228, x: 11.4, target: 'air-garrison', width: 390 },
  { level: 5, version: 227, x: 5, target: 'storage', width: 390 },
  { level: 1, version: 227, x: 11.4, target: 'storage', width: 1440 },
] as const)
  test(`Flame Flinger burst ${c.level}, ${c.target}, replay${c.version} at${c.width}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const r = flameFlingerBurstRecording(c.level, c.version, c.x, c.target),
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
        throw Error('Flame Flinger burst replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.readOnly).toBe(true);
    }
    const first = r.packets[0];
    if (!first) throw Error('Flame Flinger recording has no release');
    const releaseAt = Math.ceil(first.launched * 20 - 1e-8) / 20;
    await seek(page, releaseAt, r.id);
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ id, version, packet }) => {
              const { scene } = window.__game;
              scene.drawOverlay(0);
              const body = scene.troopNativePresentation.views.get(id),
                flight = scene.nativeProjectiles.views.get(packet),
                visible = (v) =>
                  v?.view.objects.some(
                    (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                  );
              return (
                body?.kind === 'flameflinger' &&
                (version < 228 || body.sample.frame === 6) &&
                visible(body) &&
                visible(flight)
              );
            },
            { id: r.id, version: c.version, packet: first.id },
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    const guide = await page.evaluate(() => {
      const { model, hud } = window.__game;
      hud.inspectedTroop = 'flameflinger';
      const before = JSON.stringify(model.battle),
        doc = new DOMParser().parseFromString(hud.troopInfo(), 'text/html');
      return {
        labels: [...doc.querySelectorAll('.troop-stats dt')].map((el) => el.textContent),
        readOnly: before === JSON.stringify(model.battle),
      };
    });
    expect(guide.readOnly).toBe(true);
    expect(guide.labels.includes('Damage per projectile')).toBe(c.version >= 228);
    expect(guide.labels.includes('Damage per hit')).toBe(c.version < 228);
    expect(guide.labels.includes('Shots per burst')).toBe(c.version >= 228);
    expect(guide.labels.includes('Overlapping areas')).toBe(true);
    await page.screenshot({
      path: `output/playtest/flame-flinger-burst-${c.level}-${c.target}-${c.version}-${c.width}.png`,
      animations: 'disabled',
    });
    const last = await seek(page, r.snapshots.at(-1)!.at, r.id);
    expect(await page.evaluate(() => !!window.__game.model.battle.nativeFlameFlingerBursts)).toBe(
      c.version >= 228,
    );
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
