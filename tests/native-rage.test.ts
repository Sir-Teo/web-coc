import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import {
  unitDamageScale,
  unitSpeedBonus,
  unitAttackIntervalScale,
} from '../src/game/native-status';
import { nativeUnitStats } from '../src/game/native-units';
import { defendingHero, stepDefendingHeroes } from '../src/game/defending-heroes';
import { spawnGarrisonDefender, stepGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonStats } from '../src/game/garrison-kinds';
import { spawnSkeleton, stepDefenders, type Defender } from '../src/game/defenders';
import { createGuardian, guardianStats, stepGuardian } from '../src/game/native-guardians';
import { skeletonStats } from '../src/game/skeleton-stats';
import { defenderRageStats } from '../src/game/native-rage';
import { activeBoost } from '../src/game/native-boost';
import type { NativeTroopContext } from '../src/game/native-troops';
import { nativeRageRecording } from './fixtures/native-rage';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import type { Battle } from '../src/game/model';
import { activateHero } from '../src/game/native-hero-abilities';
import { heroAbilities } from '../src/game/native-heroes';
import { seconds, num } from '../src/game/native-data';
import { stepEquipmentEffects } from '../src/game/native-equipment-effects';

function unit(kind: Unit['kind'], id = 1000, x = 10): Unit {
  const s = nativeUnitStats(kind, 1);
  return {
    id,
    kind,
    level: 1,
    x,
    y: 10,
    hp: s.hp,
    maxHp: s.hp,
    target: null,
    path: [],
    pathAt: 0,
    cooldown: 0,
    attacking: false,
    spawnedAt: 0,
    native: {},
  };
}
function arena(version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  const battle = replayBattle(data.initial, version);
  battle.started = true;
  model.battle = battle;
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 3000,
    troopLevel: () => 1,
    damageBuilding: () => {},
    effect: () => {},
  };
  const step = (at: number) => {
    battle.elapsed = at;
    stepNativeSpells(ctx);
  };
  return { model, battle, ctx, step };
}

for (const [level, normalSpeed, preferredSpeed, damage] of [
  [1, 2.5, 1.25, 1.3],
  [7, 4, 2, 1.9],
]) {
  it.each([
    ['swordsman', false],
    ['giant', true],
    ['goblin', true],
    ['wallbreaker', true],
    ['balloon', true],
    ['lavahound', true],
  ] as const)(`uses level ${level} source Rage movement for %s`, (kind, preferred) => {
    const { battle, step } = arena();
    const u = unit(kind);
    battle.units = [u];
    const cast = castNativeSpell(battle, 'Rage', level, 'attack', 10, 10);
    step(cast.firstHit);
    expect(unitSpeedBonus(u, battle.elapsed)).toBe(preferred ? preferredSpeed : normalSpeed);
    expect(unitDamageScale(u, battle.elapsed)).toBeCloseTo(1 + damage, 12);
    expect(unitAttackIntervalScale(u, battle.elapsed)).toBe(1);
  });
}

it.each([
  'barbarianking',
  'archerqueen',
  'grandwarden',
  'royalchampion',
  'minionprince',
  'dragonduke',
] as const)(
  'gives the physical %s Hero half Rage without a second preferred-target reduction',
  (kind) => {
    const { battle, step } = arena();
    const u = unit(kind);
    battle.units = [u];
    const cast = castNativeSpell(battle, 'Rage', 1, 'attack', 10, 10);
    step(cast.firstHit);
    expect(unitSpeedBonus(u, battle.elapsed)).toBe(1.25);
    expect(unitDamageScale(u, battle.elapsed)).toBe(1.65);
  },
);

it('does not prolong a departed Rage Spell while a weaker Rage Gem keeps pulsing', () => {
  const { battle, step } = arena();
  const u = unit('swordsman');
  battle.units = [u];
  const rage = castNativeSpell(battle, 'Rage', 1, 'attack', 10, 10);
  castNativeSpell(battle, 'Rage Gem Aura', 1, 'attack', 10, 10);
  step(rage.firstHit + 0.1);
  expect(unitDamageScale(u, battle.elapsed)).toBe(2.3);
  u.x = 17;
  step(rage.firstHit + 1.05);
  expect(unitDamageScale(u, battle.elapsed)).toBe(1.15);
  expect(unitSpeedBonus(u, battle.elapsed)).toBe(0);
  const before = JSON.stringify(battle);
  activeBoost(u.native!.effects!.boost, battle.elapsed);
  expect(JSON.stringify(battle)).toBe(before);
});

