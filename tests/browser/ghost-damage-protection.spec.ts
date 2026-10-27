import { expect, test, type Page } from '@playwright/test';
import { ghostDefenseRecording } from '../fixtures/ghost-defense';

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const hero = model.battle.units.find((u) => u.hero),
      { iso } = await import('/src/game/scene.ts'),
      p = iso(hero.x, hero.y);
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setZoom(innerWidth < 500 ? 1.1 : 1.4).centerOn(p.x, p.y - 40);
    const battle = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return { battle, readOnly: battle === JSON.stringify(model.battle) };
  }, at);
}

for (const { mode, width, version } of [
  { mode: 'tome', width: 390, version: 147 },
  { mode: 'snake', width: 1440, version: 147 },
  { mode: 'tome', width: 1440, version: 146 },
  { mode: 'snake', width: 390, version: 146 },
] as const)
  test(`trap-only ${mode} damage rules at ${width}px, version=${version}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = ghostDefenseRecording(mode, version),
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
        throw Error('Ghost defense replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    const at = mode === 'tome' ? r.first : r.spawned,
      state = await seek(page, at);
    const result = await page.evaluate(
      ({ mode, allyId, heroId }) => {
        const b = window.__game.model.battle,
          u = b.units.find((u) => u.id === (mode === 'tome' ? allyId : heroId));
        return {
          hp: u.hp,
          maxHp: u.maxHp,
          shield: u.native?.effects?.shield,
          elapsed: b.elapsed,
          damage: u.native?.damageTaken ?? 0,
          snakes: b.units.filter((u) => u.kind === 'snake').map((u) => u.id),
          hasCastle: !!b.garrisons?.length,
        };
      },
      { mode, allyId: r.allyId, heroId: r.heroId },
    );
    expect(result.hasCastle).toBe(false);
    if (mode === 'tome') {
      expect(result.shield.until).toBeGreaterThan(result.elapsed);
      expect(result.hp).toBe(result.maxHp - (version === 147 ? 0 : 720));
    } else {
      expect(result.damage).toBe(version === 147 ? 720 : 0);
      expect(result.snakes).toHaveLength(version === 147 ? 2 : 0);
    }
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ heroId, ghostId, snakes }) => {
              const s = window.__game.scene;
              s.drawOverlay(0);
              return (
                s.children.list.some(
                  (o) =>
                    o.visible &&
                    o.alpha > 0 &&
                    o.getData?.('nativeHero') === heroId &&
                    o.texture?.key.startsWith('baked:heroes-native/'),
                ) &&
                s.garrisonPresentation.defenders
                  .get(ghostId)
                  ?.objects.some(
                    (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                  ) &&
                snakes.every((id) =>
                  s.troopNativePresentation.views
                    .get(id)
                    ?.view.objects.some(
                      (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                    ),
                )
              );
            },
            { heroId: r.heroId, ghostId: r.ghostId, snakes: result.snakes },
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/ghost-defense-${mode}-${version}-${width}.png`,
    });
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      state.battle,
    );
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await seek(page, r.primed);
    expect(await seek(page, at)).toEqual(state);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
