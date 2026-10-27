import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle, type Unit } from '../src/game/model';
import { launchArcherPiercing } from '../src/game/native-super-archer';
import { stepHeroPiercing } from '../src/game/native-hero-piercing';
import type { NativeTroopContext } from '../src/game/native-troops';
import { heroAbilities } from '../src/game/native-heroes';
import { nativeRow, num, seconds, tiles } from '../src/game/native-data';
import { spawnSkeleton } from '../src/game/defenders';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { darkOrbBattle, nativeDarkOrbRecording } from './fixtures/native-dark-orb';
import { replayBattle } from '../src/game/replay';

function holdPrince(r: ReturnType<typeof darkOrbBattle>) {
  const unit = r.battle.units.find((unit) => unit.id === r.princeId)!;
  (unit.native!.effects ??= {}).frozenUntil = 100;
  return unit;
}

it.each([
  [1, 45, 0.2, 8],
  [3, 55, 0.25, 9],
  [6, 65, 0.3, 10],
  [9, 75, 0.35, 11],
  [12, 100, 0.4, 13],
  [15, 150, 0.45, 15],
  [18, 200, 0.5, 18],
])(
  'Dark Orb item %s matches the independent damage/frost/duration tier',
  (level, damage, percent, duration) => {
    const r = darkOrbBattle(level);
    holdPrince(r);
    r.model.activateNativeHeroAbility('prince');
    expect(r.battle.nativeDarkOrbs![0]).toMatchObject({
      damage,
      frost: { percent, seconds: duration },
    });
  },
);

it.each(Array.from({ length: 18 }, (_, index) => index + 1))(
  'Dark Orb item %s captures the mapped source corridor and resolves buildings once',
  (level) => {
    const r = darkOrbBattle(level);
    holdPrince(r);
    const ability = heroAbilities(r.battle.nativeHeroes![0]).find(
      (a) => a.name === 'MinionAttackAbility',
    )!;
    const hp = new Map(r.battle.buildings.map((b) => [b.id, b.hp]));
    expect(r.model.activateNativeHeroAbility('prince')).toBe(true);
    expect(r.model.activateNativeHeroAbility('prince')).toBe(false);
    const shot = r.battle.nativeDarkOrbs![0];
    expect(shot).toMatchObject({
      level: ability.level,
      damage: num(ability.row, 'Damage'),
      radius: 5,
      speed: 12.5,
      length: 15.625,
      fromAir: true,
      frost: {
        seconds: seconds(ability.row, 'FrostOnHitTime'),
        percent: num(ability.row, 'FrostOnHitPercent') / 100,
      },
    });
    expect(shot.radius).toBe(tiles(ability.row, 'PenetratingRadius'));
    expect(nativeRow('projectiles', shot.projectile).MaxTravelTime).toBe('1250');
    r.until(1.3);
    expect(shot.travelled).toBe(shot.length);
    const ids = shot.hit.filter((h) => h.target.building).map((h) => h.target.id);
    expect(ids.slice().sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 8]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of r.battle.buildings) {
      const hit = shot.hit.find((hit) => hit.target.building && hit.target.id === b.id);
      expect(b.hp).toBe(hp.get(b.id)! - (hit ? shot.damage : 0));
      if (hit) {
        expect(r.battle.buildingEffects![b.id].frost).toEqual({
          until: hit.at + shot.frost.seconds,
          percent: shot.frost.percent,
        });
        expect(r.battle.buildingEffects![b.id].frozenUntil).toBeUndefined();
        expect(r.battle.defenseStuns[b.id]).toBeUndefined();
      }
    }
    r.until(2);
    expect(shot.hit).toHaveLength(ids.length);
  },
);

it('only enables the new controller for a recorded Prince with Dark Orb', () => {
  const r = darkOrbBattle();
  expect(replayBattle(r.data.initial).nativeDarkOrb).toBe(true);
  const setup = structuredClone(r.data.initial);
  setup.heroes![0].items = [];
  expect(replayBattle(setup).nativeDarkOrb).toBeUndefined();
  expect(replayBattle(r.data.initial, 134).nativeDarkOrb).toBeUndefined();
});

