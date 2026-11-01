import { expect, test } from '@playwright/test';
import { GameModel } from '../../src/game/model';
import { makeReplayFile, parseReplayFile } from '../../src/game/replay-file';
import { siegeReleaseBattle, type ReleaseSiegeKind } from '../fixtures/siege-release';

const profiles: [ReleaseSiegeKind, number, string, number, number][] = [
  ['wallwrecker', 1, 'Wall Wrecker', 390, 844],
  ['battleblimp', 1, 'Battle Blimp', 390, 844],
  ['stoneslammer', 6, 'Stone Slammer', 1440, 960],
  ['siegebarracks', 6, 'Siege Barracks', 390, 844],
  ['loglauncher', 6, 'Log Launcher', 1440, 960],
  ['flameflinger', 1, 'Flame Flinger', 844, 390],
  ['battledrill', 6, 'Battle Drill', 1440, 960],
  ['trooplauncher', 4, 'Troop Launcher', 390, 844],
];

for (const [kind, level, name, width, height] of profiles) {
  test(`${name} exposes End siege and records the actual button input at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const initial = siegeReleaseBattle(kind, level, 232).data.initial,
      errors: string[] = [];
    const reserve = kind === 'wallwrecker' ? 'battleblimp' : 'wallwrecker';
    initial.army[reserve] = 1;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (initial) => {
      const { model, scene } = window.__game,
        { replayBattle } = await import('/src/game/replay.ts');
      scene.paused = true;
      model.returnHome();
      model.state.king = undefined;
      model.state.obstacles = [];
      model.state.nextId = initial.nextId;
      model.state.buildings = structuredClone(initial.buildings);
      model.state.army = { ...initial.army };
      model.state.spells = { ...initial.spells };
      model.state.troopLevels = { ...initial.troopLevels };
      model.startBattle(0, true);
      model.recording.initial = structuredClone(initial);
      model.battle = replayBattle(initial, 232);
      model.activeHero = false;
      model.activeHeroKind = null;
      model.activeSpell = null;
      model.changed();
      scene.sync();
    }, initial);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await expect(page.locator('[data-action="siege-end"]')).toHaveCount(0);
    await page.locator('[data-action="troop:archer"]').click();
    await page.evaluate(() => {
      const m = window.__game.model;
      if (!m.deploy(5, 12) || !m.deploy(5.2, 12)) throw Error('Friendly deployments failed');
    });
    await page.locator(`[data-action="troop:${kind}"]`).click();
    await page.evaluate(() => {
      if (!window.__game.model.deploy(11.4, 11.5)) throw Error('Siege deployment failed');
    });
    const end = page.getByRole('button', { name: `End ${name}`, exact: true });
    await expect(end).toBeVisible();
    expect((await end.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator(`[data-action="troop:${reserve}"]`)).toBeDisabled();
    const before = await page.evaluate(() => {
      const { model, scene } = window.__game;
      while (model.battle.elapsed < 4.95 - 1e-9) model.step(0.05);
      model.changed(true);
      scene.sync();
      scene.drawOverlay(0);
      return { at: model.battle.elapsed, battle: JSON.parse(JSON.stringify(model.battle)) };
    });
    await page.screenshot({
      path: `output/playtest/siege-end-${kind}-${width}-live.png`,
      animations: 'disabled',
    });
    await page.evaluate(() => window.__game.model.step(0.05));
    await end.click();
    await expect(page.locator('[data-action="siege-end"]')).toHaveCount(0);
    await expect(page.locator(`[data-action="troop:${reserve}"]`)).toBeDisabled();
    const record = await page.evaluate(() => {
      const { model, scene } = window.__game,
        snapshots = [
          { at: model.battle.elapsed, battle: JSON.parse(JSON.stringify(model.battle)) },
        ],
        endedAt = model.battle.elapsed;
      for (const delta of [0.05, 0.65, 0.75, 1.5]) {
        while (model.battle.elapsed < endedAt + delta - 1e-9) model.step(0.05);
        snapshots.push({
          at: model.battle.elapsed,
          battle: JSON.parse(JSON.stringify(model.battle)),
        });
      }
      scene.sync();
      scene.drawOverlay(0);
      model.step(0.05);
      model.finishBattle();
      return { snapshots, data: JSON.parse(JSON.stringify(model.state.raidLog[0].replay)) };
    });
    expect(record.data.actions.filter((action) => action.type === 'siege-end')).toHaveLength(1);
    const snapshots = [before, ...record.snapshots],
      viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(record.data))))).toBe(
      true,
    );
    for (const snapshot of [...snapshots, ...snapshots.slice().reverse()]) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Ended siege replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, record.data);
    await expect(page.locator('[data-action="siege-end"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__game.model.endSiege())).toBe(false);
    for (const snapshot of [...snapshots, ...snapshots.slice().reverse()]) {
      const actual = await page.evaluate(({ at }) => {
        const { model, scene } = window.__game;
        model.seekReplay(at);
        while (model.replay.seeking) model.step(0.05);
        scene.sync();
        scene.drawOverlay(0);
        return JSON.parse(JSON.stringify(model.battle));
      }, snapshot);
      expect(actual).toEqual(snapshot.battle);
    }
    expect(errors).toEqual([]);
  });
}
