import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, makeBuilding } from '../src/game/model';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { nativeRow, num } from '../src/game/native-data';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  flameFlingerBurnBattle,
  flameFlingerBurnRecording,
} from './fixtures/flame-flinger-wall-burn';

for (const level of [1, 2, 3, 4, 5])
  it(`Flame Flinger ${level} adds its flat Wall pulse preference while preserving the poison ramp`, () => {
    const old = flameFlingerBurnBattle(level, 225),
      current = flameFlingerBurnBattle(level, 226);
    const firstPulse = (r: ReturnType<typeof flameFlingerBurnBattle>) => {
      while (!r.battle.nativeSpells?.some((c) => c.name === 'FireSpiritExplosion' && c.hits))
        r.step();
    };
    firstPulse(old);
    firstPulse(current);
    const row = nativeRow('spells', 'FireSpiritExplosion', level),
      poison = num(row, 'PoisonDPS') * 0.4 * (0.4 / 5),
      wall = current.battle.buildings.find((b) => b.id === 3)!,
      storage = current.battle.buildings.find((b) => b.id === 4)!,
      oldWall = old.battle.buildings.find((b) => b.id === 3)!;
    expect(wall.maxHp - wall.hp).toBeCloseTo(25 + poison, 8);
    expect(storage.maxHp - storage.hp).toBeCloseTo(1 + poison, 8);
    expect(oldWall.hp - wall.hp).toBeCloseTo(24, 8);
    expect(current.battle.units).toEqual(old.battle.units);
    expect(current.battle.projectiles).toEqual(old.battle.projectiles);
    expect(current.battle.nativeSpells).toEqual(old.battle.nativeSpells);
    expect(current.battle.buildings.filter((b) => b.kind !== 'wall')).toEqual(
      old.battle.buildings.filter((b) => b.kind !== 'wall'),
    );
  });

for (const level of [1, 5])
  it(`a released level ${level} pool retains all 75 Wall pulses after caster loss`, () => {
    const r = flameFlingerBurnBattle(level, 226);
    while (!r.battle.projectiles?.some((p) => p.native?.kind === 'flameflinger')) r.step();
    r.unit.hp = 0;
    for (const b of r.battle.buildings) b.hp = b.maxHp = 100000;
    while (!r.battle.nativeSpells?.some((c) => c.name === 'FireSpiritExplosion')) r.step();
    const cast = r.battle.nativeSpells!.find((c) => c.name === 'FireSpiritExplosion')!,
      last = cast.firstHit + 74 * 0.4;
    r.until(last + 0.05);
    const wall = r.battle.buildings.find((b) => b.id === 3)!,
      storage = r.battle.buildings.find((b) => b.id === 4)!;
    expect(cast.hits).toBe(75);
    expect(storage.hp - wall.hp).toBeCloseTo(24 * 75, 7);
    const hp = wall.hp;
    r.until(last + 0.5);
    expect(wall.hp).toBe(hp);
  });

for (const version of [225, 226])
  for (const level of [1, 5])
    for (const x of [5, 11.4])
      it(`Flame Flinger ${level} from ${x} preserves complete version ${version} portable burn states`, () => {
        const r = flameFlingerBurnRecording(level, version, x),
          viewer = new GameModel();
        if (version === 225) {
          const hashes: Record<string, string> = {
            '1:5': '2aa6432edcf7b5179ce7252be3a291691480c0a3333a5fc9bdd5674c4f8e7f01',
            '1:11.4': '2b3dd1ef14b830500a5df4d8c102fe9ae2b269fdcacf404c4ea18ae437ff2280',
            '5:5': '206fd7ed42b04f75c2a172329526a8e16209ffaae75f2d1c27834a0cc8532982',
            '5:11.4': '0c4e7d96999e1c841a1ee81b2b7b18f8543ebb63048a0095b4b4bf8d05ec9d16',
          };
          expect(createHash('sha256').update(JSON.stringify(r.snapshots)).digest('hex')).toBe(
            hashes[`${level}:${x}`],
          );
        }
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(snapshot.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
        }
      });

it('only new carried Flame Flinger armies enable the Wall pulse correction', () => {
  const r = flameFlingerBurnBattle(1, 225);
  expect(r.battle.nativeFlameFlingerWallPulse).toBeUndefined();
  expect(replayBattle(r.data.initial, 226).nativeFlameFlingerWallPulse).toBe(true);
  r.data.initial.army.flameflinger = 0;
  expect(replayBattle(r.data.initial, 226).nativeFlameFlingerWallPulse).toBeUndefined();
});

it('the preferred flat pulse respects the existing radius, traps and Overgrowth immunity', () => {
  const r = flameFlingerBurnBattle(1, 226),
    edge = makeBuilding(10, 'wall', 12.5, 10, 18),
    outside = makeBuilding(11, 'wall', 12.5001, 10, 18),
    covered = makeBuilding(12, 'wall', 10, 10, 18),
    trap = makeBuilding(13, 'bomb', 10, 10, 1);
  r.battle.buildings = [edge, outside, covered, trap];
  (r.battle.buildingEffects ??= {})[covered.id] = { overgrownUntil: 100 };
  const cast = castNativeSpell(r.battle, 'FireSpiritExplosion', 1, 'attack', 10, 10, {
    immediate: true,
  });
  r.battle.elapsed = cast.firstHit;
  stepNativeSpells({
    battle: r.battle,
    damageBuilding: (b, d, at) => r.model.damage(b, d, at),
    effect: () => {},
  });
  expect(edge.maxHp - edge.hp).toBeCloseTo(27.56, 8);
  for (const b of [outside, covered, trap]) expect(b.hp).toBe(b.maxHp);
});

it('Lightning retains its existing building damage inside a new Flame Flinger army', () => {
  const pulse = (version: number) => {
    const r = flameFlingerBurnBattle(1, version),
      cast = castNativeSpell(r.battle, 'Lightning', 1, 'attack', 16, 11);
    r.battle.elapsed = cast.firstHit;
    stepNativeSpells({
      battle: r.battle,
      damageBuilding: (b, d, at) => r.model.damage(b, d, at),
      effect: () => {},
    });
    return r.battle.buildings;
  };
  expect(pulse(226)).toEqual(pulse(225));
});
