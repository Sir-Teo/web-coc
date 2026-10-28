import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import {
  heroAuraRevivalRecording,
  type AuraEquipment,
  type AuraRevival,
} from './fixtures/hero-aura-revival';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { reviveHeroAuras } from '../src/game/native-hero-aura-revival';
import { seekingShieldBattle } from './fixtures/native-seeking-shield';
import { fireballBattle } from './fixtures/native-fireball';
import { replayBattle } from '../src/game/replay';

for (const equipment of ['electro-boots', 'rage-gem', 'life-gem'] as AuraEquipment[])
  for (const revival of ['revive', 'phoenix'] as AuraRevival[])
    it(`${equipment} resumes exactly one aura after real ${revival} resurrection on the same unit`, () => {
      const r = heroAuraRevivalRecording(equipment, revival, 138);
      const at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle as Battle;
      const name = {
        'electro-boots': 'Electro Boots Aura',
        'rage-gem': 'Rage Gem Aura',
        'life-gem': 'Life Gem Aura',
      }[equipment];
      const owned = (battle: Battle) =>
        battle.nativeSpells?.filter((c) => c.follow === r.unitId && c.name === name && !c.ended) ??
        [];
      expect(owned(at(r.deployed))).toHaveLength(1);
      expect(owned(at(r.dead))).toHaveLength(0);
      const restored = at(r.restored),
        later = at(r.later);
      expect(restored.units.find((u) => u.id === r.unitId)!.hp).toBeGreaterThan(0);
      expect(restored.nativeHeroes![0].unitId).toBe(r.unitId);
      expect(restored.nativeHeroes![0].abilityUsed).toBe(true);
      expect(owned(restored)).toHaveLength(1);
      expect(owned(later)).toHaveLength(1);
      expect(owned(later)[0].id).toBe(owned(restored)[0].id);
      expect(owned(later)[0].hits).toBeGreaterThan(owned(restored)[0].hits);
      expect(owned(restored)[0].castAt).toBe(r.resurrectAt);
      expect(restored.nativeHeroes![0].auraResume).toBeUndefined();
      const ally = later.units.find((u) => u.id === r.allyId)!;
      expect(ally.hp).toBeGreaterThan(0);
      if (equipment === 'rage-gem') expect(ally.native!.effects!.boost!.damage).toBe(0.15);
      if (equipment === 'life-gem')
        expect(ally.native!.effects!.extraHp!.amount).toBeGreaterThan(0);
      const old = heroAuraRevivalRecording(equipment, revival, 137);
      const oldRestored = old.snapshots.find((s) => s.at === old.restored)!.battle as Battle;
      expect(oldRestored.nativeHeroAuraRevival).toBeUndefined();
      expect(owned(oldRestored)).toHaveLength(0);
      for (const time of [r.deployed, r.dead]) {
        const before = JSON.parse(JSON.stringify(at(time)));
        delete before.nativeHeroAuraRevival;
        delete before.nativeHeroRegeneration;
        delete before.nativeElectroBootsPresentation;
        delete before.nativeElectroBootsActivations;
        expect(before).toEqual(old.snapshots.find((s) => s.at === time)!.battle);
      }
      const model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(s.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
      }
    });

it('retires overdue fields before they can catch up across the knockout, preserving spent spear charges', () => {
  const r = seekingShieldBattle(1, undefined, [
    { slug: 'electro-boots', level: 1 },
    { slug: 'rocket-spear', level: 27 },
  ]);
  r.model.activateNativeHeroAbility('champion');
  const unit = r.battle.units.find((u) => u.id === r.championId)!,
    hero = r.battle.nativeHeroes![0];
  const initialCharges = unit.native!.effects!.extraDamage!.hits!;
  for (
    let steps = 0;
    unit.native!.effects!.extraDamage!.hits === initialCharges && steps < 40;
    steps++
  )
    r.model.step(0.05);
  expect(unit.native!.effects!.extraDamage!.hits).toBeLessThan(initialCharges);
  unit.native!.effects!.frozenUntil = 100;
  const old = r.battle.nativeSpells!.find((c) => c.name === 'Electro Boots Aura')!;
  const hits = old.hits,
    charges = unit.native!.effects!.extraDamage!.hits!;
  expect(charges).toBeGreaterThan(0);
  const resumedAt = r.battle.elapsed;
  const before = JSON.stringify(unit),
    abilityAt = hero.abilityAt;
  reviveHeroAuras(r.battle, unit, r.battle.elapsed);
  expect(JSON.stringify(unit)).toBe(before);
  expect(hero.abilityUsed).toBe(true);
  expect(hero.abilityAt).toBe(abilityAt);
  r.model.step(0.55);
  expect(old.hits).toBe(hits);
  const current = r.battle.nativeSpells!.filter((c) => c.name === old.name && !c.ended);
  expect(current).toHaveLength(1);
  expect(current[0].id).not.toBe(old.id);
  expect(current[0].castAt).toBe(resumedAt);
  expect(unit.native!.effects!.extraDamage!.hits).toBe(charges);
});

