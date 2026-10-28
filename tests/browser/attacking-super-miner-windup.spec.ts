import { expect, test, type Page } from '@playwright/test';
import { superMinerRecording } from '../fixtures/attacking-super-miner';
import { nativeTargetingSpellRecording } from '../fixtures/native-targeting-spells';

async function open(page: Page, data: unknown) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene } = window.__game,
      { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Super Miner replay rejected');
    model.replay.paused = true;
    scene.sync();
  }, data);
}
async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game,
        { iso } = await import('/src/game/scene.ts');
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const u = model.battle.units.find((u) => u.id === id),
        p = iso(u.x, u.y),
        before = JSON.stringify(model.battle);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.35 : 1.7).centerOn(p.x, p.y - 40);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}
for (const c of [
  { version: 208, level: 1, target: 'storage', width: 390 },
  { version: 208, level: 12, target: 'cannon', width: 1440 },
  { version: 208, level: 1, target: 'golem', width: 390 },
  { version: 208, level: 12, target: 'golem', width: 1440 },
  { version: 207, level: 12, target: 'storage', width: 1440 },
  { version: 207, level: 1, target: 'golem', width: 390 },
] as const)
  test(`Super Miner ${c.level} ${c.target} ramp and charge v${c.version} at${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = superMinerRecording(c.version, c.level, c.target, 18.6),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await open(page, r.data);
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, s.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(s.battle);
      expect(state.readOnly).toBe(true);
    }
    await seek(page, r.charged ?? r.first, r.id);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const { scene } = window.__game;
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
    if (c.version === 208) {
      const phase = await page.evaluate((id) => {
        const { model, scene } = window.__game,
          u = model.battle.units.find((u) => u.id === id);
        return {
          offset: u.native.attackWindup.animationOffset,
          burrowed: u.native.burrowed,
          state: scene.troopNativePresentation.views.get(id)?.state,
        };
      }, r.id);
      expect(phase.offset).toBeLessThan(0);
      expect(phase.burrowed).toBe(false);
      expect(phase.state).toBe('attack');
    }
    await page.screenshot({
      path: `output/playtest/super-miner-${c.version}-${c.level}-${c.target}-${c.width}-charge.png`,
    });
    const last = await seek(page, r.maximum, r.id);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

for (const level of [1, 4])
  test(`Super Miner pending repeat cancels on actual Angry Spell ${level}`, async ({ page }) => {
    test.setTimeout(120000);
    const r = nativeTargetingSpellRecording('AngrySpell', level, 208, 'superminer', 2.5, 0.1),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.setViewportSize({
      width: level === 1 ? 390 : 1440,
      height: level === 1 ? 844 : 960,
    });
    await open(page, r.data);
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, s.at, r.unitId);
      expect(JSON.parse(state.battle)).toEqual(s.battle);
      expect(state.readOnly).toBe(true);
    }
    const pending = JSON.parse((await seek(page, r.pending, r.unitId)).battle).units.find(
      (u) => u.id === r.unitId,
    );
    expect(pending.native.attackWindup.engaged).toBe(true);
    const after = await seek(page, r.impact, r.unitId),
      u = JSON.parse(after.battle).units.find((u) => u.id === r.unitId);
    expect(u.native.attackWindup.engaged).toBeUndefined();
    expect(u.native.attacks).toBe(pending.native.attacks);
    expect(u.target).toBe(3);
    expect(u.native.burrowed).toBe(true);
    expect(u.native.damageRamp).toBeUndefined();
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
      after.battle,
    );
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
