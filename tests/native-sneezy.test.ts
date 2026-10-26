import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { emptyArmy, emptySpells, defaultSpellLevels } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { nativeUnitStats } from '../src/game/native-units';
import {
  statsFor,
  stepNativeUnit,
  stepNativeBattle,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { sneezySpawner, sneezySummon } from '../src/game/native-sneezy';
import { activeBoost, mergeBoost } from '../src/game/native-boost';
import {
  unitDamageScale,
  unitSpeedBonus,
  unitAttackIntervalScale,
  unitEffects,
} from '../src/game/native-status';
import { revealTeslas } from '../src/game/hidden-tesla';
import { unitTriggersTraps } from '../src/game/native-status';
import { initializeGarrison, stepGarrisonReleases } from '../src/game/garrison-release';
import type { HeroKind } from '../src/game/native-hero-data';

function arena(level = 1, version = REPLAY_VERSION, kind: HeroKind = 'king', other = false) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.spells = { ...emptySpells(), revive: 2, recall: 2 };
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.heroes = [{ kind, level: 1, items: [], pet: { kind: 'sneezy', level } }];
  if (other) recording.initial.heroes.push({ kind: 'queen', level: 1, items: [] });
  const battle = (model.battle = replayBattle(recording.initial, version));
  expect(model.deployNativeHero(kind, 5, 6.5)).toBe(true);
  const owner = battle.nativeHeroes![0],
    hero = battle.units.find((u) => u.id === owner.unitId)!,
    pet = battle.units.find((u) => u.id === owner.petId)!;
  const fall = () => {
    owner.abilityUsed = true;
    hero.hp = 0;
    model.step(0.05);
  };
  const until = (at: number) => {
    for (let i = 0; battle.elapsed < at - 1e-9; i++) {
      if (i > 1000 || battle.finished) throw Error('Sneezy checkpoint not reached');
      model.step(0.05);
    }
  };
  const events: FX[] = [],
    damage: number[] = [];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => model.state.nextId++,
    troopLevel: () => 1,
    damageBuilding: (_b, n) => damage.push(n),
    effect: (fx) => events.push(fx),
  };
  const stepPet = (at: number) => {
    const dt = at - battle.elapsed;
    battle.elapsed = at;
    pet.cooldown -= dt;
    stepNativeBattle(ctx);
    const base = nativeUnitStats('sneezy', level);
    stepNativeUnit(ctx, pet, { ...base, damage: base.damage * unitDamageScale(pet, at) }, dt);
  };
  return { model, battle, owner, hero, pet, fall, until, ctx, events, damage, stepPet };
}

it.each([1, 5, 10])(
  'level %s keeps its source zero-DPS five-tile spawner override until the master falls',
  (level) => {
    const a = arena(level),
      s = statsFor(a.battle, a.pet);
    expect(s).toMatchObject({ dps: 0, damage: 0, range: 5, projectile: 'pet_sneezy_void_attack' });
    a.pet.x = 35;
    a.pet.y = 37;
    a.stepPet(0.05);
    expect(a.events.filter((fx) => fx.type === 'hit' || fx.type === 'projectile')).toEqual([]);
    expect(a.damage).toEqual([]);
    expect(a.battle.projectiles?.some((p) => p.sourceId === a.pet.id) ?? false).toBe(false);
    a.fall();
    expect(sneezySpawner(a.battle, a.pet)).toBe(false);
    expect(statsFor(a.battle, a.pet)).toMatchObject({
      dps: 270 + (level - 1) * 20,
      range: 2.5,
      projectile: 'pet_sneezy_projectile_ShockWave',
      preferredClass: 'Defense',
    });
  },
);

it('holds at five tiles without launching fake void bolts, even under Rage', () => {
  const a = arena();
  a.pet.x = 30;
  a.pet.y = 37;
  unitEffects(a.pet).boost = mergeBoost(undefined, 'test-rage', { until: 20, damage: 1.9 }, 0);
  for (let i = 1; i <= 80; i++) a.stepPet(i * 0.05);
  expect(a.pet.x).toBeCloseTo(31, 8);
  expect(a.pet.y).toBe(37);
  expect(a.pet.attacking).toBe(false);
  expect(a.events.some((fx) => fx.type === 'projectile' || fx.type === 'hit')).toBe(false);
  expect(a.damage).toEqual([]);
});

