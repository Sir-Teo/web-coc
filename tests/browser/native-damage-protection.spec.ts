import { expect, test, type Page } from '@playwright/test';
import { garrisonTomeRecording } from '../fixtures/garrison-tome';
import { nativeRevengeDeckRecording } from '../fixtures/native-revenge-deck';

async function open(page: Page, data: unknown) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene } = window.__game;
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Native damage replay rejected');
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
    const unit = model.battle.units.find((u) => u.hero);
    const { iso } = await import('/src/game/scene.ts');
    const point = iso(unit.x, unit.y);
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setZoom(innerWidth < 500 ? 1.05 : 1.4).centerOn(point.x, point.y - 40);
    const battle = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return { battle, hp: unit.hp, readOnly: battle === JSON.stringify(model.battle) };
  }, at);
}

async function heroVisible(page: Page, id: number) {
  await expect
    .poll(() =>
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
      }, id),
    )
    .toBe(true);
}

for (const [width, version] of [
  [390, 143],
  [1440, 142],
])
  test(`Eternal Tome blocks released Clan Castle damage at ${width}px, version=${version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = garrisonTomeRecording(version),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at);
      expect(actual.battle).toBe(JSON.stringify(snapshot.battle));
      expect(actual.readOnly).toBe(true);
    }
    const primed = await seek(page, r.primed),
      protectedHero = await seek(page, r.protected);
    expect(
      await page.evaluate(() => {
        const b = window.__game.model.battle,
          u = b.units.find((u) => u.hero);
        return (
          u.native.effects.shield.until > b.elapsed && b.defenders.some((d) => d.attackCount > 0)
        );
      }),
    ).toBe(true);
    if (version === 143) expect(protectedHero.hp).toBe(primed.hp);
    else expect(protectedHero.hp).toBeLessThan(primed.hp);
    await heroVisible(page, r.unitId);
    await page.screenshot({ path: `output/playtest/garrison-tome-${version}-${width}.png` });
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      protectedHero.battle,
    );
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await seek(page, r.expired);
    expect(await seek(page, r.protected)).toEqual(protectedHero);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

for (const [width, version] of [
  [1440, 143],
  [390, 142],
])
  test(`Revenge Deck displays independent original cards at ${width}px, version=${version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = nativeRevengeDeckRecording(version),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at);
      expect(actual.battle).toBe(JSON.stringify(snapshot.battle));
      expect(actual.readOnly).toBe(true);
    }
    const flight = await seek(page, r.flight);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            return model.battle.projectiles
              .filter((p) => p.native?.name === 'ddreversalcardprojectile')
              .filter((p) =>
                scene.nativeProjectiles.views
                  .get(p.id)
                  ?.view.objects.some(
                    (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                  ),
              )
              .map((p) => p.targetId);
          }),
        { timeout: 30000 },
      )
      .toEqual(version === 143 ? [2, 3] : [2]);
    await heroVisible(page, r.unitId);
    await page.screenshot({ path: `output/playtest/revenge-deck-${version}-${width}.png` });
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      flight.battle,
    );
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    await seek(page, r.bothHit);
    expect(await seek(page, r.flight)).toEqual(flight);
    if (version === 143) {
      await seek(page, r.before);
      await page.evaluate(async () => {
        const { model, scene } = window.__game,
          b = model.battle,
          u = b.units.find((u) => u.hero);
        const { hurtUnit } = await import('/src/game/native-status.ts');
        hurtUnit(b, u, 100, b.elapsed, 2);
        hurtUnit(b, u, 100, b.elapsed, 3);
        model.step(0.05);
        scene.sync();
      });
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const { model, scene } = window.__game;
              scene.drawOverlay(0);
              const cards = model.battle.projectiles.filter(
                (p) => p.native?.name === 'ddreversalcardprojectile',
              );
              return (
                cards.length === 2 &&
                new Set(cards.map((p) => p.id)).size === 2 &&
                cards.every((p) =>
                  scene.nativeProjectiles.views
                    .get(p.id)
                    ?.view.objects.some(
                      (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                    ),
                )
              );
            }),
          { timeout: 30000 },
        )
        .toBe(true);
      await seek(page, 0);
      expect((await seek(page, r.flight)).battle).toBe(flight.battle);
    }
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