it('does not restart a naturally exhausted field while its owner remains alive', () => {
  const r = seekingShieldBattle(1, undefined, [{ slug: 'electro-boots', level: 1 }]);
  const aura = r.battle.nativeSpells!.find((c) => c.name === 'Electro Boots Aura')!;
  aura.hits = aura.total;
  r.model.step(0.05);
  r.model.step(0.05);
  expect(r.battle.units.find((u) => u.id === r.championId)!.hp).toBeGreaterThan(0);
  expect(r.battle.nativeSpells!.some((c) => c.name === aura.name)).toBe(false);
});

it('keeps unrelated heroes and pre-138 activation guards unchanged', () => {
  const r = fireballBattle();
  r.battle.nativeHeroAuraRevival = true;
  r.model.activateNativeHeroAbility('warden');
  const before = JSON.stringify(r.battle);
  reviveHeroAuras(
    r.battle,
    r.battle.units.find((u) => u.id === r.wardenId)!,
    1,
  );
  expect(JSON.stringify(r.battle)).toBe(before);
  const eligible = seekingShieldBattle(1, undefined, [{ slug: 'electro-boots', level: 1 }]);
  expect(replayBattle(eligible.data.initial).nativeHeroAuraRevival).toBe(true);
  expect(replayBattle(eligible.data.initial, 137).nativeHeroAuraRevival).toBeUndefined();
  expect(replayBattle(r.data.initial).nativeHeroAuraRevival).toBeUndefined();
});

it('does not carry an unconsumed resurrection clock into a different recalled body', () => {
  const r = seekingShieldBattle(1, undefined, [{ slug: 'electro-boots', level: 1 }]);
  const hero = r.battle.nativeHeroes![0],
    old = r.battle.units.find((u) => u.id === r.championId)!;
  reviveHeroAuras(r.battle, old, 0);
  // Recall can resolve later in the same spell sample, before the revived body's upkeep.
  old.native!.recalled = true;
  hero.unitId = null;
  hero.recalledHp = old.hp;
  r.battle.elapsed = 2;
  expect(r.model.deployNativeHero('champion', 6.9, 18.5)).toBe(true);
  const current = r.battle.nativeSpells!.filter((c) => c.name === 'Electro Boots Aura' && !c.ended);
  expect(current).toHaveLength(1);
  expect(current[0].follow).not.toBe(old.id);
  expect(current[0].castAt).toBe(2);
});

it('preserves same-sample Revive and Recall ordering through portable redeployment and backward seeking', () => {
  const r = heroAuraRevivalRecording('electro-boots', 'revive');
  const data = structuredClone(r.data);
  data.initial.spells.recall = 1;
  const revive = data.actions.find(
    (action) => action.type === 'spell' && action.kind === 'revive',
  )!;
  const dead = r.snapshots.find((s) => s.at === r.dead)!.battle as Battle;
  const body = dead.units.find((u) => u.id === r.unitId)!;
  data.actions.push(
    // Revive takes 1.5 s; Recall takes 0.8 s deployment + 0.1 s hit delay.
    { type: 'spell', kind: 'recall', x: body.x, y: body.y, step: revive.step + 12 },
    { type: 'hero', hero: 'champion', x: 6.9, y: 18.5, step: revive.step + 34 },
  );
  data.actions.sort((a, b) => a.step - b.step);
  const atStep = (step: number) => data.steps.slice(0, step).reduce((sum, dt) => sum + dt, 0);
  const heldAt = atStep(revive.step + 31),
    deployedAt = atStep(revive.step + 34),
    later = deployedAt + 0.1;
  const model = new GameModel();
  expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  const seek = (at: number) => {
    model.seekReplay(at);
    while (model.replay!.seeking) model.step(0.05);
    return model.battle!;
  };
  const held = seek(heldAt);
  expect(held.nativeHeroes![0].unitId).toBeNull();
  expect(held.nativeSpells!.some((c) => c.name === 'Electro Boots Aura' && !c.ended)).toBe(false);
  const after = seek(later),
    hero = after.nativeHeroes![0];
  expect(hero.unitId).not.toBe(r.unitId);
  const aura = after.nativeSpells!.find((c) => c.name === 'Electro Boots Aura' && !c.ended)!;
  expect(aura.follow).toBe(hero.unitId);
  expect(aura.castAt).toBeCloseTo(deployedAt, 10);
  const snapshot = JSON.stringify(after);
  seek(heldAt);
  expect(JSON.stringify(seek(later))).toBe(snapshot);
});