it.each(['king', 'queen', 'warden', 'champion', 'prince', 'duke'] as const)(
  'transforms and self-boosts once after its own %s falls',
  (kind) => {
    const a = arena(1, undefined, kind);
    a.fall();
    expect(a.owner.sneezyTransformed).toBe(true);
    expect(a.owner.petHeroDeathUsed).toBe(true);
    expect(unitDamageScale(a.pet, a.battle.elapsed)).toBe(1.01);
    expect(unitSpeedBonus(a.pet, a.battle.elapsed)).toBe(0);
    expect(unitAttackIntervalScale(a.pet, a.battle.elapsed)).toBe(1);
    const boost = activeBoost(a.pet.native!.effects!.boost, a.battle.elapsed)!;
    expect(boost.until).toBeCloseTo(a.battle.elapsed + 300, 8);
    expect(unitDamageScale(a.pet, boost.until - 0.05)).toBe(1.01);
    expect(unitDamageScale(a.pet, boost.until)).toBe(1);
  },
);

it('lets the automatic Hero ability rescue its master before retiring the transform', () => {
  const a = arena();
  a.hero.hp = 0;
  a.model.step(0.05);
  expect(a.hero.hp).toBeGreaterThan(0);
  expect(a.owner.sneezyTransformed).toBeUndefined();
  expect(a.owner.petHeroDeathUsed).toBeUndefined();
  expect(sneezySpawner(a.battle, a.pet)).toBe(true);
});

it('does not retire its transform or boost when another Hero falls', () => {
  const a = arena(1, undefined, 'king', true);
  expect(a.model.deployNativeHero('queen', 5, 10)).toBe(true);
  const other = a.battle.nativeHeroes![1];
  other.abilityUsed = true;
  a.battle.units.find((u) => u.id === other.unitId)!.hp = 0;
  a.model.step(0.05);
  expect(a.owner.sneezyTransformed).toBeUndefined();
  expect(sneezySpawner(a.battle, a.pet)).toBe(true);
  expect(unitDamageScale(a.pet, a.battle.elapsed)).toBe(1);
});

it.each(['dead', 'ejected', 'recalled'] as const)(
  'does not self-boost an absent %s pet',
  (state) => {
    const a = arena();
    if (state === 'dead') a.pet.hp = 0;
    if (state === 'ejected') a.pet.ejected = true;
    if (state === 'recalled') a.pet.native!.recalled = true;
    a.fall();
    expect(a.pet.native!.effects?.boost).toBeUndefined();
    expect(a.owner.sneezyTransformed).toBe(true);
  },
);

it('retains the weaker one-percent source boost after a stronger Rage expires', () => {
  const a = arena();
  a.fall();
  const selfUntil = a.pet.native!.effects!.boost!.until;
  a.pet.native!.effects!.boost = mergeBoost(
    a.pet.native!.effects!.boost,
    'rage',
    { until: 1, damage: 1.9, speed: 2 },
    a.battle.elapsed,
  );
  expect(unitDamageScale(a.pet, 0.5)).toBe(2.9);
  expect(unitDamageScale(a.pet, 1)).toBe(1.01);
  expect(unitSpeedBonus(a.pet, 1)).toBe(0);
  expect(a.pet.native!.effects!.boost!.sources!['master-death:king'].until).toBe(selfUntil);
});

it('uses its base source projectile, range and boosted damage after transformation', () => {
  const a = arena();
  a.fall();
  a.pet.x = 35;
  a.pet.y = 37;
  a.stepPet(0.1);
  const p = a.battle.projectiles!.find((p) => p.sourceId === a.pet.id)!;
  expect(p.native!.name).toBe('pet_sneezy_projectile_ShockWave');
  expect(p.damage).toBeCloseTo(nativeUnitStats('sneezy', 1).damage * 1.01, 8);
});

it.each([false, true])(
  'pauses movement and attacks during its original 1.5-second summon, transformed=%s',
  (transformed) => {
    const a = arena();
    if (transformed) a.fall();
    a.stepPet(1);
    const p = { x: a.pet.x, y: a.pet.y };
    expect(sneezySummon(a.battle, a.pet)).toEqual({ at: 1, until: 2.5 });
    expect(a.battle.units.some((u) => u.kind === 'booger')).toBe(false);
    expect(a.battle.nativePendingSpawns).toContainEqual(
      expect.objectContaining({ kind: 'booger', at: 2.5, level: 1, owner: a.pet.id }),
    );
    a.stepPet(2.45);
    expect({ x: a.pet.x, y: a.pet.y }).toEqual(p);
    expect(a.events.some((fx) => fx.type === 'projectile' || fx.type === 'hit')).toBe(false);
    a.stepPet(2.5);
    expect(sneezySummon(a.battle, a.pet)).toBeUndefined();
    expect(a.pet.x).toBeGreaterThan(p.x);
  },
);