it('copies the assigned heading and keeps it after its target disappears', () => {
  const r = darkOrbBattle(),
    prince = holdPrince(r);
  prince.target = 6;
  r.model.activateNativeHeroAbility('prince');
  const shot = r.battle.nativeDarkOrbs![0],
    dx = 25.5 - prince.x,
    dy = 22.5 - prince.y;
  expect(shot.dirX).toBeCloseTo(dx / Math.sqrt(dx * dx + dy * dy), 12);
  expect(shot.dirY).toBeCloseTo(dy / Math.sqrt(dx * dx + dy * dy), 12);
  const heading = [shot.dirX, shot.dirY];
  r.battle.buildings.find((b) => b.id === 6)!.hp = 0;
  r.until(0.5);
  expect([shot.dirX, shot.dirY]).toEqual(heading);
});

it('uses the initial southeast heading without targets and clips its physical path at the map edge', () => {
  const r = darkOrbBattle(),
    prince = holdPrince(r);
  r.battle.buildingEffects = Object.fromEntries(
    r.battle.buildings.map((b) => [b.id, { invisibleUntil: 100 }]),
  );
  prince.x = prince.y = 47;
  r.model.activateNativeHeroAbility('prince');
  const shot = r.battle.nativeDarkOrbs![0];
  expect(shot.dirX).toBeCloseTo(Math.SQRT1_2, 12);
  expect(shot.dirY).toBeCloseTo(Math.SQRT1_2, 12);
  expect(shot.length).toBeCloseTo(Math.SQRT2, 12);
});

it('contacts both defender layers at the source radius, skipping future births', () => {
  const r = darkOrbBattle(),
    prince = holdPrince(r);
  const source = makeBuilding(30, 'skeletontrap', 0, 0, 1);
  const defenders = [
    { mode: 'ground', x: prince.x + 8, y: prince.y + 5, born: 0 },
    { mode: 'air', x: prince.x + 9, y: prince.y - 5, born: 0 },
    { mode: 'ground', x: prince.x + 8, y: prince.y + 5.001, born: 0 },
    { mode: 'air', x: prince.x + 8, y: prince.y, born: 2 },
  ].map((row, index) => {
    const d = spawnSkeleton(r.battle, source, 0, index);
    Object.assign(d, { ...row, spawnedAt: row.born, hp: 10000, maxHp: 10000, stunnedUntil: 100 });
    return d;
  });
  r.model.activateNativeHeroAbility('prince');
  r.until(1.3);
  const shot = r.battle.nativeDarkOrbs![0];
  expect(defenders.map((d) => d.hp)).toEqual([9955, 9955, 10000, 10000]);
  for (const d of defenders.slice(0, 2)) {
    const hit = shot.hit.find((hit) => !hit.target.building && hit.target.id === d.id)!;
    expect(d.frost).toEqual({ until: hit.at + 8, percent: 0.2 });
  }
});

it('preserves Overgrowth immunity while reaching invisible collateral buildings', () => {
  const r = darkOrbBattle();
  const prince = holdPrince(r);
  prince.target = 2;
  const cannon = r.battle.buildings.find((b) => b.id === 2)!,
    mine = r.battle.buildings.find((b) => b.id === 3)!;
  const hp = [cannon.hp, mine.hp];
  r.model.activateNativeHeroAbility('prince');
  r.battle.buildingEffects = { 2: { overgrownUntil: 10 }, 3: { invisibleUntil: 10 } };
  r.until(1.3);
  expect(cannon.hp).toBe(hp[0]);
  expect(r.battle.buildingEffects[2].frost).toBeUndefined();
  expect(mine.hp).toBe(hp[1] - 45);
  expect(r.battle.buildingEffects[3].frost).toBeDefined();
});

