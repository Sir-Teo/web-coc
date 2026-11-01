import { expect, test, type Page } from '@playwright/test';
import { troopLauncherRecording } from '../fixtures/attacking-troop-launcher';

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
  { level: 1, version: 223, x: 11.4, friendAt: 1, width: 390 },
  { level: 4, version: 223, x: 5, friendAt: 3, width: 1440 },
  { level: 4, version: 223, x: 11.4, friendAt: 1, width: 390 },
  { level: 1, version: 223, x: 5, friendAt: 3, width: 1440 },
  { level: 4, version: 222, x: 11.4, friendAt: 1, width: 390 },
  { level: 1, version: 222, x: 5, friendAt: 3, width: 1440 },
] as const)
  test(`Troop Launcher ${c.level}, replay${c.version}, alliesAt${c.friendAt} at${c.width}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const r = troopLauncherRecording(c.level, c.version, c.x, c.friendAt),
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
        throw Error('Troop Launcher replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.readOnly).toBe(true);
    }
    const first = r.packets[0],
      meshAt = Math.ceil((first.launched + 0.05) * 20 - 1e-8) / 20;
    await seek(page, meshAt, r.id);
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ id, packet }) => {
              const { scene } = window.__game;
              scene.drawOverlay(0);
              const body = scene.troopNativePresentation.views.get(id),
                flame = scene.nativeProjectiles.views.get(packet);
              const visible = (v) =>
                v?.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                );
              return body?.kind === 'trooplauncher' && visible(body) && visible(flame);
            },
            { id: r.id, packet: first.id },
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/troop-launcher-${c.level}-allies${c.friendAt}-${c.version}-${c.width}.png`,
      animations: 'disabled',
    });
    await seek(page, r.snapshots.at(-1)!.at, r.id);
    expect(
      await page.evaluate(() => !!window.__game.model.battle.nativeTroopLauncherFriendly),
    ).toBe(c.version >= 223);
    if (c.version >= 223) {
      const witness = r.snapshots.find((snapshot) =>
          snapshot.battle.units.some((u) => u.kind === 'giant' && u.hp > 0),
        )!,
        child = witness.battle.units.find((u) => u.kind === 'giant' && u.hp > 0)!;
      await seek(page, witness.at, child.id);
      await page.waitForFunction(() => !window.__game.scene.battleArtPending());
      await expect
        .poll(
          () =>
            page.evaluate((id) => {
              const { scene } = window.__game;
              scene.drawOverlay(0);
              const body = scene.troopNativePresentation.views.get(id);
              return (
                body?.kind === 'giant' &&
                body.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                )
              );
            }, child.id),
          { timeout: 30000 },
        )
        .toBe(true);
    }
    const beforeReduced = JSON.stringify(await page.evaluate(() => window.__game.model.battle));
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      beforeReduced,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
