import { expect, test, type Page } from '@playwright/test';
import { attackingMinerRecording } from '../fixtures/attacking-miner';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const { iso } = await import('/src/game/scene.ts'),
        unit = model.battle.units.find((u) => u.id === id),
        p = iso(unit.x, unit.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.4 : 1.8).centerOn(p.x, p.y - 40);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return {
        battle,
        readOnly: battle === JSON.stringify(model.battle),
        burrowed: !!unit.native.burrowed,
      };
    },
    { at, id },
  );
}

for (const c of [
  { version: 178, level: 1, width: 390, garrison: false },
  { version: 178, level: 12, width: 1440, garrison: false },
  { version: 178, level: 1, width: 1440, garrison: true },
  { version: 178, level: 12, width: 390, garrison: true },
  { version: 177, level: 1, width: 390, garrison: true },
  { version: 177, level: 12, width: 1440, garrison: true },
])
  test(`Miner ${c.level} ${c.garrison ? 'Castle' : 'Cannon'} windups at ${c.width}px, version=${c.version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = attackingMinerRecording(c.version, c.level, c.garrison),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Miner windup replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const s of r.snapshots) {
      const actual = await seek(page, s.at, r.id);
      expect(JSON.parse(actual.battle)).toEqual(s.battle);
      expect(actual.readOnly).toBe(true);
    }
    expect((await seek(page, r.born, r.id)).burrowed).toBe(true);
    const at = r.charged ?? r.first,
      charged = await seek(page, at, r.id);
    expect(charged.burrowed).toBe(false);
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
    if (c.version >= 178)
      expect(
        await page.evaluate(
          (id) =>
            window.__game.model.battle.units.find((u) => u.id === id).native.attackWindup
              .animationOffset,
          r.id,
        ),
      ).toBeLessThan(0);
    await page.screenshot({
      path: `output/playtest/attacking-miner-${c.level}-${c.garrison}-${c.version}-${c.width}.png`,
    });
    await seek(page, r.born, r.id);
    expect(await seek(page, at, r.id)).toEqual(charged);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      charged.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
