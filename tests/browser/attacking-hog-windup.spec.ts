import { expect, test, type Page } from '@playwright/test';
import {
  attackingHogRecording,
  attackingHogHalvesRecording,
  hogPuppetRecording,
} from '../fixtures/attacking-hog';

async function open(page: Page, data: unknown, width: number, warm?: number[]) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  if (warm) {
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { replayBattle } = await import('/src/game/replay.ts');
      scene.paused = true;
      model.battle = replayBattle(data.initial, data.version);
      model.changed();
      scene.sync();
    }, data);
    await page.waitForFunction(
      (levels) => {
        const ready = window.__game.scene.troopNativePresentation.levelsReady.get('hogrider');
        return levels.every((level) => ready?.has(level));
      },
      warm,
      { timeout: 15000 },
    );
    expect(await page.evaluate(() => window.__game.model.battle.units)).toEqual([]);
  }
  await page.evaluate(async (data) => {
    const { model, scene } = window.__game,
      { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (model.battle && !model.replay) model.returnHome();
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Hog attack recording rejected');
    model.replay.paused = true;
    scene.sync();
  }, data);
  return errors;
}
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
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.5 : 1.8).centerOn(p.x, p.y - 45);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle, readOnly: battle === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}
async function body(page: Page, id: number) {
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return (
            scene.heroNativePresentation.drewUnit(id) ||
            (scene.troopNativePresentation.views
              .get(id)
              ?.view.objects.some(
                (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
              ) ??
              false)
          );
        }, id),
      { timeout: 30000 },
    )
    .toBe(true);
}
async function snapshots(
  page: Page,
  r: { snapshots: { at: number; battle: unknown }[] },
  id: number,
) {
  for (const s of r.snapshots) {
    const actual = await seek(page, s.at, id);
    expect(JSON.parse(actual.battle)).toEqual(s.battle);
    expect(actual.readOnly).toBe(true);
  }
}
async function finish(page: Page, battle: string, errors: string[]) {
  await page.evaluate(() => window.__game.model.toggleReducedMotion());
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(battle);
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  expect(errors).toEqual([]);
}

test('Hog Rider Puppet warms laboratory and equipment tiers together', async ({ page }) => {
  test.setTimeout(120000);
  const r = hogPuppetRecording(18, 177, true),
    errors = await open(page, r.data, 390, [1, 12]);
  expect(r.data.initial.troopLevels!.hogrider).toBe(1);
  await snapshots(page, r, r.id);
  const charged = await seek(page, r.charged!, r.id);
  await body(page, r.id);
  await finish(page, charged.battle, errors);
});

for (const c of [
  { kind: 'hogrider', level: 1, width: 390, version: 177 },
  { kind: 'hogrider', level: 15, width: 1440, version: 177 },
  { kind: 'superhogrider', level: 1, width: 390, version: 177 },
  { kind: 'superhogrider', level: 12, width: 1440, version: 177 },
  { kind: 'hogrider', level: 15, width: 390, version: 176 },
  { kind: 'superhogrider', level: 12, width: 1440, version: 176 },
] as const)
  test(`${c.kind} ${c.level} source windup at ${c.width}px, version=${c.version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = attackingHogRecording(c.kind, c.level, c.version),
      errors = await open(page, r.data, c.width);
    await snapshots(page, r, r.id);
    const at = r.charged ?? r.first;
    const charged = await seek(page, at, r.id);
    await body(page, r.id);
    if (c.version >= 177)
      expect(
        await page.evaluate(
          (id) =>
            window.__game.model.battle.units.find((u) => u.id === id).native.attackWindup
              .animationOffset,
          r.id,
        ),
      ).toBeLessThan(0);
    await page.screenshot({
      path: `output/playtest/attacking-${c.kind}-${c.level}-${c.version}-${c.width}.png`,
    });
    await seek(page, r.born, r.id);
    expect(await seek(page, at, r.id)).toEqual(charged);
    await finish(page, charged.battle, errors);
  });

for (const c of [
  { level: 1, width: 390 },
  { level: 12, width: 1440 },
])
  test(`split Hog and Rider ${c.level} have independent attacks at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = attackingHogHalvesRecording(c.level),
      errors = await open(page, r.data, c.width);
    await snapshots(page, r, r.id);
    for (const id of [r.hogId, r.riderId]) {
      await seek(page, r.first[id], id);
      await body(page, id);
    }
    const last = r.snapshots.at(-1)!;
    await seek(page, r.died, r.id);
    expect(JSON.parse((await seek(page, last.at, r.riderId)).battle)).toEqual(last.battle);
    await page.screenshot({
      path: `output/playtest/attacking-split-hogs-${c.level}-${c.width}.png`,
    });
    await finish(page, JSON.stringify(last.battle), errors);
  });

for (const c of [
  { item: 1, width: 390, version: 177 },
  { item: 18, width: 1440, version: 177 },
  { item: 18, width: 390, version: 176 },
])
  test(`Hog Rider Puppet ${c.item} summons fixed-tier bodies at ${c.width}px, version=${c.version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = hogPuppetRecording(c.item, c.version),
      errors = await open(page, r.data, c.width, c.version >= 177 ? [r.level] : []);
    await snapshots(page, r, r.id);
    const at = r.charged ?? r.first,
      charged = await seek(page, at, r.id);
    await body(page, r.id);
    await body(page, r.heroId);
    if (c.version >= 177)
      expect(
        await page.evaluate(
          (id) =>
            window.__game.model.battle.units.find((u) => u.id === id).native.attackWindup
              .animationOffset,
          r.id,
        ),
      ).toBeLessThan(0);
    await page.screenshot({
      path: `output/playtest/hog-puppet-${c.item}-${c.version}-${c.width}.png`,
    });
    await seek(page, r.second, r.id);
    expect(await seek(page, at, r.id)).toEqual(charged);
    await finish(page, charged.battle, errors);
  });
