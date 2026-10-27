import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { heroAbilities } from '../src/game/native-heroes';
import { num } from '../src/game/native-data';
import { spawnSkeleton } from '../src/game/defenders';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { spikyBallBattle, nativeSpikyBallRecording } from './fixtures/native-spiky-ball';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';

function holdKing(r: ReturnType<typeof spikyBallBattle>) {
  const unit = r.battle.units.find((unit) => unit.id === r.kingId)!;
  (unit.native!.effects ??= {}).frozenUntil = 100;
  return unit;
}

it.each([
  [1, 2, 1000],
  [2, 2, 1000],
  [3, 3, 1250],
  [6, 4, 1500],
  [9, 5, 1750],
  [12, 6, 2000],
  [15, 6, 2250],
  [18, 7, 2500],
  [21, 7, 2750],
  [24, 7, 3000],
  [27, 8, 3250],
])(
  'Spiky Ball item %s matches its independent source target and damage tier',
  (level, count, damage) => {
    const r = spikyBallBattle(level);
    holdKing(r);
    r.model.activateNativeHeroAbility('king');
    r.until(5);
    const shots = r.battle.nativeSpikyBallCasts![0].shots;
    expect(shots).toHaveLength(count);
    expect(shots.every((shot) => shot.damage === damage)).toBe(true);
  },
);

it.each(Array.from({ length: 27 }, (_, index) => index + 1))(
  'Spiky Ball item %s resolves each distinct building once at source speed',
  (level) => {
    const r = spikyBallBattle(level);
    holdKing(r);
    const ability = heroAbilities(r.battle.nativeHeroes![0]).find(
      (a) => a.name === 'FootballBounce',
    )!;
    expect(r.model.activateNativeHeroAbility('king')).toBe(true);
    expect(r.model.activateNativeHeroAbility('king')).toBe(false);
    const cast = r.battle.nativeSpikyBallCasts![0];
    const count = num(ability.row, 'ProjectileBounces') + 1;
    for (let index = 0; index < count; index++) {
      expect(cast.shots).toHaveLength(index + 1);
      const shot = cast.shots[index];
      expect(shot.damage).toBe(num(ability.row, 'Damage'));
      expect(shot.native!.spikyBall).toMatchObject({
        castId: cast.id,
        index,
        left: count - index - 1,
        reach: 70,
      });
      expect(shot.native!.spikyBall!.visited).toHaveLength(index + 1);
      expect(shot.impact - shot.launched).toBeCloseTo(
        Math.sqrt((shot.x - shot.fromX) ** 2 + (shot.y - shot.fromY) ** 2) / 15,
        12,
      );
      const target = r.battle.buildings.find((b) => b.id === shot.targetId)!,
        hp = target.hp;
      if (index) {
        const previous = cast.shots[index - 1];
        expect(shot.launched).toBe(previous.impact);
        expect([shot.fromX, shot.fromY]).toEqual([previous.x, previous.y]);
      }
      r.until(shot.impact);
      expect(target.hp).toBe(Math.max(0, hp - shot.damage));
      expect(shot.native!.spikyBall!.continues).toBe(index + 1 < count ? true : undefined);
    }
    expect(new Set(cast.shots.map((shot) => shot.targetId)).size).toBe(count);
    expect(new Set(cast.shots.map((shot) => shot.id)).size).toBe(count);
    r.until(6);
    expect(cast.shots).toHaveLength(count);
    expect(r.battle.projectiles?.some((shot) => shot.native?.spikyBall)).toBe(false);
  },
);

it('copies a valid current building target and otherwise prefers the closest building over troops', () => {
  for (const copy of [false, true]) {
    const r = spikyBallBattle();
    const king = holdKing(r);
    if (copy) king.target = 4;
    const source = makeBuilding(30, 'skeletontrap', 7, 11, 1);
    const defender = spawnSkeleton(r.battle, source, 0, 0);
    defender.x = king.x;
    defender.y = king.y;
    r.model.activateNativeHeroAbility('king');
    expect(r.battle.nativeSpikyBallCasts![0].shots[0].targetId).toBe(copy ? 4 : 2);
  }
});

