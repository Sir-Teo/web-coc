import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { heroAbilities } from '../src/game/native-heroes';
import { num } from '../src/game/native-data';
import { spawnSkeleton } from '../src/game/defenders';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle } from '../src/game/replay';
import {
  seekingShieldBattle,
  nativeSeekingShieldRecording,
  automaticSeekingShieldRecording,
} from './fixtures/native-seeking-shield';

function holdChampion(r: ReturnType<typeof seekingShieldBattle>) {
  const unit = r.battle.units.find((unit) => unit.id === r.championId)!;
  (unit.native!.effects ??= {}).frozenUntil = 100;
  return unit;
}

it.each([
  [1, 1000],
  [3, 1250],
  [6, 1500],
  [9, 1750],
  [12, 2000],
  [15, 2250],
  [18, 2500],
])('Seeking Shield item %s matches its independent source damage tier', (level, damage) => {
  const r = seekingShieldBattle(level);
  holdChampion(r);
  r.model.activateNativeHeroAbility('champion');
  r.until(3.5);
  const cast = r.battle.nativeSeekingShieldCasts![0];
  expect(cast.shots).toHaveLength(4);
  expect(cast.shots.every((shot) => shot.damage === damage)).toBe(true);
});

it.each(Array.from({ length: 18 }, (_, index) => index + 1))(
  'Seeking Shield item %s captures four distinct defense hits after its fixed wind-up',
  (level) => {
    const r = seekingShieldBattle(level);
    holdChampion(r);
    const ability = heroAbilities(r.battle.nativeHeroes![0]).find(
      (a) => a.name === 'RoyalChampionShieldBounce',
    )!;
    expect(r.model.activateNativeHeroAbility('champion')).toBe(true);
    expect(r.model.activateNativeHeroAbility('champion')).toBe(false);
    const cast = r.battle.nativeSeekingShieldCasts![0];
    expect(cast.launchAt).toBe(0.933);
    expect(cast.level).toBe(ability.level);
    expect(cast.shots).toEqual([]);
    r.until(0.9);
    expect(cast.released).toBeUndefined();
    r.until(0.95);
    expect(cast.released).toBe(true);
    for (let index = 0; index < 4; index++) {
      const shot = cast.shots[index];
      expect(shot).toBeDefined();
      expect(shot.damage).toBe(num(ability.row, 'Damage'));
      expect(shot.targetId).toBe(index + 2);
      expect(shot.native!.seekingShield).toMatchObject({
        castId: cast.id,
        index,
        left: 3 - index,
        reach: 70,
      });
      expect(shot.impact - shot.launched).toBeCloseTo(
        Math.sqrt((shot.x - shot.fromX) ** 2 + (shot.y - shot.fromY) ** 2) / 20,
        12,
      );
      if (index) expect(shot.launched).toBe(cast.shots[index - 1].impact);
      else expect(shot.launched).toBe(0.933);
      const target = r.battle.buildings.find((b) => b.id === shot.targetId)!,
        hp = target.hp;
      r.until(shot.impact);
      expect(target.hp).toBe(Math.max(0, hp - shot.damage));
      expect(shot.native!.seekingShield!.continues).toBe(index < 3 ? true : undefined);
    }
    expect(new Set(cast.shots.map((shot) => shot.targetId)).size).toBe(4);
    expect(new Set(cast.shots.map((shot) => shot.id)).size).toBe(4);
  },
);

it('enables the new controller only for a recorded Champion carrying Seeking Shield', () => {
  const r = seekingShieldBattle();
  expect(replayBattle(r.data.initial).nativeSeekingShield).toBe(true);
  const setup = structuredClone(r.data.initial);
  setup.heroes![0].items = [];
  expect(replayBattle(setup).nativeSeekingShield).toBeUndefined();
  expect(replayBattle(r.data.initial, 135).nativeSeekingShield).toBeUndefined();
});

it('keeps the fixed source wind-up under animation slowdowns and follows the living caster until release', () => {
  const r = seekingShieldBattle(),
    champion = holdChampion(r);
  champion.native!.effects!.chill = { until: 100, percent: 0.8 };
  r.model.activateNativeHeroAbility('champion');
  r.until(0.9);
  champion.x = 8;
  r.until(0.95);
  const cast = r.battle.nativeSeekingShieldCasts![0],
    shot = cast.shots[0];
  expect(shot.launched).toBe(0.933);
  expect(shot.fromX).toBe(8);
  expect(cast.x).toBe(8);
});

