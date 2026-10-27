import { expect, test, type Page } from '@playwright/test';
import { bowlerBouldersRecording } from '../fixtures/bowler-boulders';
import { garrisonBowlerImpactRecording } from '../fixtures/garrison-bowler-impacts';

async function open(page: Page, data: unknown) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene } = window.__game,
      { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Boulder art replay rejected');
    model.replay.paused = true;
    scene.sync();
  }, data);
}
async function seek(page: Page, at: number, kind: string, id: number, shotId?: string) {
  return page.evaluate(
    async ({ at, kind, id, shotId }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const { iso } = await import('/src/game/scene.ts');
      let point;
      if (kind === 'attacker') {
        const shots = model.battle.nativeBowlerFlights ?? model.battle.projectiles ?? [],
          shot =
            shots.find((p) =>
              shotId ? p.id === shotId : p.sourceId === id && p.native?.bounce === 1,
            ) ?? shots.find((p) => p.sourceId === id);
        point = shot ? iso(shot.x, shot.y) : iso(17, 11.5);
      } else {
        const attack = model.battle.defenders.find((d) => d.id === id)?.attacks[0];
        point =
          attack?.bounceAt !== undefined
            ? iso(attack.bounceX, attack.bounceY)
            : attack?.hitAt !== undefined
              ? iso(attack.hitX, attack.hitY)
              : iso(10, 11.5);
      }
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.35 : 1.7).centerOn(point.x, point.y - 40);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle, readOnly: battle === JSON.stringify(model.battle) };
    },
    { at, kind, id, shotId },
  );
}
async function shatter(page: Page, key?: string) {
  return page.evaluate((key) => {
    const scene = window.__game.scene;
    scene.drawOverlay(0);
    return [...scene.nativeProjectiles.layer.views.entries()].some(
      ([id, view]) =>
        (!key || id.includes(key)) &&
        view.objects.some(
          (o) =>
            o.visible &&
            o.alpha > 0 &&
            String(o.getData('nativeEffect')).includes('trollBoulder_destroyed') &&
            o.texture?.key !== '__MISSING',
        ),
    );
  }, key);
}
async function fallback(page: Page, kind: string, id: number, leg: number, shotId?: string) {
  return page.evaluate(
    ({ kind, id, leg, shotId }) => {
      const { model, scene } = window.__game,
        b = model.battle;
      let fx;
      if (kind === 'attacker') {
        const shot = [...(b.nativeBowlerFlights ?? []), ...(b.projectiles ?? [])].find((p) =>
          shotId ? p.id === shotId : p.sourceId === id && (p.native?.bounce ?? 0) === leg,
        );
        const record = b.nativeBowlerImpacts?.find((p) =>
          shotId ? p.id === shotId : p.sourceId === id && p.bounce === leg,
        );
        fx = {
          type: 'impact',
          weapon: 'native',
          projectileId: shot?.id ?? record?.id,
          sourceId: id,
          x: shot?.fromX ?? 11.4,
          y: shot?.fromY ?? 11.5,
          toX: shot?.x ?? 14,
          toY: shot?.y ?? 11.5,
        };
      } else {
        const a = b.defenders.find((d) => d.id === id).attacks[0];
        fx = {
          type: 'hit',
          sourceDefender: true,
          sourceId: id,
          projectileBounce: leg,
          x: a.x,
          y: a.y,
          toX: leg ? a.bounceX : a.hitX,
          toY: leg ? a.bounceY : a.hitY,
        };
      }
      const impact = scene.combatEffects.impact;
      let calls = 0;
      scene.combatEffects.impact = function (...args) {
        calls++;
        return impact.apply(this, args);
      };
      try {
        scene.effect(fx);
        scene.drawOverlay(0);
      } finally {
        scene.combatEffects.impact = impact;
      }
      return { calls, battle: JSON.stringify(model.battle) };
    },
    { kind, id, leg, shotId },
  );
}
for (const c of [
  { kind: 'attacker', version: 161, width: 390, level: 1 },
  { kind: 'attacker', version: 161, width: 1440, level: 10 },
  { kind: 'defender', version: 161, width: 390, mode: 'freeze' },
  { kind: 'defender', version: 161, width: 1440, mode: 'lightning' },
  { kind: 'attacker', version: 160, width: 1440, level: 10 },
  { kind: 'defender', version: 160, width: 390, mode: 'freeze' },
] as const)
  test(`${c.kind} original boulder phases at ${c.width}px, version=${c.version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    const r =
        c.kind === 'attacker'
          ? bowlerBouldersRecording(c.version, c.level)
          : garrisonBowlerImpactRecording(c.version, c.mode),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, r.data);
    for (const snapshot of r.snapshots) {
      const state = await seek(page, snapshot.at, c.kind, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.readOnly).toBe(true);
    }
    const firstKey = 'shotId' in r ? `${r.shotId}:hit` : `garrison:${r.id}:boulder-hit:0`,
      finalKey = 'bounceId' in r ? `${r.bounceId}:hit` : `garrison:${r.id}:boulder-hit:0`;
    const first = await seek(page, r.hit, c.kind, r.id, 'shotId' in r ? r.shotId : undefined);
    expect(await shatter(page, firstKey)).toBe(false);
    if (c.version === 161) {
      expect(
        (await fallback(page, c.kind, r.id, 0, 'shotId' in r ? r.shotId : undefined)).calls,
      ).toBe(0);
      expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
        first.battle,
      );
    }
    await page.evaluate(() => window.__game.scene.nativeProjectiles.clear());
    const finalAt = 'settled' in r ? r.settled : r.tail,
      final = await seek(page, finalAt, c.kind, r.id, 'bounceId' in r ? r.bounceId : undefined);
    if (c.version === 161) {
      await expect.poll(() => shatter(page, finalKey), { timeout: 30000 }).toBe(true);
      expect(
        (await fallback(page, c.kind, r.id, 1, 'bounceId' in r ? r.bounceId : undefined)).calls,
      ).toBe(0);
      await page.screenshot({ path: `output/playtest/bowler-impact-art-${c.kind}-${c.width}.png` });
    } else expect(await shatter(page, finalKey)).toBe(false);
    await seek(page, 'released' in r ? r.released : r.first, c.kind, r.id);
    expect(await seek(page, finalAt, c.kind, r.id)).toEqual(final);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      final.battle,
    );
    expect(await shatter(page)).toBe(false);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('cold boulder final art retains fallback through a paused graph 503 and recovers online', async ({
  page,
}) => {
  test.setTimeout(120000);
  let blocked = true,
    attempts = 0;
  await page.route(
    '**/assets/effects-native/trollboulder-destroyed-lvl8/graph.json',
    async (route) => {
      attempts++;
      if (blocked) await route.fulfill({ status: 503, body: 'temporary shatter graph failure' });
      else await route.continue();
    },
  );
  const r = bowlerBouldersRecording(),
    failure = page.waitForResponse(
      (r) => r.url().includes('/trollboulder-destroyed-lvl8/graph.json') && r.status() === 503,
    );
  await open(page, r.data);
  await failure;
  await seek(page, r.hit, 'attacker', r.id, r.shotId);
  expect((await fallback(page, 'attacker', r.id, 0, r.shotId)).calls).toBe(0);
  await page.evaluate(() => window.__game.scene.nativeProjectiles.clear());
  const final = await seek(page, r.settled, 'attacker', r.id, r.bounceId);
  expect(await shatter(page, `${r.bounceId}:hit`)).toBe(false);
  expect((await fallback(page, 'attacker', r.id, 1, r.bounceId)).calls).toBeGreaterThan(0);
  blocked = false;
  await page.evaluate(() => {
    window.__game.scene.paused = false;
    dispatchEvent(new Event('online'));
  });
  await expect.poll(() => shatter(page, `${r.bounceId}:hit`), { timeout: 10000 }).toBe(true);
  expect(attempts).toBeGreaterThanOrEqual(2);
  expect((await fallback(page, 'attacker', r.id, 1, r.bounceId)).calls).toBe(0);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(final.battle);
  expect(await page.evaluate(() => window.__game.model.replay.paused)).toBe(true);
});
