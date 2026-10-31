import { expect, test, type Page } from '@playwright/test';
import { maxTroopLevel } from '../../src/game/data';
import { attackContactRecording } from '../fixtures/attack-contact-pose';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game,
        { iso } = await import('/src/game/scene.ts');
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const unit = model.battle.units.find((u) => u.id === id),
        point = iso(unit.x, unit.y),
        before = JSON.stringify(model.battle);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.7 : 2).centerOn(point.x, point.y - 45);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

for (const c of [
  { kind: 'archer', level: 1, version: 216, width: 390 },
  { kind: 'minion', level: maxTroopLevel('minion'), version: 216, width: 1440 },
  { kind: 'wizard', level: maxTroopLevel('wizard'), version: 216, width: 390 },
  { kind: 'dragon', level: 1, version: 216, width: 1440 },
  { kind: 'archer', level: maxTroopLevel('archer'), version: 215, width: 1440 },
  { kind: 'minion', level: 1, version: 215, width: 390 },
  { kind: 'wizard', level: 1, version: 215, width: 1440 },
  { kind: 'dragon', level: maxTroopLevel('dragon'), version: 215, width: 390 },
] as const)
  test(`${c.kind} ${c.level} contact pose ${c.version} at ${c.width}px`, async ({ page }) => {
    test.setTimeout(120000);
    const r = attackContactRecording(c.kind, c.version, c.level),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Contact replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.readOnly).toBe(true);
    }
    for (const at of [r.first, r.second, r.first]) {
      await seek(page, at, r.id);
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
      const frame = await page.evaluate(
        ({ id, kind, level }) => {
          const { scene, model } = window.__game;
          scene.drawOverlay(0);
          const view = scene.troopNativePresentation.views.get(id),
            pack = scene.troopNativePresentation.packs.get(kind),
            source = pack.levels.find((l) => l.level === level).states.attack,
            unit = model.battle.units.find((u) => u.id === id);
          return {
            drawn: view.sample.frame,
            contact: source.actionFrame - 1,
            offset: unit.native.attackWindup.animationOffset,
          };
        },
        { id: r.id, kind: c.kind, level: c.level },
      );
      expect(frame.offset).toBeLessThan(0);
      expect(frame.drawn).toBe(c.version >= 216 ? frame.contact : 0);
    }
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/contact-${c.kind}-${c.level}-${c.version}-${c.width}.png`,
    });
    const last = await seek(page, r.second, r.id);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
