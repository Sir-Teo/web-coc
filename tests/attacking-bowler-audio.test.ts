import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { garrisonSoundEffects } from '../src/game/garrison-native-sounds';
import {
  BattleSoundLog,
  effectCue,
  troopSoundCues,
  troopSoundFiles,
} from '../src/game/troop-sounds';
import { attackingBowlerBattle } from './fixtures/attacking-bowler';
import { attackingBowlerAudioRecording } from './fixtures/attacking-bowler-audio';
import { bowlerBouldersRecording } from './fixtures/bowler-boulders';

const cues = (battle: ReturnType<typeof attackingBowlerBattle>['battle']) =>
  troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.includes(':preAttack:'));
const current = (r: ReturnType<typeof attackingBowlerBattle>) => {
  const key = r.unit.native?.bowler?.audio?.charge?.key;
  return cues(r.battle).find((c) => c.key === key);
};
for (let level = 1; level <= 10; level++)
  it(`attacking Bowler ${level} uses source initial charge and continuous released throw tails`, () => {
    const r = attackingBowlerBattle(level);
    r.step();
    const charge = r.unit.native!.bowler!.audio!.charge!;
    expect(charge.age).toBeCloseTo(1.15, 8);
    const fresh = current(r)!;
    expect(fresh).toEqual(effectCue('trollAttack', charge.key, r.battle.elapsed - charge.age));
    expect(fresh.volume).toBe(0.7);
    expect(fresh.pitch).toBeGreaterThanOrEqual(0.98);
    expect(fresh.pitch).toBeLessThanOrEqual(1.02);
    expect(['troop-rock_troll_throw_01.ogg', 'troop-rock_troll_throw_02.ogg']).toContain(
      fresh.sample,
    );
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(0.4, 8);
    expect(current(r)).toBeUndefined();
    expect(cues(r.battle).find((c) => c.key === fresh.key)!.at).toBeCloseTo(fresh.at, 8);
    r.until(1.15);
    const repeat = current(r)!;
    expect(repeat).toBeDefined();
    expect(repeat.key).not.toBe(fresh.key);
    expect(r.unit.native!.bowler!.audio!.charge!.age).toBeCloseTo(0.05, 8);
    r.untilAttacks(2);
    expect(r.unit.native!.bowler!.audio!.history).toHaveLength(2);
    expect(cues(r.battle).find((c) => c.key === repeat.key)!.at).toBeCloseTo(repeat.at, 8);
    const before = JSON.stringify(r.battle);
    expect(new Set(cues(r.battle).map((c) => c.key)).size).toBe(cues(r.battle).length);
    expect(JSON.stringify(r.battle)).toBe(before);
  });

it('Freeze holds active sample age, resumes it, and leaves released one-shot tails running', () => {
  const r = attackingBowlerBattle();
  r.until(0.15);
  const charge = structuredClone(r.unit.native!.bowler!.audio!.charge!);
  r.unit.native!.effects = { frozenUntil: 0.8 };
  r.until(0.6);
  expect(r.unit.native!.bowler!.audio!.charge).toEqual(charge);
  expect(current(r)).toBeUndefined();
  r.until(0.85);
  expect(r.unit.native!.bowler!.audio!.charge!.age).toBeCloseTo(charge.age + 0.05, 8);
  expect(current(r)!.key).toBe(charge.key);
  r.untilAttacks(1);
  const released = cues(r.battle).find((c) => c.key === charge.key)!;
  r.unit.native!.effects.frozenUntil = r.battle.elapsed + 0.5;
  r.step();
  expect(cues(r.battle).find((c) => c.key === charge.key)).toEqual(released);
});

it('a thaw inside a 50ms update spends only its active wall-time fraction', () => {
  const r = attackingBowlerBattle();
  r.step();
  r.unit.native!.effects = { frozenUntil: 0.225 };
  r.until(0.2);
  expect(current(r)).toBeUndefined();
  r.until(0.25);
  expect(r.unit.native!.bowler!.audio!.charge!.age).toBeCloseTo(1.175, 8);
  expect(current(r)).toBeDefined();
});

for (const slowed of [false, true])
  it(`source sound age follows active wall time independently of attack speed, slowed=${slowed}`, () => {
    const r = attackingBowlerBattle();
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.until(0.15);
    expect(r.unit.native!.bowler!.audio!.charge!.age).toBeCloseTo(1.25, 8);
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(slowed ? 0.8 : 0.2, 8);
  });

it('a new target during recovery waits before its precharged take can play', () => {
  const r = attackingBowlerBattle();
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 14, 18));
  r.untilAttacks(1);
  const target = r.battle.buildings.find((b) => b.id === 2)!;
  r.model.damage(target, target.hp);
  r.step();
  expect(r.unit.native!.bowler!.audio!.charge).toMatchObject({ age: 1.1, waiting: true });
  expect(current(r)).toBeUndefined();
  r.until(1.15);
  expect(r.unit.native!.bowler!.audio!.charge!.age).toBeCloseTo(1.15, 8);
  expect(current(r)).toBeDefined();
});

