import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { hurtUnit } from '../src/game/native-status';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  REGENERATING_ITEMS,
  heroRegenerationBattle,
  heroRegenerationRecallRecording,
} from './fixtures/hero-regeneration';
import { heroAuraRevivalRecording } from './fixtures/hero-aura-revival';
import { resetHeroRegeneration } from '../src/game/native-hero-regeneration';
import { fireballBattle } from './fixtures/native-fireball';

for (const def of REGENERATING_ITEMS) {
  for (const [level, healing] of [
    [1, def.first],
    [def.max, def.last],
  ])
    it(`${def.slug} ${level} keeps its source ${healing} HP/s through dense and coarse active steps`, () => {
      const dense = heroRegenerationBattle(def.slug, level),
        coarse = heroRegenerationBattle(def.slug, level);
      for (const r of [dense, coarse])
        hurtUnit(r.battle, r.unit, Math.min(r.unit.maxHp / 2, healing * 4));
      const initial = dense.unit.hp;
      for (let step = 0; step < 48; step++) dense.model.step(0.05);
      coarse.model.step(2.4);
      expect(dense.unit.hp).toBeCloseTo(initial + healing * 2, 10);
      expect(coarse.unit.hp).toBe(dense.unit.hp);
      const old = heroRegenerationBattle(def.slug, level, 138);
      hurtUnit(old.battle, old.unit, Math.min(old.unit.maxHp / 2, healing * 4));
      for (let step = 0; step < 48; step++) old.model.step(0.05);
      const comparable = JSON.parse(JSON.stringify(dense.battle));
      delete comparable.nativeHeroRegeneration;
      expect(comparable).toEqual(old.battle);
    });
  it(`${def.slug} cannot bank regeneration while held in Recall`, () => {
    const r = heroRegenerationRecallRecording(def.slug);
    const at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle as Battle;
    const hp = (time: number) => at(time).units.find((u) => u.id === r.unitId)!.hp;
    expect(at(r.held).nativeHeroes![0].recalledHp).toBe(r.recalledHp);
    expect(hp(r.afterDeploy)).toBe(r.recalledHp);
    expect(hp(r.beforeTick)).toBe(r.recalledHp);
    expect(hp(r.firstTick)).toBe(r.recalledHp + def.first);
    expect(hp(r.later)).toBe(hp(r.firstTick));
    expect(r.unitId).not.toBe(r.oldId);
    const old = heroRegenerationRecallRecording(def.slug, 138);
    const oldHp = (
      old.snapshots.find((s) => s.at === old.afterDeploy)!.battle as Battle
    ).units.find((u) => u.id === old.unitId)!.hp;
    expect(oldHp).toBeGreaterThan(old.recalledHp);
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(s.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
    }
  });
}

it('Revive restores exactly its source HP before the first new self-regeneration tick', () => {
  const r = heroAuraRevivalRecording('electro-boots', 'revive');
  const restored = r.snapshots.find((s) => s.at === r.restored)!.battle as Battle;
  const unit = restored.units.find((u) => u.id === r.unitId)!;
  expect(unit.hp).toBeCloseTo(unit.maxHp * 0.6, 10);
  const later = (r.snapshots.find((s) => s.at === r.later)!.battle as Battle).units.find(
    (u) => u.id === r.unitId,
  )!;
  expect(later.hp).toBeCloseTo(unit.hp + 6, 10);
  expect(unit.native!.regenerationAt).toBe(r.resurrectAt);
  const old = heroAuraRevivalRecording('electro-boots', 'revive', 138);
  const previous = (old.snapshots.find((s) => s.at === old.restored)!.battle as Battle).units.find(
    (u) => u.id === old.unitId,
  )!;
  expect(previous.hp - previous.maxHp * 0.6).toBeCloseTo(12, 10);
  expect(previous.native!.regenerationAt).toBeUndefined();
});

it('does not heal the Phoenix temporary life or accumulate its suppressed ticks', () => {
  const r = heroAuraRevivalRecording('electro-boots', 'phoenix');
  for (const at of [r.restored, r.later]) {
    const battle = r.snapshots.find((s) => s.at === at)!.battle as Battle;
    const unit = battle.units.find((u) => u.id === r.unitId)!;
    expect(unit.hp).toBe(1);
    expect(unit.native!.regenerationAt).toBe(r.resurrectAt);
  }
  const later = r.snapshots.find((s) => s.at === r.later)!.battle as Battle;
  expect(later.nativeHeroes![0].charges!['regen:RCElectroRegeneration']).toBeGreaterThan(r.later);
});

it('consumes full-health ticks without banking them and never exceeds maximum health', () => {
  const r = heroRegenerationBattle('giant-gauntlet');
  hurtUnit(r.battle, r.unit, 20);
  r.model.step(10);
  expect(r.unit.hp).toBe(r.unit.maxHp);
  hurtUnit(r.battle, r.unit, 5);
  r.model.step(0.1);
  expect(r.unit.hp).toBe(r.unit.maxHp - 5);
});

it('does not add a regeneration lifecycle to an unrelated Hero in a mixed roster', () => {
  const r = fireballBattle();
  r.battle.nativeHeroRegeneration = true;
  const before = JSON.stringify(r.battle);
  resetHeroRegeneration(
    r.battle,
    r.battle.units.find((u) => u.id === r.wardenId)!,
    1,
  );
  expect(JSON.stringify(r.battle)).toBe(before);
});
