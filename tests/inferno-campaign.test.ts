import { expect, it } from 'vitest';
import source from '../reference/inferno/native.json';
import {
  NATIVE_CAMPAIGN,
  nativeBuildings,
  nativeCampaignIssues,
  nativeDefenseModes,
  freshNativeCampaign,
} from '../src/game/native-campaign';
import { nativeInfernoStates } from '../src/game/inferno-campaign-state';
import { infernoStats } from '../src/game/inferno-weapon';
import { defenseDps } from '../src/game/data';
import { GameModel } from '../src/game/model';
import { validateSave } from '../src/game/save';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
it('maps every captured active Inferno mode and ammo using the original normal/alternate labels', () => {
  expect(source.rows[0].NormalModeTID).toBe('TID_BUILDING_DARK_TOWER_SINGLE_CONFIG');
  expect(source.rows[0].AlternateModeTID).toBe('TID_BUILDING_DARK_TOWER_MULTI_CONFIG');
  let count = 0;
  for (const stage of NATIVE_CAMPAIGN) {
    const { modes, issues } = nativeDefenseModes(stage);
    expect(issues.has('Invalid Inferno state')).toBe(false);
    for (const t of nativeInfernoStates(stage)) {
      expect(modes.get(`1000027:${t.x}:${t.y}:${t.level}`)).toEqual({
        infernoMode: t.attackMode ? 'multi' : 'single',
        infernoAmmo: t.ammunition,
      });
      count++;
    }
  }
  expect(count).toBe(182);
  for (let level = 1; level <= 12; level++)
    expect(defenseDps('inferno', level)).toBeCloseTo(infernoStats(level).weapon.dps[0], 10);
});
it('rejects conflicting truthy mode records instead of silently choosing one', () => {
  const stage = structuredClone(NATIVE_CAMPAIGN[58]);
  const t = stage.infernoStates![0] as Record<string, unknown>;
  stage.activeModes.push({ ...t, attack_mode: true });
  expect(nativeDefenseModes(stage).issues.has('Alternate defense modes')).toBe(true);
});
for (const index of [58, 59, 60, 62])
  it(`retains village ${index} Infernos in live setup and portable replay`, () => {
    expect(nativeCampaignIssues(index)).toEqual([]);
    const expected = nativeBuildings(index).filter((b) => b.kind === 'inferno');
    expect(expected.length).toBeGreaterThan(0);
    const m = new GameModel();
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.startCampaign(index);
    expect(m.battle!.buildings.filter((b) => b.kind === 'inferno')).toEqual(expected);
    expect(m.battle!.nativeInfernoAmmo).toBe(true);
    expect(m.deploy(1, 1)).toBe(true);
    for (let i = 0; i < 20; i++) m.step(0.05);
    m.finishBattle();
    const record = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay!)));
    expect(record.initial.buildings.filter((b) => b.kind === 'inferno')).toEqual(expected);
    m.returnHome();
    expect(validateSave(m.state)).toBe(true);
    const home = JSON.stringify(m.state);
    expect(m.openReplay(record)).toBe(true);
    for (const time of [1, 0, 0.5]) {
      m.seekReplay(time);
      while (m.replay!.seeking) m.step(0.05);
      expect(
        m
          .battle!.buildings.filter((b) => b.kind === 'inferno')
          .map((b) => [b.id, b.infernoMode, b.infernoAmmo]),
      ).toEqual(expected.map((b) => [b.id, b.infernoMode, b.infernoAmmo]));
    }
    m.returnHome();
    expect(JSON.stringify(m.state)).toBe(home);
  });
it('fires the captured single/multi weapons and consumes ammo on the newly admitted maps', async () => {
  const { stepInfernos } = await import('../src/game/inferno-battle');
  for (const index of [58, 59, 60, 62]) {
    const m = new GameModel();
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.startCampaign(index);
    expect(m.deploy(1, 1)).toBe(true);
    const b = m.battle!;
    const towers = b.buildings.filter((t) => t.kind === 'inferno');
    const unit = b.units[0];
    // Stationary targets isolate each imported weapon from pathfinding and other defenses.
    b.units = towers.flatMap((t, j) =>
      Array.from({ length: 6 }, (_, i) => ({
        ...unit,
        id: 100000 + j * 6 + i,
        x: t.x + 3 + i * 0.1,
        y: t.y + 1,
        hp: 1e9,
        maxHp: 1e9,
      })),
    );
    for (let i = 1; i <= 4; i++) {
      b.elapsed = i * 0.064;
      stepInfernos(b, 0.064);
    }
    for (const tower of towers) {
      const state = b.infernos![tower.id];
      expect(state.scheduler.mode).toBe(tower.infernoMode);
      expect(state.ammunition).toBe(998);
      expect(state.hits.length).toBeGreaterThan(0);
      expect(state.scheduler.slots.filter((s) => s.targetId !== null).length).toBe(
        tower.infernoMode === 'single' ? 1 : infernoStats(tower.level).weapon.alternateTargets,
      );
    }
  }
});