it('copies a valid assigned defense while prioritizing defenses over a closer ordinary building', () => {
  for (const copy of [false, true]) {
    const r = seekingShieldBattle(),
      champion = holdChampion(r);
    if (copy) champion.target = 4;
    r.model.activateNativeHeroAbility('champion');
    r.until(0.95);
    expect(r.battle.nativeSeekingShieldCasts![0].shots[0].targetId).toBe(copy ? 4 : 2);
  }
});

it('selects a living replacement at release when the copied wind-up target has already fallen', () => {
  const r = seekingShieldBattle(),
    champion = holdChampion(r);
  champion.target = 2;
  r.model.activateNativeHeroAbility('champion');
  r.battle.buildings.find((b) => b.id === 2)!.hp = 0;
  r.until(0.95);
  expect(r.battle.nativeSeekingShieldCasts![0].shots[0].targetId).toBe(3);
});

it('preserves launch-time damage and counts a dead or immune landing once before continuing', () => {
  for (const dead of [false, true]) {
    const r = seekingShieldBattle(18);
    holdChampion(r);
    r.model.activateNativeHeroAbility('champion');
    r.until(0.95);
    const cast = r.battle.nativeSeekingShieldCasts![0],
      first = cast.shots[0],
      target = r.battle.buildings.find((b) => b.id === first.targetId)!,
      hp = target.hp;
    if (dead) target.hp = 0;
    else r.battle.buildingEffects = { [target.id]: { overgrownUntil: 100 } };
    r.until(first.impact);
    expect(target.hp).toBe(dead ? 0 : hp);
    expect(cast.shots).toHaveLength(2);
    expect(cast.shots[1].targetId).not.toBe(first.targetId);
    expect([cast.shots[1].fromX, cast.shots[1].fromY]).toEqual([first.x, first.y]);
  }
});

it('fires instantly when real Cannon damage triggers automatic knockout activation', () => {
  const r = seekingShieldBattle(18),
    champion = holdChampion(r);
  champion.x = 11;
  champion.hp = 1;
  for (let steps = 0; !r.battle.nativeSeekingShieldCasts?.length && steps < 100; steps++)
    r.model.step(0.05);
  const cast = r.battle.nativeSeekingShieldCasts![0];
  expect(cast).toBeDefined();
  expect(cast.launchAt).toBe(cast.at);
  expect(cast.released).toBe(true);
  expect(cast.shots[0].launched).toBe(cast.at);
  r.until(cast.at + 3);
  expect(cast.shots).toHaveLength(4);
});

it('pauses real ordinary building attacks for 1.2 seconds without adding a residual cooldown', () => {
  const r = seekingShieldBattle(),
    champion = r.battle.units.find((unit) => unit.id === r.championId)!;
  champion.x = 11;
  r.model.activateNativeHeroAbility('champion');
  r.until(1.15);
  expect(
    r.battle.projectiles?.some(
      (shot) => shot.sourceId === champion.id && !shot.native?.seekingShield,
    ),
  ).toBe(false);
  expect(champion.attacking).toBe(false);
  expect(champion.cooldown).toBeLessThanOrEqual(0);
  r.until(1.2);
  expect(
    r.battle.projectiles?.some(
      (shot) => shot.sourceId === champion.id && !shot.native?.seekingShield,
    ),
  ).toBe(true);
});

it('flies to the top corner and stops when no target is visible at release', () => {
  const r = seekingShieldBattle();
  holdChampion(r);
  r.battle.buildingEffects = Object.fromEntries(
    r.battle.buildings.map((b) => [b.id, { invisibleUntil: 100 }]),
  );
  const hp = r.battle.buildings.map((b) => b.hp);
  r.model.activateNativeHeroAbility('champion');
  r.until(4);
  const cast = r.battle.nativeSeekingShieldCasts![0];
  expect(cast.shots).toHaveLength(1);
  expect(cast.shots[0]).toMatchObject({
    x: 0,
    y: 0,
    targetId: 0,
    native: { seekingShield: { wasted: true, left: 0 } },
  });
  expect(r.battle.buildings.map((b) => b.hp)).toEqual(hp);
});

