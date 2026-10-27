import { expect, test, type Page } from '@playwright/test';
import { witchFlightRecording } from '../fixtures/witch-flight';

async function seek(page: Page, at: number, shot: { x: number; y: number }) {
  return page.evaluate(
    async ({ at, shot }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const { iso } = await import('/src/game/scene.ts'),
        point = iso(shot.x, shot.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.5 : 1.9).centerOn(point.x, point.y - 40);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle, readOnly: battle === JSON.stringify(model.battle) };
    },
    { at, shot },
  );
}
async function particles(page: Page, shotId: string) {
  return page.evaluate((shotId) => {
    const scene = window.__game.scene;
    scene.drawOverlay(0);
    return [...scene.nativeProjectiles.layer.views.entries()]
      .filter(([key]) => key.includes(`${shotId}:trail`))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, view]) => ({
        key,
        meshes: [...view.meshes]
          .filter(([, m]) => m.visible && m.alpha > 0)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, m]) => [key, m.vertices, m.alpha]),
        visible: view.objects
          .filter(
            (o) =>
              o.visible &&
              o.alpha > 0 &&
              o.texture?.key !== '__MISSING' &&
              o.getData('nativeEffect') === 'witch_trail_emitter',
          )
          .map((o) => ({
            texture: o.texture.key,
            x: o.x,
            y: o.y,
            alpha: o.alpha,
            depth: o.depth,
            angle: o.angle,
            scaleX: o.scaleX,
            scaleY: o.scaleY,
          }))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      }));
  }, shotId);
}
for (const c of [
  { version: 167, width: 390, superTroop: false, level: 1 },
  { version: 167, width: 1440, superTroop: false, level: 8 },
  { version: 167, width: 390, superTroop: true, level: 8 },
  { version: 167, width: 1440, superTroop: true, level: 1 },
  { version: 166, width: 1440, superTroop: false, level: 1 },
  { version: 166, width: 390, superTroop: true, level: 8 },
])
  test(`${c.superTroop ? 'Super Witch' : 'Witch'} ${c.level} trail tail after cold seek, version=${c.version}, ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    const r = witchFlightRecording(c.version, c.superTroop, c.level),
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
        throw Error('Witch flight replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    for (const snapshot of r.snapshots) {
      const actual = await seek(page, snapshot.at, r.shot);
      expect(JSON.parse(actual.battle)).toEqual(snapshot.battle);
      expect(actual.readOnly).toBe(true);
    }
    await seek(page, r.flying, r.shot);
    await expect
      .poll(async () => (await particles(page, r.shotId)).some((p) => p.visible.length > 0), {
        timeout: 30000,
      })
      .toBe(true);
    await seek(page, r.tail, r.shot);
    const warm = await particles(page, r.shotId);
    expect(warm.some((p) => p.visible.length > 0)).toBe(true);
    // A cold tail must rebuild from the recording, without an already seen flight in the view.
    await page.evaluate(() => window.__game.scene.nativeProjectiles.clear());
    const cold = await seek(page, r.tail, r.shot),
      snapshot = r.snapshots.find((s) => s.at === r.tail)!;
    expect(JSON.parse(cold.battle)).toEqual(snapshot.battle);
    if (c.version === 167) {
      await expect
        .poll(async () => (await particles(page, r.shotId)).some((p) => p.visible.length > 0), {
          timeout: 30000,
        })
        .toBe(true);
      expect(await particles(page, r.shotId)).toEqual(warm);
    } else expect(await particles(page, r.shotId)).toEqual([]);
    await page.screenshot({
      path: `output/playtest/witch-flight-tail-${c.superTroop ? 'super' : 'regular'}-${c.level}-${c.version}-${c.width}.png`,
    });
    await seek(page, r.expired, r.shot);
    expect(await particles(page, r.shotId)).toEqual([]);
    await page.evaluate(() => window.__game.scene.nativeProjectiles.clear());
    await seek(page, r.tail, r.shot);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    const before = await page.evaluate(() => JSON.stringify(window.__game.model.battle));
    expect(await particles(page, r.shotId)).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('cold Witch tail recovers from an emitter graph 503 while replay stays paused', async ({
  page,
}) => {
  test.setTimeout(120000);
  let blocked = true,
    attempts = 0;
  await page.route(
    '**/assets/effects-native/emitter-witch-trail-emitter/graph.json',
    async (route) => {
      attempts++;
      if (blocked) await route.fulfill({ status: 503, body: 'temporary Witch emitter failure' });
      else await route.continue();
    },
  );
  const r = witchFlightRecording(),
    failure = page.waitForResponse(
      (r) => r.url().includes('/emitter-witch-trail-emitter/graph.json') && r.status() === 503,
    );
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene } = window.__game,
      { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Witch tail replay rejected');
    model.replay.paused = true;
    scene.sync();
  }, r.data);
  await seek(page, r.flying, r.shot);
  await failure;
  await page.evaluate(() => window.__game.scene.nativeProjectiles.clear());
  const before = await seek(page, r.tail, r.shot);
  expect(await particles(page, r.shotId)).toEqual([]);
  blocked = false;
  await page.evaluate(() => {
    window.__game.scene.paused = false;
    dispatchEvent(new Event('online'));
  });
  await expect
    .poll(async () => (await particles(page, r.shotId)).some((p) => p.visible.length > 0), {
      timeout: 15000,
    })
    .toBe(true);
  expect(attempts).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before.battle);
  expect(await page.evaluate(() => window.__game.model.replay.paused)).toBe(true);
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
});
