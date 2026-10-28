import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import { hurtUnit } from '../src/game/native-status';
import {
  BattleSoundLog,
  effectCue,
  troopSoundCues,
  troopSoundEffect,
  troopSoundFiles,
} from '../src/game/troop-sounds';
import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { superBowlerRecording } from './fixtures/attacking-super-bowler';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';

const cues = (battle: ReturnType<typeof nativeDirectBattle>['battle']) =>
  troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.includes(':preAttack:'));
const current = (r: ReturnType<typeof nativeDirectBattle>) =>
  cues(r.battle).find((c) => c.key === r.unit.native?.attackWindup?.audio?.charge?.key);

for (let level = 1; level <= 10; level++)
  it(`Super Bowler ${level} plays its source pre-attack sample for fresh and repeat charges`, () => {
    const r = nativeDirectBattle('superbowler', level, 202);
    r.until(0.15);
    const charge = r.unit.native!.attackWindup!.audio!.charge!,
      firstCue = current(r)!;
    expect(charge.age).toBeCloseTo(1.25, 8);
    expect(firstCue).toEqual(
      effectCue('SuptrollAttack', charge.key, r.battle.elapsed - charge.age),
    );
    expect(firstCue).toMatchObject({
      volume: 0.7,
    });
    expect(troopSoundEffect('superbowler', level, 'preAttack')).toBe('SuptrollAttack');
    expect(troopSoundFiles('superbowler')).toContain('sfx/sup_troll_atk_01.ogg');
    expect(troopSoundFiles('superbowler')).toContain('sfx/sup_troll_atk_02.ogg');
    expect(firstCue.pitch).toBeGreaterThanOrEqual(0.98);
    expect(firstCue.pitch).toBeLessThanOrEqual(1.02);
    expect(['troop-sup_troll_atk_01.ogg', 'troop-sup_troll_atk_02.ogg']).toContain(firstCue.sample);
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(0.4, 8);
    expect(current(r)).toBeUndefined();
    expect(cues(r.battle).find((c) => c.key === firstCue.key)!.at).toBeCloseTo(firstCue.at, 8);
    r.until(0.9);
    expect(r.unit.native!.attackWindup!.recovery).toBeGreaterThan(0);
    expect(current(r)).toBeUndefined();
    r.until(1.15);
    const repeat = current(r)!;
    expect(repeat).toBeDefined();
    expect(repeat.key).not.toBe(firstCue.key);
    expect(repeat.at).toBeCloseTo(1.1, 8);
    expect(r.unit.native!.attackWindup!.audio!.charge!.age).toBeCloseTo(0.05, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed).toBeCloseTo(2.6, 8);
    expect(r.unit.native!.attackWindup!.audio!.history).toHaveLength(2);
    expect(cues(r.battle).find((c) => c.key === repeat.key)!.at).toBeCloseTo(repeat.at, 8);
    const before = JSON.stringify(r.battle);
    expect(new Set(cues(r.battle).map((c) => c.key)).size).toBe(cues(r.battle).length);
    expect(JSON.stringify(r.battle)).toBe(before);
  });