it('preserves the version 92 retained maximum while a weaker aura continues', () => {
  const { battle, step } = arena(92);
  const u = unit('swordsman');
  battle.units = [u];
  const rage = castNativeSpell(battle, 'Rage', 1, 'attack', 10, 10);
  castNativeSpell(battle, 'Rage Gem Aura', 1, 'attack', 10, 10);
  step(rage.firstHit + 0.1);
  u.x = 17;
  step(rage.firstHit + 1.05);
  expect(unitDamageScale(u, battle.elapsed)).toBe(2.3);
});

function defenderArena(
  kind: 'hero' | 'archer' | 'balloon' | 'golem' | 'skeleton' | 'guardian',
  version = REPLAY_VERSION,
) {
  const setup = arena(version);
  const { battle } = setup;
  let d: Defender;
  if (kind === 'hero') d = defendingHero({ kind: 'king', level: 1, x: 10, y: 10 }, 0);
  else if (kind === 'guardian') {
    d = createGuardian(battle, battle.buildings[0], -20000)!;
    d.phase = 'fighting';
    d.home = { x: 10, y: 10 };
    d.spawnedAt = 0;
  } else if (kind === 'skeleton')
    d = spawnSkeleton(battle, makeBuilding(2, 'skeletontrap', 10, 10, 1), 0, 0);
  else d = spawnGarrisonDefender(battle, kind, kind === 'archer' ? 9 : 8, 2, 10, 10, 0);
  d.x = d.y = 10;
  battle.defenders = [d];
  const target = unit('giant', 2000, 10.2);
  target.hp = target.maxHp = 100000;
  battle.units = [target];
  return { ...setup, d, target };
}

it.each([
  ['hero', 0.3, 1.875],
  ['archer', 0.6, 3.75],
  ['balloon', 0.6, 1.875],
  ['golem', 0.6, 1.875],
  ['skeleton', 0.6, 3.75],
  ['guardian', 0.6, 3.75],
] as const)(
  'applies native defensive Rage to %s with its source movement rule',
  (kind, damage, speed) => {
    const { battle, d, step } = defenderArena(kind);
    const cast = castNativeSpell(battle, 'Spell Tower Rage', 1, 'defense', 10, 10);
    step(cast.firstHit);
    const boost = activeBoost(d.boost, battle.elapsed)!;
    expect(boost.damage).toBeCloseTo(damage, 12);
    expect(boost.speed).toBe(speed);
    const stats = defenderRageStats(battle, d, { damage: 100, speed: 2 });
    expect(stats).toEqual({ damage: 100 * (1 + damage), speed: 2 + speed });
  },
);

it.each(['hero', 'archer', 'skeleton'] as const)(
  'uses the boosted primary damage in actual %s attacks',
  (kind) => {
    const { battle, d, target, ctx, step } = defenderArena(kind);
    const cast = castNativeSpell(battle, 'Spell Tower Rage', 1, 'defense', 10, 10);
    step(cast.firstHit);
    const base =
      kind === 'hero'
        ? nativeUnitStats('barbarianking', 1).damage
        : kind === 'archer'
          ? garrisonStats('archer', 9).damage
          : skeletonStats('ground', 1).damage;
    for (let count = 0; target.hp === target.maxHp; count++) {
      if (count > 80) throw Error('Raged defender never hit');
      battle.elapsed += 0.05;
      stepNativeSpells(ctx);
      if (d.kind === 'hero') stepDefendingHeroes(battle, 0.05, () => {});
      else if (d.kind === 'skeleton') stepDefenders(battle, 0.05, () => {});
      else stepGarrisonDefender(battle, d, 0.05, () => {});
    }
    expect(target.maxHp - target.hp).toBeCloseTo(base * (kind === 'hero' ? 1.3 : 1.6), 8);
  },
);