it('skips walls, traps, buried Teslas and hidden buildings before selecting a visible target', () => {
  const r = spikyBallBattle();
  holdKing(r);
  r.battle.buildings.push(
    makeBuilding(30, 'wall', 8, 11, 18),
    makeBuilding(31, 'bomb', 9, 11, 1),
    makeBuilding(32, 'tesla', 9, 12, 1),
  );
  r.battle.buildingEffects = { 2: { invisibleUntil: 10 }, 3: { overgrownUntil: 10 } };
  r.model.activateNativeHeroAbility('king');
  expect(r.battle.nativeSpikyBallCasts![0].shots[0].targetId).toBe(9);
});

it('spends a dead or newly Overgrown target once and continues from that landing without redirecting', () => {
  for (const dead of [false, true]) {
    const r = spikyBallBattle(3);
    holdKing(r);
    r.model.activateNativeHeroAbility('king');
    const cast = r.battle.nativeSpikyBallCasts![0],
      first = cast.shots[0];
    const target = r.battle.buildings.find((b) => b.id === first.targetId)!,
      hp = target.hp;
    if (dead) target.hp = 0;
    else r.battle.buildingEffects = { [target.id]: { overgrownUntil: 100 } };
    r.until(first.impact);
    expect(target.hp).toBe(dead ? 0 : hp);
    expect(cast.shots).toHaveLength(2);
    expect(cast.shots[1].targetId).not.toBe(target.id);
    expect([cast.shots[1].fromX, cast.shots[1].fromY]).toEqual([first.x, first.y]);
  }
});

it('ends after the available targets and retains a wasted activation without inventing a target', () => {
  for (const visible of [false, true]) {
    const r = spikyBallBattle(27);
    holdKing(r);
    r.battle.buildingEffects = Object.fromEntries(
      r.battle.buildings
        .filter((b) => !visible || b.id !== 2)
        .map((b) => [b.id, { invisibleUntil: 100 }]),
    );
    r.model.activateNativeHeroAbility('king');
    r.until(2);
    expect(r.battle.nativeHeroes![0].abilityUsed).toBe(true);
    expect(r.battle.nativeSpikyBallCasts).toHaveLength(1);
    const cast = r.battle.nativeSpikyBallCasts![0];
    expect(cast.shots).toHaveLength(visible ? 1 : 0);
    expect(cast.shots[0]?.native!.spikyBall!.continues).toBeUndefined();
  }
});

it('falls back only to visible born ground defenders and resolves short ricochets within the sample', () => {
  const r = spikyBallBattle(3),
    king = holdKing(r);
  r.battle.buildingEffects = Object.fromEntries(
    r.battle.buildings.map((b) => [b.id, { invisibleUntil: 100 }]),
  );
  const source = makeBuilding(30, 'skeletontrap', 7, 11, 1);
  const defenders = Array.from({ length: 6 }, (_, index) => {
    const defender = spawnSkeleton(r.battle, source, 0, index);
    Object.assign(defender, {
      x: king.x + (index + 1) * 0.01,
      y: king.y,
      hp: 10000,
      maxHp: 10000,
      stunnedUntil: 100,
    });
    if (index === 3) defender.mode = 'air';
    if (index === 4) defender.invisibleUntil = 100;
    if (index === 5) defender.spawnedAt = 1;
    return defender;
  });
  r.model.activateNativeHeroAbility('king');
  r.model.step(0.05);
  const shots = r.battle.nativeSpikyBallCasts![0].shots;
  expect(shots).toHaveLength(3);
  expect(shots.map((shot) => shot.impact)).toEqual([0.01, 0.02, 0.03]);
  expect(defenders.map((d) => d.hp)).toEqual([8750, 8750, 8750, 10000, 10000, 10000]);
  expect(r.battle.projectiles?.some((shot) => shot.native?.spikyBall)).toBe(false);
});

it('caps later contacts at the source 70-tile bounce distance', () => {
  const r = spikyBallBattle(27);
  holdKing(r);
  for (const b of r.battle.buildings) if (b.id !== 2) b.x += 100;
  r.model.activateNativeHeroAbility('king');
  r.until(1);
  expect(r.battle.nativeSpikyBallCasts![0].shots).toHaveLength(1);
});

it('retains captured damage and every later bounce after the King is defeated', () => {
  const r = spikyBallBattle(27),
    king = holdKing(r);
  r.model.activateNativeHeroAbility('king');
  king.hp = 0;
  king.spent = true;
  r.until(5);
  expect(r.battle.nativeSpikyBallCasts![0].shots).toHaveLength(8);
  expect(r.battle.nativeSpikyBallCasts![0].shots.every((shot) => shot.damage === 3250)).toBe(true);
});

