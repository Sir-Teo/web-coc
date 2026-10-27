import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { heroAbilities } from '../src/game/native-heroes';
import { num, seconds } from '../src/game/native-data';
import { spawnSkeleton } from '../src/game/defenders';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { frostFlakeBattle, nativeFrostFlakeRecording } from './fixtures/native-frost-flake';
import { resolveFrostFlake } from '../src/game/native-frost-flake';
import type { NativeTroopContext } from '../src/game/native-troops';

it.each([
  [1, 4, 105, 5.2],
  [8, 4, 147, 5.6],
  [9, 5, 168, 5.8],
  [17, 5, 210, 6.2],
  [18, 6, 231, 6.4],
  [26, 6, 273, 6.8],
  [27, 7, 294, 7],
])(
  'Frost Flake item %s matches the pinned count/damage/freeze tier',
  (level, count, damage, duration) => {
    const { model, battle } = frostFlakeBattle(level);
    model.activateNativeHeroAbility('champion');
    const shots = battle.nativeFrostFlakeCasts![0].shots;
    expect(shots).toHaveLength(count);
    expect(
      shots.every((p) => p.damage === damage && p.native!.frostFlake!.seconds === duration),
    ).toBe(true);
  },
);

it.each(Array.from({ length: 27 }, (_, i) => i + 1))(
  'Frost Flake item level %s captures its mapped source damage, count and full freeze',
  (level) => {
    const { model, battle, until } = frostFlakeBattle(level);
    const ability = heroAbilities(battle.nativeHeroes![0]).find((a) => a.name === 'FrostBlast')!;
    expect(num(ability.row, 'FrostOnHitPercent')).toBe(100);
    expect(model.activateNativeHeroAbility('champion')).toBe(true);
    expect(model.activateNativeHeroAbility('champion')).toBe(false);
    const cast = battle.nativeFrostFlakeCasts![0];
    expect(cast.level).toBe(ability.level);
    expect(cast.shots).toHaveLength(num(ability.row, 'ProjectileOnActivationCount'));
    expect(new Set(cast.shots.map((p) => p.id)).size).toBe(cast.shots.length);
    expect(new Set(cast.shots.map((p) => p.targetId)).size).toBe(cast.shots.length);
    expect(cast.shots.every((p) => p.targetBuilding && p.targetId !== 9)).toBe(true);
    for (const shot of cast.shots) {
      expect(shot.native).toMatchObject({
        name: 'rc_gear_frostblast_Projectile',
        frostFlake: { castId: cast.id, seconds: seconds(ability.row, 'FrostOnHitTime') },
      });
      expect(shot.damage).toBe(num(ability.row, 'Damage'));
      expect(shot.impact - shot.launched).toBeCloseTo(
        Math.sqrt((shot.x - shot.fromX) ** 2 + (shot.y - shot.fromY) ** 2) / 15,
        12,
      );
    }
    const first = cast.shots[0],
      target = battle.buildings.find((b) => b.id === first.targetId)!,
      hp = target.hp;
    until(first.impact - 0.05);
    expect(target.hp).toBe(hp);
    until(first.impact + 0.1);
    expect(target.hp).toBe(hp - first.damage);
    expect(battle.defenseStuns[target.id]).toBe(first.impact + first.native!.frostFlake!.seconds);
    expect(battle.buildingEffects![target.id].frozenUntil).toBe(battle.defenseStuns[target.id]);
  },
);

it('fully stops actual Cannon attacks and resumes them after source freeze expiry', () => {
  const r = nativeFrostFlakeRecording();
  const at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle as Battle;
  const hp = (b: Battle) => b.units.find((u) => u.id === r.championId)!.hp;
  expect(at(r.firstHit).buildings.find((b) => b.id === 2)!.hp).toBeGreaterThan(0);
  expect(hp(at(r.mid))).toBe(hp(at(r.firstHit)));
  expect(hp(at(r.beforeThaw))).toBe(hp(at(r.mid)));
  expect(hp(at(r.afterThaw))).toBeLessThan(hp(at(r.beforeThaw)));
  expect(at(r.mid).defenseStuns[2]).toBe(r.firstImpact + r.freezeSeconds);
});

it.each(['ground', 'air'] as const)(
  'falls back to a nearby %s defender without stretching its short source travel',
  (mode) => {
    const { model, battle, championId } = frostFlakeBattle();
    battle.buildings = [battle.buildings[0]];
    const champion = battle.units.find((u) => u.id === championId)!;
    const source = makeBuilding(30, 'skeletontrap', 0, 0, 1);
    source.skeletonMode = mode;
    const target = spawnSkeleton(battle, source, 0, 0);
    Object.assign(target, { x: champion.x + 0.6, y: champion.y, hp: 10000, maxHp: 10000 });
    model.activateNativeHeroAbility('champion');
    const shot = battle.nativeFrostFlakeCasts![0].shots.find((p) => p.targetId === target.id)!;
    expect(shot.targetDefender).toBe(true);
    expect(shot.toAir).toBe(mode === 'air');
    expect(shot.impact - shot.launched).toBeCloseTo(0.04, 12);
    model.step(0.05);
    expect(target.hp).toBe(10000 - 105);
    expect(target.stunnedUntil).toBe(shot.impact + 5.2);
    expect(target.frozenUntil).toBe(target.stunnedUntil);
  },
);