it('cancelling an unfinished windup never captures a released tail or reuses its key', () => {
  const r = attackingBowlerBattle();
  r.step();
  const key = current(r)!.key,
    target = r.battle.buildings.find((b) => b.id === 2)!,
    hp = target.hp;
  target.hp = 0;
  r.step();
  expect(current(r)).toBeUndefined();
  expect(r.unit.native!.bowler!.audio!.history).toBeUndefined();
  target.hp = hp;
  r.unit.target = target.id;
  r.step();
  expect(current(r)).toBeDefined();
  expect(current(r)!.key).not.toBe(key);
});

it('death cancels the active charge while already released takes retain their clocks', () => {
  const r = attackingBowlerBattle();
  r.untilAttacks(1);
  const tail = cues(r.battle)[0];
  r.unit.hp = 0;
  r.step();
  expect(cues(r.battle)).toContainEqual(tail);
  const active = attackingBowlerBattle();
  active.step();
  active.unit.hp = 0;
  active.step();
  expect(cues(active.battle)).toEqual([]);
});

it('completed throw history stays bounded even at a boosted attack rate', () => {
  const r = attackingBowlerBattle();
  r.unit.native!.effects = { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 2 } };
  r.untilAttacks(17);
  expect(r.unit.native!.bowler!.audio!.history).toHaveLength(16);
});

for (const x of [11.4, 6.9]) {
  it(`throw audio preserves exact version-158 physical snapshots from x=${x}`, () => {
    const old = attackingBowlerAudioRecording(158, x),
      r = attackingBowlerAudioRecording(159, x);
    expect(r.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
    for (const [i, snapshot] of r.snapshots.entries()) {
      const b = structuredClone(snapshot.battle);
      delete b.nativeBowlerPreAttack;
      for (const unit of b.units) if (unit.native?.bowler) delete unit.native.bowler.audio;
      expect(b).toEqual(old.snapshots[i].battle);
      expect(cues(old.snapshots[i].battle)).toEqual([]);
    }
  });
  for (const version of [158, 159])
    it(`full version-${version} throw audio portable snapshots reverse from x=${x}`, () => {
      const r = attackingBowlerAudioRecording(version, x),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
        expect(cues(model.battle!)).toEqual(cues(snapshot.battle));
      }
    });
}

it('defender-targeted native boulders share the same captured original throw takes', () => {
  const r = bowlerBouldersRecording(159);
  expect(r.snapshots.some((s) => cues(s.battle).length > 0)).toBe(true);
});

it('only current carried player Bowlers warm their own throw takes', () => {
  expect(troopSoundFiles('bowler', true, false)).not.toContain('sfx/rock_troll_throw_01.ogg');
  expect(troopSoundFiles('bowler')).toContain('sfx/rock_troll_throw_01.ogg');
  expect(troopSoundFiles('bowler')).toContain('sfx/rock_troll_throw_02.ogg');
  const s = structuredClone(attackingBowlerBattle().data.initial);
  expect(replayBattle(s).nativeBowlerPreAttack).toBe(true);
  expect(replayBattle(s, 158).nativeBowlerPreAttack).toBeUndefined();
  s.army.bowler = 0;
  expect(replayBattle(s).nativeBowlerPreAttack).toBeUndefined();
});

for (const status of ['freeze', 'poison'] as const)
  it(`audio clocks leave every version-158 combat field exact under ${status}`, () => {
    const r = attackingBowlerBattle(1, 159),
      old = attackingBowlerBattle(1, 158);
    for (let step = 0; step < 75; step++) {
      if (step === 3)
        for (const b of [r, old])
          b.unit.native!.effects =
            status === 'freeze'
              ? { frozenUntil: 0.725 }
              : { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } };
      r.step();
      old.step();
      const physical = structuredClone(r.battle);
      delete physical.nativeBowlerPreAttack;
      for (const u of physical.units) if (u.native?.bowler) delete u.native.bowler.audio;
      expect(physical).toEqual(old.battle);
    }
  });

it('historical player preloads do not suppress the independent defending Bowler binding', () => {
  const setup = structuredClone(bowlerBouldersRecording(158).data.initial);
  setup.garrisons![0].troops = [{ kind: 'bowler', level: 4, count: 1 }];
  const battle = replayBattle(setup, 158);
  expect(battle.nativeBowlerPreAttack).toBeUndefined();
  expect(troopSoundFiles('bowler', true, false)).not.toContain('sfx/rock_troll_throw_01.ogg');
  expect(garrisonSoundEffects(battle)).toContain('trollAttack');
});
