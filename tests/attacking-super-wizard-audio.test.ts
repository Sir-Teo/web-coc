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
import {
  superWizardRecording,
  angrySuperWizardBranchesRecording,
} from './fixtures/attacking-super-wizard';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';

const cues = (battle: ReturnType<typeof nativeDirectBattle>['battle']) =>
  troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.includes(':preAttack:'));
const current = (r: ReturnType<typeof nativeDirectBattle>) =>
  cues(r.battle).find((c) => c.key === r.unit.native?.attackWindup?.audio?.charge?.key);

for (let level = 1; level <= 10; level++)
  it(`Super Wizard ${level} plays its source pre-attack sample for fresh and repeat charges`, () => {
    const r = nativeDirectBattle('superwizard', level, 200);
    r.until(0.15);
    const charge = r.unit.native!.attackWindup!.audio!.charge!,
      firstCue = current(r)!;
    expect(charge.age).toBeCloseTo(0.15, 8);
    expect(firstCue).toEqual(
      effectCue('Electro Dragon Pre Attack', charge.key, r.battle.elapsed - charge.age),
    );
    expect(firstCue).toMatchObject({
      sample: 'troop-electro_dragon_sfx_atk_01.ogg',
      volume: 0.5,
      pitch: 1,
    });
    expect(troopSoundEffect('superwizard', level, 'preAttack')).toBe('Electro Dragon Pre Attack');
    expect(troopSoundFiles('superwizard')).toContain('sfx/electro_dragon_sfx_atk_01.ogg');
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(1.5, 8);
    expect(current(r)).toBeUndefined();
    expect(cues(r.battle).find((c) => c.key === firstCue.key)).toEqual(firstCue);
    r.until(1.9);
    expect(r.unit.native!.attackWindup!.recovery).toBeGreaterThan(0);
    expect(current(r)).toBeUndefined();
    r.until(2.05);
    const repeat = current(r)!;
    expect(repeat).toBeDefined();
    expect(repeat.key).not.toBe(firstCue.key);
    expect(repeat.at).toBeCloseTo(2, 8);
    expect(r.unit.native!.attackWindup!.audio!.charge!.age).toBeCloseTo(0.05, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed).toBeCloseTo(3.5, 8);
    expect(r.unit.native!.attackWindup!.audio!.history).toHaveLength(2);
    expect(cues(r.battle).find((c) => c.key === repeat.key)!.at).toBeCloseTo(repeat.at, 8);
    const before = JSON.stringify(r.battle);
    expect(new Set(cues(r.battle).map((c) => c.key)).size).toBe(cues(r.battle).length);
    expect(JSON.stringify(r.battle)).toBe(before);
  });

it('Freeze holds active sound age and released samples retain their natural tails', () => {
  const r = nativeDirectBattle('superwizard', 1, 200);
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
    const r = nativeDirectBattle('superwizard', 1, 200);
    (r.unit.native ??= {}).effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.until(0.15);
    expect(r.unit.native!.attackWindup!.audio!.charge!.age).toBeCloseTo(0.15, 8);
    r.untilAttacks(1);
    expect(r.battle.elapsed).toBeCloseTo(slowed ? 3 : 0.75, 8);
  });
it('a thaw within one update advances only the active fraction of source audio', () => {
  const r = nativeDirectBattle('superwizard', 1, 200);
  r.step();
  r.unit.native!.effects = { frozenUntil: 0.225 };
  r.until(0.2);
  expect(current(r)).toBeUndefined();
  r.until(0.25);
  expect(r.unit.native!.attackWindup!.audio!.charge!.age).toBeCloseTo(0.075, 8);
});
it('a replacement during recovery waits before starting a fresh source take', () => {
  const r = nativeDirectBattle('superwizard', 1, 200),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  r.untilAttacks(1);
  r.model.damage(target, target.hp);
  r.step();
  expect(r.unit.native!.attackWindup!.audio!.charge).toMatchObject({ age: 0, waiting: true });
  expect(current(r)).toBeUndefined();
  r.until(2.05);
  expect(current(r)).toBeDefined();
  expect(r.unit.native!.attackWindup!.audio!.charge!.age).toBeCloseTo(0.05, 8);
});
it('a destroyed pending target discards the take without capturing a completed tail', () => {
  const r = nativeDirectBattle('superwizard', 1, 200),
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
  const r = nativeDirectBattle('superwizard', 1, 200);
  r.until(0.15);
  const key = current(r)!.key;
  hurtUnit(r.battle, r.unit, r.unit.hp);
  r.step();
  expect(cues(r.battle).some((c) => c.key === key)).toBe(false);
});
for (const version of [199, 200])
  for (const level of [1, 10])
    for (const target of (version === 199
      ? ['storage']
      : ['storage', 'cannon', 'golem', 'dragon']) as ('storage' | 'cannon' | 'golem' | 'dragon')[])
      it(`tier ${level} actual ${target} audio reconstructs portable version ${version}`, () => {
        const r = superWizardRecording(version, level, target),
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
          if (version === 199) expect(u.native!.attackWindup?.audio).toBeUndefined();
          if (s.at === r.charged && version === 200)
            expect(cues(s.battle).some((c) => c.key.startsWith(`troop:${r.id}:preAttack:`))).toBe(
              true,
            );
        }
      });
for (const level of [1, 4]) {
  it(`actual Angry Spell ${level} discards its unfinished pre-attack take`, () => {
    const r = nativeTargetingSpellRecording('AngrySpell', level, 200, 'superwizard', 2, 0.05),
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
  it(`actual Angry Spell ${level} preserves the released source tail and branches`, () => {
    const r = angrySuperWizardBranchesRecording(level, 200),
      before = r.snapshots.find((s) => s.at === r.first)!.battle,
      after = r.snapshots.find((s) => s.at === r.impact)!.battle,
      audio = before.units.find((u) => u.id === r.id)!.native!.attackWindup!.audio!,
      key = audio.history![0].key;
    expect(after.units.find((u) => u.id === r.id)!.native!.attackWindup!.audio!.history).toEqual(
      audio.history,
    );
    expect(cues(after).find((c) => c.key === key)).toEqual(cues(before).find((c) => c.key === key));
    expect(after.nativeSuperWizardBranches).toEqual(before.nativeSuperWizardBranches);
  });
}
it('only carried Super Wizards enable the source pre-attack journal', () => {
  const r = nativeDirectBattle('superwizard', 1, 200);
  expect(replayBattle(r.data.initial, 199).nativeSuperWizardPreAttack).toBeUndefined();
  expect(replayBattle(r.data.initial, 200).nativeSuperWizardPreAttack).toBe(true);
  r.data.initial.army.superwizard = 0;
  expect(replayBattle(r.data.initial, 200).nativeSuperWizardPreAttack).toBeUndefined();
});

for (const level of [1, 10])
  for (const target of ['storage', 'cannon', 'golem', 'dragon'] as const)
    it(`source audio preserves every physical tier ${level} ${target} combat state`, () => {
      const old = superWizardRecording(199, level, target),
        current = superWizardRecording(200, level, target);
      expect(current.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
      const physical = (value: unknown) => {
        const battle = JSON.parse(JSON.stringify(value));
        delete battle.nativeSuperWizardPreAttack;
        for (const u of battle.units)
          if (u.native?.attackWindup) delete u.native.attackWindup.audio;
        return battle;
      };
      for (let i = 0; i < current.snapshots.length; i++)
        expect(physical(current.snapshots[i].battle)).toEqual(physical(old.snapshots[i].battle));
    });
