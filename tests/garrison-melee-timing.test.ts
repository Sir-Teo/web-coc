import { expect, it } from 'vitest';
import { GameModel, type Unit } from '../src/game/model';
import { stepDefenders } from '../src/game/defenders';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonStats } from '../src/game/garrison-kinds';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import {
  garrisonMeleeTimingRecording,
  type MeleeGarrisonKind,
} from './fixtures/garrison-melee-timing';

function arena(kind: MeleeGarrisonKind, modern = true, distance = 0.4) {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  if (modern) battle.nativeGarrisonMeleeTiming = true;
  battle.buildings = [];
  const target: Unit = {
    id: 1,
    kind: 'giant',
    x: 10 + distance,
    y: 10,
    hp: 9000,
    maxHp: 9000,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  battle.units = [target];
  const defender = spawnGarrisonDefender(battle, kind, kind === 'pekka' ? 8 : 7, 1, 10, 10, 0);
  const step = () => {
    battle.elapsed = Math.round((battle.elapsed + 0.05) * 1e9) / 1e9;
    stepDefenders(battle, 0.05, () => {});
  };
  const untilAttacks = (n: number) => {
    for (let i = 0; (defender.attackCount ?? 0) < n && i < 400; i++) step();
  };
  return { battle, target, defender, step, untilAttacks };
}
for (const [kind, level, first, oldFirst, damage, freshAfterHit] of [
  ['pekka', 8, 1.5, 1.8, 1098, 1.8],
  ['valkyrie', 7, 0.3, 1.2, 333, 0.6],
] as const) {
  it(`${kind} uses the source split timer while the unversioned reference remains frozen`, () => {
    expect(garrisonStats(kind, level)).toMatchObject({
      split: false,
      firstAttackDelay: oldFirst,
      recovery: 0,
      rate: 1.8,
      damage,
    });
    expect(garrisonStats(kind, level, true)).toMatchObject({
      split: true,
      firstAttackDelay: first,
      recovery: 0.3,
      rate: 1.8,
      damage,
    });
  });
  it(`${kind} strikes at ${first}s, retains its 1.8s period and exact source damage`, () => {
    const r = arena(kind);
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(first, 8);
    expect(r.target.hp).toBe(9000 - damage);
    r.untilAttacks(2);
    expect(r.battle.elapsed).toBeCloseTo(first + 1.8, 8);
    expect(r.target.hp).toBe(9000 - 2 * damage);
  });
  it(`${kind} retains the old ${oldFirst}s first hit without the capability`, () => {
    const r = arena(kind, false);
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(oldFirst, 8);
    expect(r.defender.recovery).toBeUndefined();
  });
  it(`${kind} spends recovery exactly once when switching to a fresh target`, () => {
    const r = arena(kind);
    r.untilAttacks(1);
    const hit = r.battle.elapsed;
    r.target.hp = 0;
    r.battle.units.push({ ...r.target, id: 2, hp: 9000, path: [] });
    r.untilAttacks(2);
    expect(r.defender.attacks[1].targetId).toBe(2);
    expect(r.battle.elapsed - hit).toBeCloseTo(freshAfterHit, 8);
  });
  it(`${kind} completes committed windup while chasing a moving target`, () => {
    const r = arena(kind);
    r.step();
    r.target.x = 20;
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(first, 8);
    expect(r.target.hp).toBe(kind === 'valkyrie' ? 9000 : 9000 - damage);
    expect(r.defender.x).toBeGreaterThan(10);
  });
  it(`${kind} accepts the source half-tile character range tolerance`, () => {
    const range = kind === 'pekka' ? 0.8 : 0.5,
      r = arena(kind, true, range + 0.4);
    r.step();
    expect(r.defender.engaged).toBe(true);
    expect(r.defender.x).toBe(10);
  });
  it(`${kind} pauses its split clock through two seconds of Freeze`, () => {
    const r = arena(kind);
    r.defender.frozenUntil = r.defender.stunnedUntil = 2;
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(first + 2, 8);
  });
  for (const version of [151, 152])
    it(`${kind} preserves complete version-${version} portable forward/reverse inputs`, () => {
      const r = garrisonMeleeTimingRecording(kind, version),
        model = new GameModel();
      if (version === 152) expect(r.first - r.engaged + 0.05).toBeCloseTo(first, 8);
      // The historical path can abandon and restart its windup as the Giants move.
      else expect(r.first - r.engaged + 0.05).toBeGreaterThanOrEqual(oldFirst - 1e-8);
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
}
it('only carried PEKKA/Valkyrie garrisons allocate the split-melee adapter', () => {
  const s = structuredClone(garrisonMeleeTimingRecording('pekka').data.initial);
  expect(replayBattle(s).nativeGarrisonMeleeTiming).toBe(true);
  expect(replayBattle(s, 151).nativeGarrisonMeleeTiming).toBeUndefined();
  s.garrisons![0].troops = [{ kind: 'archer', level: 9, count: 1 }];
  expect(replayBattle(s).nativeGarrisonMeleeTiming).toBeUndefined();
  expect(garrisonStats('archer', 9, true)).toBe(garrisonStats('archer', 9));
});

for (const kind of ['pekka', 'valkyrie'] as const)
  it(`${kind} reconstructs actual Freeze and thaw through portable reverse seeks`, () => {
    const r = garrisonMeleeTimingRecording(kind, undefined, true),
      model = new GameModel();
    expect(r.frozen).toBeDefined();
    expect(r.thawed).toBeDefined();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
  });