it('rejects unborn and out-of-range defensive recipients and does not boost the opposing army', () => {
  const { battle, d, target, step } = defenderArena('guardian');
  const cast = castNativeSpell(battle, 'Spell Tower Rage', 1, 'defense', 10, 10);
  d.spawnedAt = cast.firstHit + 1;
  step(cast.firstHit);
  expect(d.boost).toBeUndefined();
  expect(target.native?.effects?.boost).toBeUndefined();
  d.spawnedAt = 0;
  d.x = 20;
  step(cast.firstHit + 0.3);
  expect(d.boost).toBeUndefined();
});

it.each(['healer', 'druid', 'unicorn'] as const)(
  'boosts actual %s healing with Rage and preserves the older rate',
  (kind) => {
    for (const version of [92, REPLAY_VERSION]) {
      const { model, battle, step } = arena(version);
      const healer = unit(kind);
      const target = unit(kind === 'unicorn' ? 'barbarianking' : 'giant', 2000, 11);
      target.hp = target.maxHp / 2;
      if (kind === 'unicorn') {
        battle.nativeHeroRoster = true;
        target.hero = 'king';
        battle.nativeHeroes = [
          {
            kind: 'king',
            level: 1,
            items: [],
            unitId: target.id,
            petId: healer.id,
            pet: { kind: 'unicorn', level: 1 },
            deployed: true,
          },
        ];
      }
      battle.units = [healer, target];
      const cast = castNativeSpell(battle, 'Rage', 1, 'attack', 10, 10);
      step(cast.firstHit);
      const hp = target.hp;
      for (let count = 0; target.hp === hp; count++) {
        if (count > 80) throw Error('Raged healer never healed');
        model.step(0.05);
      }
      expect(target.hp - hp).toBeCloseTo(
        nativeUnitStats(kind, 1).heal * (version >= 93 ? 2.3 : 1),
        8,
      );
    }
  },
);

it('keeps a Hero ability source separate from a continuing weaker aura', () => {
  const { battle, ctx, step } = arena();
  const king = unit('barbarianking');
  king.hero = 'king';
  battle.nativeHeroRoster = true;
  battle.nativeHeroes = [
    {
      kind: 'king',
      level: 1,
      items: [{ slug: 'rage-vial', level: 1 }],
      unitId: king.id,
      deployed: true,
    },
  ];
  battle.units = [king];
  const rage = castNativeSpell(battle, 'Rage', 1, 'attack', 10, 10);
  castNativeSpell(battle, 'Rage Gem Aura', 1, 'attack', 10, 10);
  step(rage.firstHit);
  const hero = battle.nativeHeroes[0];
  const ability = heroAbilities(hero).find((a) => num(a.row, 'BoostDamagePercentage') > 0)!;
  activateHero(ctx, hero, king, 18);
  const ownDamage = num(ability.row, 'BoostDamagePercentage') / 100;
  expect(unitDamageScale(king, battle.elapsed)).toBeCloseTo(1 + Math.max(0.65, ownDamage), 12);
  king.x = 17;
  step(rage.firstHit + seconds(ability.row, 'DeactivateAfterTime') + 0.1);
  expect(unitDamageScale(king, battle.elapsed)).toBeCloseTo(1.075, 12);
  expect(unitSpeedBonus(king, battle.elapsed)).toBe(0);
});