it('keeps the source two-living-Booger limit and avoids empty summon wind-ups', () => {
  const a = arena(10);
  a.stepPet(1);
  a.stepPet(12.5);
  a.stepPet(14);
  const children = a.battle.units.filter((u) => u.native?.owner === a.pet.id);
  expect(children).toHaveLength(2);
  expect(children.map((u) => u.level)).toEqual([10, 10]);
  expect(children.map((u) => u.spawnedAt)).toEqual([2.5, 14]);
  const old = a.pet.native!.sneezySummon;
  a.stepPet(24);
  expect(a.battle.units.filter((u) => u.native?.owner === a.pet.id)).toHaveLength(2);
  expect(a.pet.native!.sneezySummon).toBe(old);
  expect(sneezySummon(a.battle, a.pet)).toBeUndefined();
});

it('keeps spawner mode through Recall before its Hero falls', () => {
  const a = arena();
  a.model.activeSpell = 'recall';
  expect(a.model.castSpell(5, 6.5)).toBe(true);
  a.until(2);
  expect(a.owner.unitId).toBeNull();
  expect(a.owner.sneezyTransformed).toBeUndefined();
  expect(a.model.deployNativeHero('king', 5, 6.5)).toBe(true);
  expect(
    sneezySpawner(
      a.battle,
      a.battle.units.find((u) => u.id === a.owner.petId)!,
    ),
  ).toBe(true);
});

it('never reactivates its spent transform or refreshes rage after Revive and Recall', () => {
  const a = arena();
  a.fall();
  const deadline = a.pet.native!.effects!.boost!.until;
  a.model.activeSpell = 'revive';
  expect(a.model.castSpell(a.hero.x, a.hero.y)).toBe(true);
  a.until(1.7);
  expect(a.hero.hp).toBeGreaterThan(0);
  expect(sneezySpawner(a.battle, a.pet)).toBe(false);
  a.hero.hp = 0;
  a.model.step(0.05);
  expect(a.pet.native!.effects!.boost!.until).toBe(deadline);
  a.model.activeSpell = 'revive';
  expect(a.model.castSpell(a.hero.x, a.hero.y)).toBe(true);
  a.until(3.4);
  a.model.activeSpell = 'recall';
  expect(a.model.castSpell(a.hero.x, a.hero.y)).toBe(true);
  a.until(5.4);
  expect(a.owner.unitId).toBeNull();
  expect(a.model.deployNativeHero('king', 5, 6.5)).toBe(true);
  const pet = a.battle.units.find((u) => u.id === a.owner.petId)!;
  expect(sneezySpawner(a.battle, pet)).toBe(false);
  expect(a.owner.petHeroDeathUsed).toBe(true);
});

it('version 101 retains immediate attacks, unpaused summons and no Sneezy self-rage', () => {
  const a = arena(1, 101);
  a.pet.x = 35;
  a.pet.y = 37;
  expect(statsFor(a.battle, a.pet).range).toBe(2.5);
  a.stepPet(0.05);
  expect(a.battle.projectiles!.some((p) => p.sourceId === a.pet.id)).toBe(true);
  a.stepPet(1);
  expect(a.pet.native!.sneezySummon).toBeUndefined();
  a.fall();
  expect(a.owner.sneezyTransformed).toBeUndefined();
  expect(unitDamageScale(a.pet, a.battle.elapsed)).toBe(1);
});

it('Boogers cannot pull a Clan Castle reserve, but an ordinary ally can', () => {
  const a = arena();
  a.stepPet(1);
  a.stepPet(2.5);
  const child = a.battle.units.find((u) => u.kind === 'booger')!;
  child.x = 11.5;
  child.y = 11.5;
  a.battle.units = [child];
  a.battle.buildings.push(makeBuilding(2, 'clancastle', 10, 10, 10));
  a.battle.garrisons = [
    initializeGarrison({
      castleId: 2,
      mode: 'guard',
      troops: [{ kind: 'archer', level: 9, count: 1 }],
    }),
  ];
  a.battle.elapsed = 3;
  stepGarrisonReleases(a.battle);
  expect(a.battle.garrisons[0].released).toBe(0);
  a.battle.units.push({ ...child, id: 99999, kind: 'giant', spawnedAt: 3, native: {} });
  a.battle.elapsed = 3.5;
  stepGarrisonReleases(a.battle);
  expect(a.battle.garrisons[0].released).toBe(1);
});