it.each([false, true])(
  'keeps Spiky Ball damage independent of a real Rage Vial in either item order, reverse=%s',
  (reverse) => {
    const items = [
      { slug: 'spiky-ball', level: 27 },
      { slug: 'rage-vial', level: 18 },
    ];
    const r = spikyBallBattle(27, undefined, reverse ? items.reverse() : items);
    const king = holdKing(r);
    r.model.activateNativeHeroAbility('king');
    expect(king.native!.effects!.boost!.damage).toBeGreaterThan(0);
    r.until(5);
    const shots = r.battle.nativeSpikyBallCasts![0].shots;
    expect(shots).toHaveLength(8);
    expect(shots.every((shot) => shot.damage === 3250 && shot.splash === undefined)).toBe(true);
  },
);

it('retains the actual moving defender landing after a snapshot breaks packet/journal aliases', () => {
  const r = spikyBallBattle(3),
    king = holdKing(r);
  r.battle.buildingEffects = Object.fromEntries(
    r.battle.buildings.map((b) => [b.id, { invisibleUntil: 100 }]),
  );
  const target = spawnSkeleton(r.battle, makeBuilding(30, 'skeletontrap', 0, 0, 1), -1, 0);
  Object.assign(target, { x: king.x + 4, y: king.y, hp: 10000, maxHp: 10000 });
  const initialX = target.x;
  r.model.activateNativeHeroAbility('king');
  const id = r.battle.nativeSpikyBallCasts![0].shots[0].id;
  r.model.step(0.05);
  r.model.battle = JSON.parse(JSON.stringify(r.model.battle));
  let landing: { x: number; y: number } | undefined;
  r.model.onEffect = (fx) => {
    if (fx.type === 'impact' && fx.projectileId === id) landing = { x: fx.toX!, y: fx.toY! };
  };
  for (let i = 0; i < 20 && !landing; i++) r.model.step(0.05);
  const record = r.model.battle!.nativeSpikyBallCasts![0].shots[0];
  expect(landing).toBeDefined();
  expect(record.x).toBeLessThan(initialX);
  expect({ x: record.x, y: record.y }).toEqual(landing);
  expect(r.model.battle!.defenders!.find((d) => d.id === target.id)!.hp).toBe(8750);
});

it.each([false, true])('reconstructs full portable ricochet history with Recall=%s', (recall) => {
  const r = nativeSpikyBallRecording(27, recall);
  const model = new GameModel();
  expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
  for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
    model.seekReplay(snapshot.at);
    while (model.replay!.seeking) model.step(0.05);
    expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
  }
  if (recall) {
    const later = r.snapshots.find((s) => s.at === r.later)!.battle as Battle;
    expect(later.units.some((unit) => unit.id === r.kingId)).toBe(false);
    expect(r.shots).toHaveLength(8);
  }
});

it('plays one original impact cue per contact and keeps its source volume and pitch', () => {
  const r = spikyBallBattle(3);
  holdKing(r);
  r.model.activateNativeHeroAbility('king');
  const cast = r.battle.nativeSpikyBallCasts![0],
    first = cast.shots[0];
  r.until(first.impact);
  const before = JSON.stringify(r.battle);
  const cues = troopSoundCues(r.battle, new BattleSoundLog()).filter((cue) =>
    cue.key.endsWith(':spiky:sound'),
  );
  expect(cues).toHaveLength(1);
  expect(cues[0]).toMatchObject({ key: `${first.id}:spiky:sound`, at: first.impact, volume: 0.8 });
  expect(cues[0].pitch).toBeGreaterThanOrEqual(0.95);
  expect(cues[0].pitch).toBeLessThanOrEqual(1.05);
  expect(JSON.stringify(r.battle)).toBe(before);
});

it('version 133 retains the previous Spiky Ball activation without ricochet state', () => {
  const r = spikyBallBattle(27, 133);
  holdKing(r);
  r.model.activateNativeHeroAbility('king');
  r.until(2);
  expect(r.battle.nativeSpikyBall).toBeUndefined();
  expect(r.battle.nativeSpikyBallCasts).toBeUndefined();
  expect(r.battle.projectiles?.some((p) => p.native?.spikyBall)).toBe(false);
});
