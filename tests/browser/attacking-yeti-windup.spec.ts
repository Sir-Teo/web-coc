import { expect, test, type Page } from '@playwright/test';
import { attackingYetiRecording, attackingYetiRecallRecording } from '../fixtures/attacking-yeti';

async function seek(page: Page, at: number, id: number, defenderId?: number) {
  return page.evaluate(
    async ({ at, id, defenderId }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const { iso } = await import('/src/game/scene.ts'),
        unit = model.battle.units.find((u) => u.id === id),
        defender = model.battle.defenders?.find((d) => d.id === defenderId),
        p = iso(
          defender ? (unit.x + defender.x) / 2 : unit.x,
          defender ? (unit.y + defender.y) / 2 : unit.y,
        );
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.25 : 1.7).centerOn(p.x, p.y - 40);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle, readOnly: battle === JSON.stringify(model.battle) };
    },
    { at, id, defenderId },
  );
}

for (const c of [
  { version: 175, width: 390, level: 1, superTroop: false, garrison: false },
  { version: 175, width: 1440, level: 8, superTroop: false, garrison: true },
  { version: 175, width: 390, level: 1, superTroop: true, garrison: true },
  { version: 175, width: 1440, level: 8, superTroop: true, garrison: false },
  { version: 174, width: 1440, level: 1, superTroop: false, garrison: true },
  { version: 174, width: 390, level: 8, superTroop: true, garrison: false },
])
  test(`${c.superTroop ? 'Super Yeti' : 'Yeti'} ${c.level} ${c.garrison ? 'guard swings' : 'Cannon swings'} at ${c.width}px, version=${c.version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    const r = attackingYetiRecording(c.version, c.level, c.superTroop, c.garrison),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Yeti family replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const s of r.snapshots) {
      const actual = await seek(page, s.at, r.id, r.defenderId);
      expect(JSON.parse(actual.battle)).toEqual(s.battle);
      expect(actual.readOnly).toBe(true);
    }
    const at = r.charged ?? r.first;
    await seek(page, at, r.id, r.defenderId);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const scene = window.__game.scene;
            scene.drawOverlay(0);
            return (
              scene.troopNativePresentation.views
                .get(id)
                ?.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                ) ?? false
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    if (c.version >= 175)
      expect(
        await page.evaluate(
          (id) =>
            window.__game.model.battle.units.find((u) => u.id === id).native.attackWindup
              .animationOffset,
          r.id,
        ),
      ).toBeLessThan(0);
    const hit = await seek(page, r.first, r.id, r.defenderId);
    if (c.garrison) {
      await expect
        .poll(
          () =>
            page.evaluate(
              ({ id }) => {
                const scene = window.__game.scene;
                scene.drawOverlay(0);
                return (
                  scene.garrisonPresentation.defenders
                    .get(id)
                    ?.objects.some(
                      (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                    ) ?? false
                );
              },
              { id: r.defenderId },
            ),
          { timeout: 30000 },
        )
        .toBe(true);
      const frost = await page.evaluate(
        (id) => window.__game.model.battle.defenders.find((d) => d.id === id).frost,
        r.defenderId,
      );
      expect(frost).toBeUndefined();
    }
    await page.screenshot({
      path: `output/playtest/attacking-yeti-${c.superTroop ? 'super' : 'normal'}-${c.garrison ? 'guard' : 'cannon'}-${c.level}-${c.version}-${c.width}.png`,
    });
    await seek(page, r.born, r.id, r.defenderId);
    expect(await seek(page, r.first, r.id, r.defenderId)).toEqual(hit);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(hit.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

for (const c of [
  { superTroop: false, level: 1, width: 390 },
  { superTroop: true, level: 8, width: 1440 },
])
  test(`Recall restores a fresh ${c.superTroop ? 'Super Yeti' : 'Yeti'} charge at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    const r = attackingYetiRecallRecording(c.superTroop, c.level),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Yeti charge Recall replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    const sample = async (at: number) =>
      page.evaluate(
        async ({ at, id, oldId }) => {
          const { model, scene } = window.__game;
          model.seekReplay(at);
          while (model.replay.seeking) model.step(0.05);
          model.changed();
          scene.sync();
          const { iso } = await import('/src/game/scene.ts'),
            unit = model.battle.units.find((u) => u.id === id || u.id === oldId),
            p = iso(unit?.x ?? 11.4, unit?.y ?? 11.5);
          scene.cameras.main.useBounds = false;
          scene.cameras.main.setZoom(innerWidth < 500 ? 1.25 : 1.7).centerOn(p.x, p.y - 40);
          const battle = JSON.stringify(model.battle);
          scene.drawOverlay(0);
          return { battle, readOnly: battle === JSON.stringify(model.battle) };
        },
        { at, id: r.id, oldId: r.oldId },
      );
    for (const s of r.snapshots) {
      const actual = await sample(s.at);
      expect(JSON.parse(actual.battle)).toEqual(s.battle);
      expect(actual.readOnly).toBe(true);
    }
    const charged = await sample(r.charged!);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            return (
              model.battle.units.find((u) => u.id === id).native.attackWindup.animationOffset < 0 &&
              (scene.troopNativePresentation.views
                .get(id)
                ?.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                ) ??
                false)
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/attacking-yeti-recall-${c.superTroop ? 'super' : 'normal'}-${c.width}.png`,
    });
    await sample(r.engaged);
    expect(await sample(r.charged!)).toEqual(charged);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      charged.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