it('Boogers enter battle and reveal Hidden Teslas only after arrival, without triggering traps', () => {
  const a = arena();
  a.stepPet(1);
  const pending = a.battle.nativePendingSpawns![0];
  pending.x = 11.5;
  pending.y = 6.5;
  a.battle.units = [];
  a.battle.buildings.push(makeBuilding(2, 'tesla', 10, 5, 1));
  a.battle.elapsed = 2.45;
  stepNativeBattle(a.ctx);
  revealTeslas(a.battle, () => {});
  expect(a.battle.units).toEqual([]);
  expect(a.battle.revealedTeslas?.[2]).toBeUndefined();
  a.battle.elapsed = 2.5;
  stepNativeBattle(a.ctx);
  const child = a.battle.units[0];
  expect(child).toMatchObject({ kind: 'booger', spawnedAt: 2.5 });
  expect(unitTriggersTraps(child)).toBe(false);
  revealTeslas(a.battle, () => {});
  expect(a.battle.revealedTeslas?.[2]).toBe(2.5);
});

it('holds a full Booger roster ready, then starts a fresh wind-up when a child falls', () => {
  const a = arena();
  a.stepPet(1);
  a.stepPet(12.5);
  a.stepPet(14);
  a.stepPet(24);
  expect(a.pet.native!.summonAt).toBe(24);
  const child = a.battle.units.find((u) => u.kind === 'booger')!;
  child.hp = 0;
  a.stepPet(24.5);
  expect(sneezySummon(a.battle, a.pet)).toEqual({ at: 24.5, until: 26 });
  expect(a.battle.units.filter((u) => u.kind === 'booger' && u.hp > 0)).toHaveLength(1);
  expect(a.battle.nativePendingSpawns).toContainEqual(
    expect.objectContaining({ kind: 'booger', at: 26 }),
  );
  a.stepPet(26);
  expect(a.battle.units.filter((u) => u.kind === 'booger' && u.hp > 0)).toHaveLength(2);
});

it('a committed Booger arrives after its summoner falls without exposing an unborn target', () => {
  const a = arena();
  a.stepPet(1);
  a.pet.hp = 0;
  a.battle.elapsed = 2.45;
  stepNativeBattle(a.ctx);
  expect(a.battle.units.some((u) => u.kind === 'booger')).toBe(false);
  a.battle.elapsed = 2.5;
  stepNativeBattle(a.ctx);
  expect(a.battle.units.find((u) => u.kind === 'booger')).toMatchObject({
    hp: 1100,
    spawnedAt: 2.5,
  });
});

it.each([false, true])(
  'keeps logical Booger ownership after Recall, historical=%s',
  (historical) => {
    const a = arena(1, historical ? 102 : undefined);
    a.battle.buildings = [makeBuilding(1, 'townhall', 36, 36, 1)];
    a.until(14.1);
    expect(a.battle.units.filter((u) => u.kind === 'booger' && u.hp > 0)).toHaveLength(2);
    a.model.activeSpell = 'recall';
    expect(a.model.castSpell(a.hero.x, a.hero.y)).toBe(true);
    a.until(16.1);
    expect(a.owner.unitId).toBeNull();
    expect(a.model.deployNativeHero('king', 5, 6.5)).toBe(true);
    expect(a.owner.petId).not.toBe(a.pet.id);
    expect(a.battle.units.find((u) => u.id === a.owner.petId)!.hp).toBeGreaterThan(0);
    a.until(17.2);
    const children = a.battle.units.filter((u) => u.kind === 'booger' && u.hp > 0).length;
    const pending =
      a.battle.nativePendingSpawns?.filter((spawn) => spawn.kind === 'booger').length ?? 0;
    expect(children + pending).toBe(historical ? 3 : 2);
    expect(a.owner.petSummonerId).toBe(historical ? undefined : a.pet.id);
  },
);

it('can replace a fallen pre-Recall Booger without creating a new summon family', () => {
  const a = arena();
  a.battle.buildings = [makeBuilding(1, 'townhall', 36, 36, 1)];
  a.until(14.1);
  a.model.activeSpell = 'recall';
  expect(a.model.castSpell(a.hero.x, a.hero.y)).toBe(true);
  a.until(16.1);
  expect(a.model.deployNativeHero('king', 5, 6.5)).toBe(true);
  a.until(17.2);
  const child = a.battle.units.find((u) => u.kind === 'booger' && u.hp > 0)!;
  child.hp = 0;
  a.model.step(0.05);
  expect(a.battle.nativePendingSpawns).toContainEqual(
    expect.objectContaining({ kind: 'booger', owner: a.pet.id }),
  );
  a.until(18.8);
  const living = a.battle.units.filter((u) => u.kind === 'booger' && u.hp > 0);
  expect(living).toHaveLength(2);
  expect(living.every((u) => u.native?.owner === a.pet.id)).toBe(true);
});
