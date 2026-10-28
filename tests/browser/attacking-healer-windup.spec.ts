import { expect, test, type Page } from '@playwright/test';
import { healerRecording, healerPuppetRecording } from '../fixtures/attacking-healer';

async function open(page: Page, data: unknown) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene } = window.__game,
      { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Healer replay rejected');
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
  { version: 210, level: 1, x: 8, width: 390 },
  { version: 210, level: 11, x: 8, width: 1440 },
  { version: 210, level: 1, x: 13, width: 1440 },
  { version: 210, level: 11, x: 13, width: 390 },
  { version: 209, level: 1, x: 8, width: 1440 },
  { version: 209, level: 11, x: 13, width: 390 },
] as const)
  test(`Healer${c.level} from${c.x} source cast v${c.version} at${c.width}px`, async ({ page }) => {
    test.setTimeout(120000);
    const r = healerRecording(c.level, c.version, c.x);
    await check(page, r, c.version, c.width, `trained-${c.level}-${c.x}`);
  });
for (const version of [209, 210])
  for (const item of [1, 18])
    test(`Healer Puppet${item} source cast v${version}`, async ({ page }) => {
      test.setTimeout(120000);
      const r = healerPuppetRecording(item, version);
      expect(r.data.initial.army.healer).toBe(0);
      await check(page, r, version, item === 1 ? 390 : 1440, `puppet-${item}`);
    });
async function check(
  page: Page,
  r: ReturnType<typeof healerRecording> | ReturnType<typeof healerPuppetRecording>,
  version: number,
  width: number,
  name: string,
) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/assets/'))
      errors.push(response.url());
  });
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  await open(page, r.data);
  for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
    const state = await seek(page, snapshot.at, r.id);
    expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
    expect(state.readOnly).toBe(true);
  }
  const pending = 'engaged' in r ? r.engaged : r.pending;
  await seek(page, version >= 210 ? pending : r.first, r.id);
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const { scene } = window.__game;
          scene.drawOverlay(0);
          return scene.troopNativePresentation.views
            .get(id)
            ?.view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING');
        }, r.id),
      { timeout: 30000 },
    )
    .toBe(true);
  if (version >= 210) {
    const phase = await page.evaluate((id) => {
      const { scene, model } = window.__game,
        u = model.battle.units.find((u) => u.id === id),
        st = u.native.healerWindup;
      return {
        engaged: st.engaged,
        offset: st.animationOffset,
        state: scene.troopNativePresentation.views.get(id)?.state,
        shots: (model.battle.projectiles ?? []).filter(
          (p) => p.sourceId === id && p.weapon === 'healing',
        ).length,
      };
    }, r.id);
    expect(phase.engaged).toBe(true);
    expect(phase.offset).toBeLessThan(0);
    expect(phase.state).toBe('attack');
    expect(phase.shots).toBe(0);
  }
  await page.screenshot({ path: `output/playtest/healer-cast-${version}-${name}-${width}.png` });
  const last = await seek(page, r.second, r.id);
  await page.evaluate(() => window.__game.model.toggleReducedMotion());
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
  expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
  expect(errors).toEqual([]);
}
