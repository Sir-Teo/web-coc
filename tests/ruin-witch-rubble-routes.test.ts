import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel } from '../src/game/model';
import { findSubtilePath, subtileReachability, subtileSolid } from '../src/game/subtile-path';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { attackingRuinKnightRecording } from './fixtures/attacking-ruin-knight';
import {
  ruinWitchRubbleBattle,
  ruinWitchRubbleRecording,
} from './fixtures/ruin-witch-rubble-routes';

for (let level = 1; level <= 4; level++)
  for (const open of [false, true])
    it(`Ruin Witch ${level} uses reachable rubble and respects living walls, open=${open}`, () => {
      const r = ruinWitchRubbleBattle(level, 220, open);
      while (r.battle.elapsed < 20 - 1e-9) {
        r.step();
        expect(
          r.battle.buildings.some(
            (b) =>
              b.kind === 'wall' &&
              b.hp > 0 &&
              Math.floor(r.unit.x) === b.x &&
              Math.floor(r.unit.y) === b.y,
          ),
        ).toBe(false);
        if (!open) expect(r.battle.consumedRubble ?? []).not.toContain(2);
      }
      expect(r.battle.buildings.filter((b) => b.kind === 'goldmine').every((b) => b.hp <= 0)).toBe(
        true,
      );
      expect(r.battle.buildings.filter((b) => b.kind === 'wall').every((b) => b.hp > 0)).toBe(true);
      expect(r.battle.consumedRubble?.[0]).toBe(open ? 2 : 3);
      expect(
        r.battle.units.some(
          (u) => u.kind === 'ruinknight' && u.level === level && u.native?.owner === r.unit.id,
        ),
      ).toBe(true);
    });

for (let level = 1; level <= 4; level++)
  for (const open of [false, true])
    it(`native sub-tile Ruin Witch ${level} respects reachable rubble, open=${open}`, () => {
      const r = ruinWitchRubbleBattle(level, 220, open);
      // Isolated movement coverage: portable witnesses retain their real practice metadata.
      r.battle.nativeSubtiles = true;
      while (r.battle.elapsed < 20 - 1e-9) {
        r.step();
        expect(
          r.battle.buildings.some(
            (b) =>
              b.kind === 'wall' &&
              b.hp > 0 &&
              Math.floor(r.unit.x) === b.x &&
              Math.floor(r.unit.y) === b.y,
          ),
        ).toBe(false);
        if (!open) expect(r.battle.consumedRubble ?? []).not.toContain(2);
      }
      expect(r.battle.consumedRubble?.[0]).toBe(open ? 2 : 3);
      expect(r.battle.units.some((u) => u.kind === 'ruinknight' && u.level === level)).toBe(true);
    });

it('a closed ring leaves the Witch waiting when no other rubble is available', () => {
  const r = ruinWitchRubbleBattle(1, 220, false, false);
  r.until(8);
  expect(r.battle.buildings.find((b) => b.id === 2)!.hp).toBe(0);
  expect(r.battle.consumedRubble).toEqual([]);
  expect(r.unit.native!.ruin!.rubble).toBeUndefined();
  expect(r.unit.x).toBeLessThan(11);
  expect(r.battle.units.some((u) => u.kind === 'ruinknight')).toBe(false);
});

it('opening a wall refreshes cached reachability and releases the waiting Witch', () => {
  const r = ruinWitchRubbleBattle(1, 220, false, false);
  r.until(4);
  expect(r.battle.consumedRubble).toEqual([]);
  const wall = r.battle.buildings.find((b) => b.kind === 'wall' && b.x === 11 && b.y === 15)!;
  r.model.damage(wall, wall.hp);
  r.until(20);
  expect(r.battle.consumedRubble).toContain(2);
  expect(r.battle.units.some((u) => u.kind === 'ruinknight')).toBe(true);
});

it('a real Jump spell makes the closed rubble reachable', () => {
  const r = ruinWitchRubbleBattle(1, 220, false, false, true);
  r.until(4);
  expect(r.battle.consumedRubble).toEqual([]);
  r.model.activeSpell = 'jump';
  expect(r.model.castSpell(11.5, 15.5)).toBe(true);
  r.until(20);
  expect(r.battle.consumedRubble).toContain(2);
  expect(r.battle.units.some((u) => u.kind === 'ruinknight')).toBe(true);
});

for (const subtiles of [false, true])
  it(`a Witch left on a wall can leave for adjacent open ground, subtiles=${subtiles}`, () => {
    const r = ruinWitchRubbleBattle(1, 220);
    if (subtiles) r.battle.nativeSubtiles = true;
    r.until(4);
    // Isolate the post-Jump position: coverage is gone and the body is on the wall's outer half.
    r.unit.x = 11.25;
    r.unit.y = 15.5;
    r.unit.path = [];
    r.unit.pathAt = 0;
    r.until(20);
    expect(r.battle.consumedRubble?.[0]).toBe(3);
    expect(r.unit.x).toBeLessThan(11);
  });