it('slows actual Air Defense fire without fully stopping it', () => {
  const states = [134, 135].map((version) => {
    const r = darkOrbBattle(18, version),
      prince = holdPrince(r);
    prince.x = 18;
    r.model.activateNativeHeroAbility('prince');
    r.until(2.75);
    return { hp: prince.hp, max: prince.maxHp };
  });
  expect(states[1].hp).toBeGreaterThan(states[0].hp);
  expect(states[1].hp).toBeLessThan(states[1].max);
});

it('retains its captured frost and later contacts after the Prince is defeated', () => {
  const r = darkOrbBattle(18),
    prince = holdPrince(r);
  r.model.activateNativeHeroAbility('prince');
  prince.hp = 0;
  prince.spent = true;
  r.until(1.3);
  const shot = r.battle.nativeDarkOrbs![0];
  expect(shot.hit.length).toBeGreaterThan(0);
  for (const hit of shot.hit.filter((hit) => hit.target.building))
    expect(r.battle.buildingEffects![hit.target.id].frost).toEqual({
      until: hit.at + 18,
      percent: 0.5,
    });
});

it.each([false, true])(
  'does not borrow or spend Noble Iron damage charges, reverse item order=%s',
  (reverse) => {
    const items = [
      { slug: 'dark-orb', level: 18 },
      { slug: 'noble-iron', level: 18 },
    ];
    const r = darkOrbBattle(18, undefined, reverse ? items.reverse() : items),
      prince = holdPrince(r);
    const charges = prince.native!.effects!.extraDamage!.hits!;
    expect(charges).toBeGreaterThan(0);
    r.model.activateNativeHeroAbility('prince');
    r.until(1.3);
    expect(prince.native!.effects!.extraDamage!.hits).toBe(charges);
    expect(r.battle.nativeDarkOrbs![0].damage).toBe(200);
  },
);

it('resolves a nearby Dark Orb contact before a later Super Archer arrival regardless of enqueue order', () => {
  const r = darkOrbBattle(),
    prince = holdPrince(r),
    target = makeBuilding(30, 'goldmine', 10, 10, 16);
  target.hp = 1000;
  r.battle.buildings = [target];
  prince.x = 6;
  const damage: { at: number; power: number }[] = [];
  const ctx: NativeTroopContext = {
    battle: r.battle,
    buildings: r.battle.buildings,
    buildingsById: new Map([[target.id, target]]),
    passableWalls: new Set(),
    nextId: () => 1000,
    troopLevel: () => 1,
    damageBuilding: (building, power, at = r.battle.elapsed) => {
      damage.push({ at, power });
      building.hp = Math.max(0, building.hp - power);
    },
    effect: () => {},
  };
  const archer: Unit = {
    id: 200,
    kind: 'superarcher',
    level: 1,
    x: 6,
    y: 11.5,
    hp: 100,
    maxHp: 100,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  launchArcherPiercing(ctx, archer, 1000, { building: target });
  r.model.activateNativeHeroAbility('prince');
  r.battle.elapsed = 1;
  stepHeroPiercing(ctx);
  expect(damage.map((hit) => hit.power)).toEqual([45, 1000]);
  expect(damage[0].at).toBeLessThan(damage[1].at);
  expect(target.hp).toBe(0);
});

it.each([false, true])(
  'reconstructs portable Dark Orb contacts and frost with Recall=%s',
  (recall) => {
    const r = nativeDarkOrbRecording(18, recall),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
    if (recall) {
      const b = r.snapshots.find((s) => s.at === r.impact)!.battle as Battle;
      expect(b.units.some((unit) => unit.id === r.princeId)).toBe(false);
      expect(b.nativeDarkOrbs![0].hit.some((hit) => hit.at > 1)).toBe(true);
    }
  },
);

it('version 134 retains its previous Dark Orb activation without corridor or frost', () => {
  const r = darkOrbBattle(18, 134);
  holdPrince(r);
  r.model.activateNativeHeroAbility('prince');
  r.until(1.5);
  expect(r.battle.nativeDarkOrb).toBeUndefined();
  expect(r.battle.nativeDarkOrbs).toBeUndefined();
  expect(r.battle.buildingEffects?.[2]?.frost).toBeUndefined();
});