it('keeps the actual moving target endpoint after a JSON snapshot loses object aliases', () => {
  const { model, battle, championId } = frostFlakeBattle();
  battle.buildings = [battle.buildings[0]];
  const champion = battle.units.find((u) => u.id === championId)!;
  const target = spawnSkeleton(battle, makeBuilding(30, 'skeletontrap', 0, 0, 1), -1, 0);
  Object.assign(target, { x: champion.x + 4, y: champion.y, hp: 10000, maxHp: 10000 });
  const initialX = target.x;
  model.activateNativeHeroAbility('champion');
  const id = battle.nativeFrostFlakeCasts![0].shots.find((p) => p.targetId === target.id)!.id;
  model.step(0.05);
  model.battle = JSON.parse(JSON.stringify(model.battle));
  for (let i = 0; i < 12; i++) model.step(0.05);
  const restored = model.battle!,
    enemy = restored.defenders!.find((d) => d.id === target.id)!;
  const record = restored.nativeFrostFlakeCasts![0].shots.find((p) => p.id === id)!;
  expect(enemy.x).toBeLessThan(initialX);
  expect(record.x).toBe(enemy.x);
  expect(record.y).toBe(enemy.y);
  expect(enemy.frozenUntil).toBe(record.impact + 5.2);
  expect(restored.projectiles?.some((p) => p.id === id)).toBe(false);
});

it('a target rooted after launch takes neither damage nor freeze', () => {
  const { model, battle, until } = frostFlakeBattle();
  model.activateNativeHeroAbility('champion');
  const shot = battle.nativeFrostFlakeCasts![0].shots[0],
    target = battle.buildings.find((b) => b.id === shot.targetId)!,
    hp = target.hp;
  battle.buildingEffects = { [target.id]: { overgrownUntil: 10 } };
  until(shot.impact + 0.1);
  expect(target.hp).toBe(hp);
  expect(battle.defenseStuns[target.id]).toBeUndefined();
  expect(battle.buildingEffects[target.id].frozenUntil).toBeUndefined();
});

it('does not redirect a flake when its selected target falls before impact', () => {
  const { model, battle, until } = frostFlakeBattle();
  model.activateNativeHeroAbility('champion');
  const cast = battle.nativeFrostFlakeCasts![0],
    first = cast.shots[0];
  battle.buildings.find((b) => b.id === first.targetId)!.hp = 0;
  const spare = battle.buildings.find((b) => b.id === 9)!,
    hp = spare.hp;
  until(first.impact + 0.1);
  expect(first.targetId).toBe(2);
  expect(spare.hp).toBe(hp);
  expect(battle.defenseStuns[first.targetId]).toBeUndefined();
  expect(cast.shots).toHaveLength(4);
});

it('retains launched freezes after the Champion falls', () => {
  const { model, battle, championId, until } = frostFlakeBattle();
  model.activateNativeHeroAbility('champion');
  const champion = battle.units.find((u) => u.id === championId)!;
  champion.hp = 0;
  champion.spent = true;
  const first = battle.nativeFrostFlakeCasts![0].shots[0];
  until(first.impact + 0.1);
  expect(battle.defenseStuns[first.targetId]).toBe(first.impact + 5.2);
});

it.each([false, true])(
  'Rocket Spears first=%s neither changes flake damage nor spends charges on the ability hit',
  (first) => {
    const items = [
      { slug: 'frost-charm', level: 1 },
      { slug: 'rocket-spear', level: 27 },
    ];
    if (first) items.reverse();
    const { model, battle, championId } = frostFlakeBattle(1, undefined, items);
    const champion = battle.units.find((u) => u.id === championId)!;
    model.activateNativeHeroAbility('champion');
    const extra = champion.native!.effects!.extraDamage!,
      charges = extra.hits;
    const shot = battle.projectiles!.find((p) => p.native?.frostFlake)!;
    expect(shot.damage).toBe(105);
    const target = battle.buildings.find((b) => b.id === shot.targetId)!,
      hp = target.hp;
    const ctx: NativeTroopContext = {
      battle,
      buildings: battle.buildings,
      buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
      passableWalls: new Set(),
      nextId: () => 1000,
      troopLevel: () => 1,
      effect: () => {},
      damageBuilding: (b, damage) => {
        b.hp = Math.max(0, b.hp - damage);
      },
    };
    expect(resolveFrostFlake(ctx, shot)).toBe(true);
    expect(target.hp).toBe(hp - 105);
    expect(champion.native!.effects!.extraDamage!.hits).toBe(charges);
  },
);

it.each([false, true])(
  'source Frost Flake Recall=%s reconstructs full battles through portable backward seeks',
  (recall) => {
    const r = nativeFrostFlakeRecording(27, recall);
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(s.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
    }
    if (recall) {
      const after = r.snapshots.find((s) => s.at === r.allHit)!.battle as Battle;
      expect(after.units.some((u) => u.id === r.championId)).toBe(false);
      expect(after.nativeFrostFlakeCasts![0].shots.some((p) => p.impact > r.recallAt!)).toBe(true);
      for (const shot of after.nativeFrostFlakeCasts![0].shots)
        expect(after.defenseStuns[shot.targetId]).toBe(
          shot.impact + shot.native!.frostFlake!.seconds,
        );
    }
  },
);

it('version 132 retains its previous activation without flakes or full freezes', () => {
  const { model, battle, until } = frostFlakeBattle(27, 132);
  model.activateNativeHeroAbility('champion');
  until(0.65);
  expect(battle.nativeFrostFlake).toBeUndefined();
  expect(battle.nativeFrostFlakeCasts).toBeUndefined();
  expect(battle.defenseStuns[2]).toBeUndefined();
});
