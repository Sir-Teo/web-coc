import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { championHasteBattle, championHasteRecording } from './fixtures/champion-haste';
import { heroAttackInterval } from '../src/game/native-hero-abilities';
import { stepNativeUnit, type NativeTroopContext } from '../src/game/native-troops';
import { defendingHero } from '../src/game/defending-heroes';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateReplay } from '../src/game/replay';

function firstShot(model: GameModel, sourceId: number) {
  for (let remaining = 100; remaining > 0; remaining--) {
    model.step(0.05);
    const shot = model.battle!.projectiles?.find((p) => p.sourceId === sourceId);
    if (shot) return shot;
  }
  throw Error('Champion did not fire');
}

it.each([
  [1, 0.75, 0.05, 7],
  [6, 0.666, 0.08, 8],
  [15, 0.6, 0.14, 9.5],
  [18, 0.6, 0.16, 10],
])(
  'applies level %s source interval and passive speed without changing hit damage',
  (level, raw, passive, duration) => {
    const { model, hero, unit, base } = championHasteBattle(level);
    expect(model.activateNativeHeroAbility('champion')).toBe(true);
    expect(unit.native?.effects?.attackInterval).toEqual({
      until: duration,
      seconds: raw / (1 + passive),
    });
    const shot = firstShot(model, unit.id);
    expect(unit.cooldown).toBeCloseTo(raw / (1 + passive), 12);
    expect(shot.damage).toBe(base.damage);
    expect(hero.abilityUsed).toBe(true);
    expect(heroAttackInterval(unit, duration, base.rate)).toBe(base.rate);
  },
);

it.each([false, true])('resets defender-targeted hits to the Haste interval with air=%s', (air) => {
  const { model, battle, unit, base } = championHasteBattle();
  battle.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  const target = defendingHero(
    { kind: air ? 'prince' : 'king', level: air ? 95 : 110, x: 7.5, y: 6.5 },
    0,
  );
  target.alerted = true;
  battle.defenders = [target];
  model.activateNativeHeroAbility('champion');
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map([[1, battle.buildings[0]]]),
    passableWalls: new Set(),
    nextId: () => 2000,
    troopLevel: () => 1,
    damageBuilding: () => {},
    effect: () => {},
  };
  unit.native!.effects!.poison = { since: 0, until: 100, speed: -0.35, attackSpeed: -0.35, dps: 0 };
  stepNativeUnit(ctx, unit, { damage: base.damage, speed: base.speed }, 0.05);
  expect(unit.cooldown).toBeCloseTo(0.6 / 1.16 / 0.65, 12);
  const shot = battle.projectiles!.find((p) => p.sourceId === unit.id)!;
  expect(shot.targetDefender).toBe(true);
  expect(shot.toAir).toBe(air);
  expect(shot.damage).toBe(base.damage);
});

it('preserves version 77 combat and its uncombined rendering interval', () => {
  const { model, unit, base } = championHasteBattle(18, 77);
  model.activateNativeHeroAbility('champion');
  expect(unit.native?.effects?.attackInterval?.seconds).toBe(0.6);
  firstShot(model, unit.id);
  expect(unit.cooldown).toBe(base.rate);
});

it.each([1, 18])(
  'reconstructs level %s actual Haste attacks and expiry through portable backward seeks',
  (level) => {
    const { data, snapshots, shots, interval, baseInterval, damage, normal } =
      championHasteRecording(level);
    expect(validateReplay(data)).toBe(true);
    const active = shots.filter((s) => s.boosted),
      expired = shots.filter((s) => !s.boosted);
    expect(active.length).toBeGreaterThanOrEqual(5);
    expect(expired.length).toBeGreaterThanOrEqual(1);
    for (const shot of active) expect(shot.cooldown).toBeCloseTo(interval, 12);
    for (const shot of expired) expect(shot.cooldown).toBeCloseTo(baseInterval, 12);
    for (const shot of shots) expect(shot.projectile.damage).toBe(damage);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    expect(viewer.openReplay({ ...data, version: 77 })).toBe(true);
    viewer.seekReplay(normal);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const damageDone = (battle: Battle) =>
      battle.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0);
    expect(damageDone(viewer.battle!)).toBeLessThan(damageDone(snapshots.at(-1)!.battle as Battle));
  },
);
