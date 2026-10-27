import { expect, it } from 'vitest';
import { GameModel, type Unit } from '../src/game/model';
import { stepDefenders } from '../src/game/defenders';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonStats, type GarrisonKind } from '../src/game/garrison-kinds';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { garrisonRecoveryRecording } from './fixtures/garrison-recovery';

const cases = [
  ['electrodragon', 3, 2.875, 0.625, 3.5],
  ['golem', 8, 1.5, 0.9, 2.4],
  ['golemite', 8, 1.5, 1.5, 3],
  ['bowler', 4, 0.4, 0.7, 1.1],
  ['lavahound', 6, 1.5, 0.5, 2],
  ['momma', 1, 1.5, 3.5, 5],
] as const;
function arena(kind: GarrisonKind, level: number, modern = true, slowed = false) {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  if (modern) battle.nativeGarrisonRecovery = true;
  battle.buildings = [];
  const target: Unit = {
    id: 1,
    kind: 'giant',
    x: 10.1,
    y: 10,
    hp: 90000,
    maxHp: 90000,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  battle.units = [target];
  const defender = spawnGarrisonDefender(battle, kind, level, 1, 10, 10, 0);
  if (slowed) defender.poison = { since: 0, until: 100, speed: 0, attack: -0.5 };
  const step = () => {
    battle.elapsed = Math.round((battle.elapsed + 0.05) * 1e9) / 1e9;
    stepDefenders(battle, 0.05, () => {});
  };
  const untilAttacks = (n: number) => {
    for (let i = 0; (defender.attackCount ?? 0) < n && i < 1200; i++) step();
  };
  const replace = () => {
    target.hp = 0;
    battle.units.push({ ...target, id: 2, hp: 90000, path: [] });
  };
  return { battle, target, defender, step, untilAttacks, replace };
}
for (const [kind, level, first, recovery, fresh] of cases) {
  it(`${kind} source recovery ${recovery}s is counted once on a fresh target`, () => {
    expect(garrisonStats(kind, level)).toMatchObject({
      split: true,
      firstAttackDelay: first,
      recovery,
    });
    const r = arena(kind, level);
    r.untilAttacks(1);
    const hit = r.battle.elapsed;
    r.replace();
    r.untilAttacks(2);
    expect(r.defender.attacks[1].targetId).toBe(2);
    expect(r.battle.elapsed - hit).toBeCloseTo(fresh, 8);
  });
  it(`${kind} preserves the historical early retarget release without the capability`, () => {
    const r = arena(kind, level, false);
    r.untilAttacks(1);
    const hit = r.battle.elapsed;
    r.replace();
    r.untilAttacks(2);
    expect(r.battle.elapsed - hit).toBeCloseTo(fresh - 0.05, 8);
  });
  it(`${kind} keeps its same-target release period unchanged`, () => {
    const r = arena(kind, level);
    r.untilAttacks(1);
    const hit = r.battle.elapsed;
    r.untilAttacks(2);
    expect(r.battle.elapsed - hit).toBeCloseTo(garrisonStats(kind, level).rate, 8);
  });
  it(`${kind} advances one shared recovery tick under a 50% poison attack slow`, () => {
    const r = arena(kind, level, true, true);
    r.untilAttacks(1);
    const hit = r.battle.elapsed;
    r.replace();
    r.untilAttacks(2);
    expect(r.battle.elapsed - hit).toBeCloseTo(fresh * 2, 8);
  });
}
for (const kind of ['electrodragon', 'golem', 'bowler', 'lavahound'] as const)
  for (const version of [152, 153])
    it(`${kind} real target loss retains full version-${version} portable snapshots`, () => {
      const r = garrisonRecoveryRecording(kind, version),
        model = new GameModel();
      expect(r.nextTarget).not.toBe(r.firstTarget);
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
it('only carried split families with positive recovery allocate the correction', () => {
  const s = structuredClone(garrisonRecoveryRecording('golem').data.initial);
  expect(replayBattle(s).nativeGarrisonRecovery).toBe(true);
  expect(replayBattle(s, 152).nativeGarrisonRecovery).toBeUndefined();
  for (const [kind, level] of [
    ['witch', 4],
    ['archer', 9],
    ['pekka', 8],
    ['valkyrie', 7],
  ] as const) {
    s.garrisons![0].troops = [{ kind, level, count: 1 }];
    expect(replayBattle(s).nativeGarrisonRecovery).toBeUndefined();
  }
});

for (const [kind, delay] of [
  ['electrodragon', 0.05],
  ['golem', 0.05],
  ['bowler', 0],
] as const)
  it(`${kind} real target loss changes the next release by ${delay}s`, () => {
    const r = garrisonRecoveryRecording(kind, 153),
      old = garrisonRecoveryRecording(kind, 152);
    expect(r.first).toBe(old.first);
    expect(r.fallen).toBe(old.fallen);
    expect(r.switched).toBe(old.switched);
    expect(r.returned - old.returned).toBeCloseTo(delay, 8);
    if (kind === 'bowler') {
      // Its tracking projectile kills the Archer after recovery has already completed.
      const switched = r.snapshots.find((s) => s.at === r.switched)!.battle;
      const defender = switched.defenders!.find((d) => d.id === r.id);
      if (!defender || defender.kind !== 'bowler') throw Error('Missing Bowler checkpoint');
      expect(defender.recovery).toBe(0);
    }
    const before = JSON.parse(JSON.stringify(r.snapshots.find((s) => s.at === r.first)!.battle));
    delete before.nativeGarrisonRecovery;
    expect(before).toEqual(old.snapshots.find((s) => s.at === old.first)!.battle);
  });