it('retains temporary Rage when a Dark Crown threshold grants its permanent boost', () => {
  const { model, battle, ctx, step } = arena();
  battle.nativeHeroRoster = true;
  battle.nativeHeroes = [
    { kind: 'prince', level: 1, items: [{ slug: 'dark-crown', level: 1 }], unitId: null },
  ];
  expect(model.deployNativeHero('prince', 10, 10)).toBe(true);
  const prince = battle.units[0];
  const hero = battle.nativeHeroes[0];
  const cast = castNativeSpell(battle, 'Rage', 1, 'attack', 10, 10);
  step(cast.firstHit);
  battle.units.push(...[0, 1, 2].map((i) => ({ ...unit('pekka', 2000 + i), hp: 0 })));
  stepEquipmentEffects(ctx, hero, prince);
  const boost = prince.native!.effects!.boost!;
  const crown = boost.sources!['equipment:dark-crown'];
  expect(crown.until).toBe(Infinity);
  expect(unitDamageScale(prince, battle.elapsed)).toBeCloseTo(1 + Math.max(0.65, crown.damage), 12);
  expect(unitSpeedBonus(prince, battle.elapsed)).toBe(1.25);
  expect(unitSpeedBonus(prince, boost.sources![`spell:${cast.id}`].until + 0.1)).toBe(0);
  expect(unitDamageScale(prince, boost.sources![`spell:${cast.id}`].until + 0.1)).toBeCloseTo(
    1 + crown.damage,
    12,
  );
});

it('boosts healing with a Rage Gem after a stronger Rage Spell expires', () => {
  const { model, battle, step } = arena();
  const healer = unit('druid');
  const target = unit('giant', 2000, 11);
  target.hp = target.maxHp / 2;
  battle.units = [healer, target];
  const rage = castNativeSpell(battle, 'Rage', 1, 'attack', 10, 10);
  castNativeSpell(battle, 'Rage Gem Aura', 1, 'attack', 10, 10);
  step(rage.firstHit + 0.1);
  healer.x = target.x = 17;
  step(rage.firstHit + 1.05);
  const hp = target.hp;
  for (let count = 0; target.hp === hp; count++) {
    if (count > 80) throw Error('Rage Gem Druid never healed');
    model.step(0.05);
  }
  expect(target.hp - hp).toBeCloseTo(nativeUnitStats('druid', 1).heal * 1.15, 8);
});

it.each([false, true])('keeps the strongest Guardian Rage when home-enraged=%s', (enraged) => {
  const { battle, ctx, step } = arena();
  const th = { ...makeBuilding(1, 'townhall', 10, 10, 18), guardian: 'smasher' as const };
  const g = createGuardian(battle, th, -20000)!;
  g.phase = 'fighting';
  g.spawnedAt = 0;
  g.x = g.y = 10;
  g.home = { x: 10, y: 10 };
  g.enraged = enraged;
  if (enraged) g.hp = g.maxHp / 4;
  const target = unit('giant', 2000, 10.2);
  target.hp = target.maxHp = 100000;
  battle.units = [target];
  battle.defenders = [g];
  const cast = castNativeSpell(battle, 'Spell Tower Rage', 1, 'defense', 10, 10);
  step(cast.firstHit);
  for (let count = 0; target.hp === target.maxHp; count++) {
    if (count > 120) throw Error('Raged Guardian never hit');
    battle.elapsed += 0.05;
    stepNativeSpells(ctx);
    stepGuardian(ctx, g, 0.05);
  }
  expect(target.maxHp - target.hp).toBeCloseTo(
    guardianStats('smasher', 1).damage *
      Math.max(1.6, 1 + (enraged ? guardianStats('smasher', 1).homeRage!.damage : 0)),
    8,
  );
});

it.each(['healing', 'aura', 'tower'] as const)(
  'reconstructs actual %s Rage inputs through portable backward seeks',
  (mode) => {
    const r = nativeRageRecording(mode);
    const boosted = r.snapshots[1].battle as Battle;
    const subject = boosted.units.find((u) => u.id === r.subjectId)!;
    if (mode !== 'tower') expect(unitDamageScale(subject, boosted.elapsed)).toBeCloseTo(2.3, 12);
    if (mode === 'aura') {
      const later = r.snapshots[2].battle as Battle;
      expect(
        unitDamageScale(
          later.units.find((u) => u.id === r.subjectId)!,
          later.elapsed,
        ),
      ).toBeCloseTo(1.15, 12);
    }
    if (mode === 'tower')
      expect(r.hits.find((h) => h.at > r.firstHit)!.damage).toBeCloseTo(
        nativeUnitStats('grandwarden', 1).damage * 1.3,
        8,
      );
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
  },
);