it('Freeze holds active sound age and released samples retain their natural tails', () => {
  const r = nativeDirectBattle('superbowler', 1, 202);
  r.until(0.15);
  const charge = structuredClone(r.unit.native!.attackWindup!.audio!.charge!);
  r.unit.native!.effects = { frozenUntil: 0.8 };
  r.until(0.6);
  expect(r.unit.native!.attackWindup!.audio!.charge).toEqual(charge);
  expect(current(r)).toBeUndefined();
  r.until(0.85);
  expect(r.unit.native!.attackWindup!.audio!.charge!.age).toBeCloseTo(charge.age + 0.05, 8);
  expect(current(r)!.key).toBe(charge.key);
  r.untilAttacks(1);
  const tail = cues(r.battle).find((c) => c.key === charge.key)!;
  r.unit.native!.effects.frozenUntil = r.battle.elapsed + 0.5;
  r.step();
  expect(cues(r.battle).find((c) => c.key === charge.key)).toEqual(tail);
});
for (const slowed of [false, true])
  it(`sound age follows active wall time independently of attack rate, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('superbowler', 1, 202);
    (r.unit.native ??= {}).effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.until(0.15);
    expect(r.unit.native!.attackWindup!.audio!.charge!.age).toBeCloseTo(1.25, 8);
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(slowed ? 0.8 : 0.2, 8);
  });
it('a thaw within one update advances only the active fraction of source audio', () => {
  const r = nativeDirectBattle('superbowler', 1, 202);
  r.step();
  r.unit.native!.effects = { frozenUntil: 0.225 };
  r.until(0.2);
  expect(current(r)).toBeUndefined();
  r.until(0.25);
  expect(r.unit.native!.attackWindup!.audio!.charge!.age).toBeCloseTo(1.175, 8);
});
it('a replacement during recovery waits before starting a fresh source take', () => {
  const r = nativeDirectBattle('superbowler', 1, 202),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(1);
  r.model.damage(target, target.hp);
  r.step();
  expect(r.unit.native!.attackWindup!.audio!.charge).toMatchObject({ age: 1.1, waiting: true });
  expect(current(r)).toBeUndefined();
  r.until(1.15);
  expect(current(r)).toBeDefined();
  expect(r.unit.native!.attackWindup!.audio!.charge!.age).toBeCloseTo(1.15, 8);
});
it('a destroyed pending target discards the take without capturing a completed tail', () => {
  const r = nativeDirectBattle('superbowler', 1, 202),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.until(0.15);
  const key = current(r)!.key;
  r.model.damage(target, target.hp);
  r.step();
  expect(r.unit.native!.attackWindup!.audio!.history ?? []).toEqual([]);
  expect(cues(r.battle).some((c) => c.key === key)).toBe(false);
  expect(r.unit.native!.attackWindup!.audio!.charge!.key).not.toBe(key);
});
it('caster defeat suppresses its unfinished source take', () => {
  const r = nativeDirectBattle('superbowler', 1, 202);
  r.until(0.15);
  const key = current(r)!.key;
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.step();
  expect(cues(r.battle).some((c) => c.key === key)).toBe(false);
});
for (const version of [201, 202])
  for (const level of [1, 10])
    for (const target of (version === 201 ? ['storage'] : ['storage', 'cannon', 'golem']) as (
      'storage' | 'cannon' | 'golem'
    )[])
      it(`tier ${level} actual ${target} audio reconstructs portable version ${version}`, () => {
        const r = superBowlerRecording(version, level, target),
          viewer = new GameModel();
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(s.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
          expect(cues(viewer.battle!)).toEqual(cues(s.battle));
          const u = viewer.battle!.units.find((u) => u.id === r.id)!;
          if (version === 201) expect(u.native!.attackWindup?.audio).toBeUndefined();
          if (s.at === r.charged && version === 202)
            expect(cues(s.battle).some((c) => c.key.startsWith(`troop:${r.id}:preAttack:`))).toBe(
              true,
            );
        }
      });
for (const level of [1, 4]) {
  it(`actual Angry Spell ${level} discards its unfinished pre-attack take`, () => {
    const r = nativeTargetingSpellRecording('AngrySpell', level, 202, 'superbowler', 1, 0.1),
      before = r.snapshots.find((s) => s.at === r.pending)!.battle as ReturnType<
        typeof nativeDirectBattle
      >['battle'],
      after = r.snapshots.find((s) => s.at === r.impact)!.battle as ReturnType<
        typeof nativeDirectBattle
      >['battle'],
      key = before.units.find((u) => u.id === r.unitId)!.native!.attackWindup!.audio!.charge!.key;
    expect(cues(before).some((c) => c.key === key)).toBe(true);
    expect(cues(after).some((c) => c.key === key)).toBe(false);
    expect(
      after.units.find((u) => u.id === r.unitId)!.native!.attackWindup!.audio!.history ?? [],
    ).toEqual([]);
  });
  it(`actual Angry Spell ${level} preserves the released source tail and boulders`, () => {
    const r = nativeTargetingSpellRecording('AngrySpell', level, 202, 'superbowler', 2, 0.1),
      before = r.snapshots.find((s) => s.at === r.pending)!.battle as ReturnType<
        typeof nativeDirectBattle
      >['battle'],
      after = r.snapshots.find((s) => s.at === r.impact)!.battle as ReturnType<
        typeof nativeDirectBattle
      >['battle'],
      audio = before.units.find((u) => u.id === r.unitId)!.native!.attackWindup!.audio!,
      key = audio.history![0].key;
    expect(
      after.units.find((u) => u.id === r.unitId)!.native!.attackWindup!.audio!.history,
    ).toEqual(audio.history);
    expect(cues(after).find((c) => c.key === key)).toEqual(cues(before).find((c) => c.key === key));
    expect(after.projectiles!.some((p) => p.sourceId === r.unitId)).toBe(true);
  });
}
it('only carried Super Bowlers enable the source pre-attack journal', () => {
  const r = nativeDirectBattle('superbowler', 1, 202);
  expect(replayBattle(r.data.initial, 201).nativeSuperBowlerPreAttack).toBeUndefined();
  expect(replayBattle(r.data.initial, 202).nativeSuperBowlerPreAttack).toBe(true);
  r.data.initial.army.superbowler = 0;
  expect(replayBattle(r.data.initial, 202).nativeSuperBowlerPreAttack).toBeUndefined();
});

for (const level of [1, 10])
  for (const target of ['storage', 'cannon', 'golem'] as const)
    it(`source audio preserves every physical tier ${level} ${target} combat state`, () => {
      const old = superBowlerRecording(201, level, target),
        current = superBowlerRecording(202, level, target);
      expect(current.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
      const physical = (value: unknown) => {
        const battle = JSON.parse(JSON.stringify(value));
        delete battle.nativeSuperBowlerPreAttack;
        for (const u of battle.units)
          if (u.native?.attackWindup) delete u.native.attackWindup.audio;
        return battle;
      };
      for (let i = 0; i < current.snapshots.length; i++)
        expect(physical(current.snapshots[i].battle)).toEqual(physical(old.snapshots[i].battle));
    });
