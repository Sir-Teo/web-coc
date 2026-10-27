import { expect, test, type Page } from '@playwright/test';
import { heroRegenerationRecallRecording } from '../fixtures/hero-regeneration';
import { heroAuraRevivalRecording } from '../fixtures/hero-aura-revival';

async function open(page: Page, data: unknown) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene } = window.__game;
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Regeneration replay rejected');
    scene.sync();
  }, data);
}

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const hero = model.battle.nativeHeroes[0],
      unit = model.battle.units.find((u) => u.id === hero.unitId);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(unit?.x ?? 6.9, unit?.y ?? 11.5);
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setZoom(innerWidth < 500 ? 1.05 : 1.5).centerOn(point.x, point.y - 40);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return {
      battle: before,
      hp: unit?.hp ?? null,
      readOnly: before === JSON.stringify(model.battle),
    };
  }, at);
}

for (const { slug, width, version } of [
  { slug: 'giant-gauntlet', width: 1440 },
  { slug: 'fire-heart', width: 390 },
  { slug: 'giant-gauntlet', width: 1440, version: 138 },
] as const)
  test(`${slug} self-healing follows redeployment time at ${width}px, version=${version ?? 'current'}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = heroRegenerationRecallRecording(slug, version),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, r.data);
    for (const s of r.snapshots) {
      const actual = await seek(page, s.at);
      expect(actual.battle).toBe(JSON.stringify(s.battle));
      expect(actual.readOnly).toBe(true);
    }
    const first = await seek(page, r.afterDeploy);
    if (version === 138) expect(first.hp).toBeGreaterThan(r.recalledHp);
    else expect(first.hp).toBe(r.recalledHp);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const scene = window.__game.scene;
            scene.drawOverlay(0);
            return scene.children.list.some(
              (o) =>
                o.visible &&
                o.alpha > 0 &&
                o.getData?.('nativeHero') === id &&
                o.texture?.key.startsWith('baked:heroes-native/'),
            );
          }, r.unitId),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/hero-regeneration-${slug}-${version ?? 139}-${width}.png`,
    });
    expect((await seek(page, r.beforeTick)).battle).toBe(
      JSON.stringify(r.snapshots.find((s) => s.at === r.beforeTick)!.battle),
    );
    const tick = await seek(page, r.firstTick);
    if (version !== 138) expect(tick.hp).toBe(r.recalledHp + (slug === 'fire-heart' ? 50 : 6));
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(tick.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await seek(page, r.held);
    expect(await seek(page, r.afterDeploy)).toEqual(first);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('Revive shows its restored Champion HP without a burst of overdue regeneration on phone', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const r = heroAuraRevivalRecording('electro-boots', 'revive');
  await open(page, r.data);
  const restored = await seek(page, r.restored);
  expect(restored.battle).toBe(
    JSON.stringify(r.snapshots.find((s) => s.at === r.restored)!.battle),
  );
  const maxHp = await page.evaluate(
    () => window.__game.model.battle.units.find((u) => u.hero === 'champion').maxHp,
  );
  expect(restored.hp).toBeCloseTo(maxHp * 0.6, 10);
  const later = await seek(page, r.later);
  expect(later.hp).toBeCloseTo(restored.hp + 6, 10);
  expect(later.readOnly).toBe(true);
  await seek(page, r.dead);
  expect(await seek(page, r.restored)).toEqual(restored);
});