it('pauses ordinary defender attacks without spending their attack interval', () => {
  const r = seekingShieldBattle(),
    champion = r.battle.units.find((unit) => unit.id === r.championId)!;
  r.battle.buildingEffects = Object.fromEntries(
    r.battle.buildings.map((b) => [b.id, { invisibleUntil: 100 }]),
  );
  const target = spawnSkeleton(r.battle, makeBuilding(30, 'skeletontrap', 0, 0, 1), 0, 0);
  Object.assign(target, {
    x: champion.x + 1,
    y: champion.y,
    hp: 10000,
    maxHp: 10000,
    stunnedUntil: 100,
    alerted: true,
  });
  champion.defenderTarget = target.id;
  r.model.activateNativeHeroAbility('champion');
  r.until(1.15);
  expect(target.hp).toBe(9000);
  expect(
    r.battle.projectiles?.some(
      (shot) => shot.sourceId === champion.id && !shot.native?.seekingShield,
    ),
  ).toBe(false);
  expect(champion.cooldown).toBeLessThanOrEqual(0);
  expect(champion.attacking).toBe(false);
  r.until(1.2);
  expect(
    r.battle.projectiles?.some(
      (shot) => shot.sourceId === champion.id && !shot.native?.seekingShield,
    ),
  ).toBe(true);
});

it('falls back to both defender layers and resolves short ricochets inside the fixed sample', () => {
  const r = seekingShieldBattle(),
    champion = holdChampion(r);
  r.battle.buildingEffects = Object.fromEntries(
    r.battle.buildings.map((b) => [b.id, { invisibleUntil: 100 }]),
  );
  const source = makeBuilding(30, 'skeletontrap', 0, 0, 1);
  const defenders = Array.from({ length: 6 }, (_, index) => {
    const d = spawnSkeleton(r.battle, source, 0, index);
    Object.assign(d, {
      x: champion.x + 0.1 + index * 0.01,
      y: champion.y,
      hp: 10000,
      maxHp: 10000,
      stunnedUntil: 100,
      mode: index % 2 ? 'air' : 'ground',
    });
    if (index === 4) d.invisibleUntil = 100;
    if (index === 5) d.spawnedAt = 2;
    return d;
  });
  r.model.activateNativeHeroAbility('champion');
  r.until(1);
  const shots = r.battle.nativeSeekingShieldCasts![0].shots;
  expect(shots).toHaveLength(4);
  expect(shots.map((shot) => Math.round(shot.impact * 1000) / 1000)).toEqual([
    0.943, 0.953, 0.963, 0.973,
  ]);
  expect(shots.map((shot) => shot.toAir)).toEqual([false, true, false, true]);
  expect(defenders.map((d) => d.hp)).toEqual([9000, 9000, 9000, 9000, 10000, 10000]);
});

it('restores a pending wind-up and moving-target flight after JSON snapshots break aliases', () => {
  const r = seekingShieldBattle(),
    champion = holdChampion(r);
  r.battle.buildingEffects = Object.fromEntries(
    r.battle.buildings.map((b) => [b.id, { invisibleUntil: 100 }]),
  );
  const target = spawnSkeleton(r.battle, makeBuilding(30, 'skeletontrap', 0, 0, 1), -1, 0);
  Object.assign(target, { x: champion.x + 4, y: champion.y, hp: 10000, maxHp: 10000 });
  r.model.activateNativeHeroAbility('champion');
  r.until(0.5);
  r.model.battle = JSON.parse(JSON.stringify(r.model.battle));
  while (r.model.battle!.elapsed < 0.95 - 1e-9) r.model.step(0.05);
  const first = r.model.battle!.nativeSeekingShieldCasts![0].shots[0],
    id = first.id,
    initialX = first.x;
  r.model.battle = JSON.parse(JSON.stringify(r.model.battle));
  let landing: { x: number; y: number } | undefined;
  r.model.onEffect = (fx) => {
    if (fx.type === 'impact' && fx.projectileId === id) landing = { x: fx.toX!, y: fx.toY! };
  };
  for (let i = 0; i < 30 && !landing; i++) r.model.step(0.05);
  const record = r.model.battle!.nativeSeekingShieldCasts![0].shots[0];
  expect(landing).toBeDefined();
  expect(record.x).toBeLessThan(initialX);
  expect({ x: record.x, y: record.y }).toEqual(landing);
  expect(r.model.battle!.defenders!.find((d) => d.id === target.id)!.hp).toBe(9000);
});