for (const effect of ['invisibleUntil', 'overgrownUntil'] as const)
  it(`Ruin Witch waits for rubble hidden by ${effect} and retries after expiry`, () => {
    const r = ruinWitchRubbleBattle(1, 220, true, false);
    while (r.battle.buildings.find((b) => b.id === 2)!.hp > 0) r.step();
    const until = r.battle.elapsed + 4;
    (r.battle.buildingEffects ??= {})[2] = { [effect]: until };
    r.until(until - 0.05);
    expect(r.battle.consumedRubble).toEqual([]);
    expect(r.unit.native!.ruin!.rubble).toBeUndefined();
    r.until(until + 5);
    expect(r.battle.consumedRubble).toContain(2);
  });

it('hiding a pile while the Witch approaches cancels its old route', () => {
  const r = ruinWitchRubbleBattle(1, 220, true, false);
  r.until(3);
  expect(r.unit.native!.ruin!.rubble).toBe(2);
  (r.battle.buildingEffects ??= {})[2] = { invisibleUntil: 10 };
  r.step();
  expect(r.unit.native!.ruin!.rubble).toBeUndefined();
  expect(r.unit.path).toEqual([]);
  r.until(9);
  expect(r.battle.consumedRubble).toEqual([]);
  r.until(15);
  expect(r.battle.consumedRubble).toContain(2);
});

it('strict routes take a longer open detour instead of the old wall-breaking shortcut', () => {
  const r = ruinWitchRubbleBattle(1, 219, false, false),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  target.hp = 0;
  r.battle.buildings.find((b) => b.kind === 'wall' && b.x === 19 && b.y === 15)!.hp = 0;
  const buildings = r.battle.buildings,
    old = findSubtilePath(r.unit, target, buildings, 1),
    strict = findSubtilePath(r.unit, target, buildings, 1, true),
    solid = subtileSolid(buildings);
  expect(old.some((p) => solid(p.x, p.y))).toBe(true);
  expect(strict.length).toBeGreaterThan(old.length);
  expect(strict.some((p) => solid(p.x, p.y))).toBe(false);
  expect(subtileReachability(r.unit, buildings)(target)).toBe(true);
  expect(findSubtilePath(r.unit, target, buildings, 1)).toEqual(old);
});

it('strict and ordinary route caches stay separate across closed/open geometry', () => {
  const r = ruinWitchRubbleBattle(1, 219, false, false),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  target.hp = 0;
  const buildings = r.battle.buildings,
    old = findSubtilePath(r.unit, target, buildings, 1),
    before = subtileReachability(r.unit, buildings);
  expect(old.length).toBeGreaterThan(0);
  expect(findSubtilePath(r.unit, target, buildings, 1, true)).toEqual([]);
  expect(before(target)).toBe(false);
  r.battle.buildings.find((b) => b.kind === 'wall' && b.x === 11 && b.y === 15)!.hp = 0;
  expect(subtileReachability(r.unit, buildings)(target)).toBe(true);
  expect(findSubtilePath(r.unit, target, buildings, 1, true).length).toBeGreaterThan(0);
  expect(before(target)).toBe(false);
});

for (const level of [1, 4])
  it(`wall-free Ruin Witch ${level} keeps exact version-219 physical snapshots`, () => {
    const old = attackingRuinKnightRecording(level, 219),
      current = attackingRuinKnightRecording(level, 220);
    const actual = structuredClone(current.snapshots);
    for (const s of actual) delete s.battle.nativeRuinWitchRubbleRoutes;
    expect(actual).toEqual(old.snapshots);
  });

it('only new recordings carrying Ruin Witch enable wall-safe rubble routes', () => {
  const r = ruinWitchRubbleBattle(1, 219);
  expect(replayBattle(r.data.initial, 219).nativeRuinWitchRubbleRoutes).toBeUndefined();
  expect(replayBattle(r.data.initial, 220).nativeRuinWitchRubbleRoutes).toBe(true);
  r.data.initial.army.ruinwitch = 0;
  expect(replayBattle(r.data.initial, 220).nativeRuinWitchRubbleRoutes).toBeUndefined();
});

for (const version of [219, 220])
  for (const level of [1, 4])
    for (const open of [false, true])
      it(`Ruin Witch ${level}, open=${open} preserves complete portable version-${version} states`, () => {
        const r = ruinWitchRubbleRecording(level, version, open),
          viewer = new GameModel();
        if (version === 219) {
          const hashes: Record<string, string> = {
            '1:false': '542d1e4e0b95f33d8d6fcd2b42b9c2121449085cdccb9ad439988673df845dcb',
            '1:true': '935265c6d972d67bd530e883e4388d2774cecebd236ae8938807ff16de198682',
            '4:false': 'ee51f6b99424be1fa1ed7e25848b8762ec1e9240227245c53644da89559aa00b',
            '4:true': 'bbe2226c2514fa94bcfa248ac4adcface2322c11b850719fdb653c02f1f422d5',
          };
          expect(createHash('sha256').update(JSON.stringify(r.snapshots)).digest('hex')).toBe(
            hashes[`${level}:${open}`],
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
