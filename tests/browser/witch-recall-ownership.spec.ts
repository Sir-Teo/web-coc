import { expect, test, type Page } from '@playwright/test';
import { witchRecallRecording } from '../fixtures/witch-recall';

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

for (const { kind, width, version } of [
  { kind: 'witch', width: 1440, version: 148 },
  { kind: 'superwitch', width: 390, version: 148 },
  { kind: 'witch', width: 390, version: 147 },
  { kind: 'superwitch', width: 1440, version: 147 },
] as const)
  test(`${kind} preserves its Recall summon ownership at ${width}px, version=${version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = witchRecallRecording(kind, version),
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
        throw Error('Witch Recall replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.newId);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    const settled = await seek(page, r.settled, r.newId),
      counts = await page.evaluate((kind) => {
        const b = window.__game.model.battle,
          children = b.units.filter(
            (u) => u.kind === (kind === 'witch' ? 'skeleton' : 'bigboy') && u.hp > 0,
          );
        return {
          count: children.length,
          owners: [...new Set(children.map((u) => u.native.owner))],
        };
      }, kind);
    expect(counts.count).toBe(
      kind === 'witch' ? (version === 148 ? 4 : 8) : version === 148 ? 1 : 2,
    );
    expect(counts.owners).toEqual(version === 148 ? [r.oldId] : [r.oldId, r.newId]);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const s = window.__game.scene;
            s.drawOverlay(0);
            return (
              s.troopNativePresentation.views
                .get(id)
                ?.view.objects.some(
                  (o) =>
                    o.visible &&
                    o.alpha > 0 &&
                    typeof o.texture?.key === 'string' &&
                    o.texture.key !== '__MISSING',
                ) ?? false
            );
          }, r.newId),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/witch-recall-${kind}-${version}-${width}.png` });
    await seek(page, r.full, r.oldId);
    await expect
      .poll(
        () =>
          page.evaluate((ids) => {
            const s = window.__game.scene;
            s.drawOverlay(0);
            return ids.every((id) =>
              s.troopNativePresentation.views
                .get(id)
                ?.view.objects.some(
                  (o) =>
                    o.visible &&
                    o.alpha > 0 &&
                    typeof o.texture?.key === 'string' &&
                    o.texture.key !== '__MISSING',
                ),
            );
          }, r.childIds),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/witch-recall-children-${kind}-${version}-${width}.png`,
    });
    expect(await seek(page, r.settled, r.newId)).toEqual(settled);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      settled.battle,
    );
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await seek(page, r.held, r.oldId);
    expect(await seek(page, r.settled, r.newId)).toEqual(settled);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