it.each([false, true])(
  'does not borrow damage or consume Rocket Spear charges, reverse item order=%s',
  (reverse) => {
    const items = [
      { slug: 'seeking-shield', level: 18 },
      { slug: 'rocket-spear', level: 27 },
    ];
    const r = seekingShieldBattle(18, undefined, reverse ? items.reverse() : items),
      champion = holdChampion(r);
    r.model.activateNativeHeroAbility('champion');
    const charges = champion.native!.effects!.extraDamage!.hits!;
    expect(charges).toBeGreaterThan(0);
    r.until(3.5);
    expect(champion.native!.effects!.extraDamage!.hits).toBe(charges);
    expect(
      r.battle.nativeSeekingShieldCasts![0].shots.every(
        (shot) => shot.damage === 2500 && shot.splash === undefined,
      ),
    ).toBe(true);
  },
);

it('keeps a pending manual throw and its flight alive after the caster dies with no army remaining', () => {
  const r = seekingShieldBattle(),
    champion = holdChampion(r);
  r.battle.remaining = emptyArmy();
  r.battle.spells = emptySpells();
  for (const b of r.battle.buildings) b.hp = 10000;
  r.model.activateNativeHeroAbility('champion');
  champion.hp = 0;
  champion.spent = true;
  r.until(0.9);
  expect(r.battle.finished).toBe(false);
  const cast = r.battle.nativeSeekingShieldCasts![0];
  for (let steps = 0; !r.battle.finished && steps < 200; steps++) r.model.step(0.05);
  expect(r.battle.finished).toBe(true);
  expect(cast.shots).toHaveLength(4);
  expect(r.battle.elapsed).toBeGreaterThanOrEqual(cast.shots[3].impact - 1e-9);
  expect(r.battle.elapsed).toBeLessThan(cast.shots[3].impact + 0.051);
});

it.each([false, true])(
  'reconstructs pending wind-up, ricochets and damage with Recall=%s',
  (recall) => {
    const r = nativeSeekingShieldRecording(18, recall),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
    const pending = r.snapshots.find((s) => s.at === r.pending)!.battle as Battle;
    expect(pending.nativeSeekingShieldCasts![0].shots).toEqual([]);
    if (recall) {
      const before = r.snapshots.find((s) => s.at === r.beforeLaunch)!.battle as Battle;
      expect(before.nativeHeroes![0].unitId).toBeNull();
      expect(before.nativeSeekingShieldCasts![0].shots).toEqual([]);
      expect(before.nativeSeekingShieldCasts![0].released).toBeUndefined();
      expect(before.elapsed).toBeLessThan(before.nativeSeekingShieldCasts![0].launchAt);
      const flight = r.snapshots.find((s) => s.at === r.flight)!.battle as Battle;
      expect(flight.units.some((unit) => unit.id === r.championId)).toBe(false);
      expect(flight.nativeSeekingShieldCasts![0].shots).toHaveLength(1);
    }
  },
);

it('version 135 retains its previous activation without shield state or an attack pause', () => {
  const r = seekingShieldBattle(18, 135),
    champion = holdChampion(r);
  r.model.activateNativeHeroAbility('champion');
  r.until(1);
  expect(r.battle.nativeSeekingShield).toBeUndefined();
  expect(r.battle.nativeSeekingShieldCasts).toBeUndefined();
  expect(champion.native!.effects!.attackDisabledUntil).toBeUndefined();
});

it('reconstructs the instant automatic throw from source Monolith damage without an ability input', () => {
  const r = automaticSeekingShieldRecording(),
    model = new GameModel();
  expect(r.data.actions.some((action) => action.type === 'ability')).toBe(false);
  expect(r.launchAt).toBe(r.castAt);
  expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
  for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
    model.seekReplay(snapshot.at);
    while (model.replay!.seeking) model.step(0.05);
    expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
  }
});
