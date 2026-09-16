import { describe, expect, it } from 'vitest';
import { makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { BUILDINGS, TROOP_KEYS, buildingHp, defenseDamage, trapStats } from '../src/game/data';
import { NATIVE_COMBAT } from '../src/game/native-campaign';
import { REPLAY_VERSION, validateReplay, type ReplayData } from '../src/game/replay';
import { WALL_LEVELS } from '../src/game/wall-stats';

const replay = (kind: 'wall' | 'airdefense' | 'bomb', level: number, version = REPLAY_VERSION) =>
  ({
    version,
    initial: {
      index: 0,
      practice: true,
      nextId: 100,
      buildings: [makeBuilding(1, kind, 10, 10, level)],
      army: emptyArmy(),
      spells: emptySpells(),
      spellLevels: {
        heal: 1,
        rage: 1,
        lightning: 1,
        freeze: 1,
        invisibility: 1,
        jump: 1,
        clone: 1,
        recall: 1,
        revive: 1,
      },
      troopLevels: Object.fromEntries(TROOP_KEYS.map((k) => [k, 1])) as ReturnType<
        typeof emptyArmy
      >,
    },
    steps: [],
    actions: [{ type: 'end', step: 0 }],
  }) satisfies ReplayData;

describe('late single-player campaign levels', () => {
  it('uses the pinned source hitpoints and damage for every added level', () => {
    // Campaign placements read hitpoints from the pinned combat table.
    // The home catalog now carries every original wall level; 13-16 are the campaign rows.
    expect(BUILDINGS.wall.maxLevel).toBe(19);
    expect(WALL_LEVELS.slice(12, 16).map((row) => row.hp)).toEqual(
      NATIVE_COMBAT[1000010].hp.slice(12, 16),
    );
    for (const level of [11, 12, 13]) {
      expect(buildingHp('airdefense', level)).toBe(NATIVE_COMBAT[1000012].hp[level - 1]);
      expect(defenseDamage('airdefense', level)).toBe(NATIVE_COMBAT[1000012].dps[level - 1]);
    }
    expect([9, 10, 11].map((level) => trapStats('bomb', level)!.damage)).toEqual([125, 140, 155]);
    expect([6, 7, 8].map((level) => trapStats('giantbomb', level)!.damage)).toEqual([
      325, 375, 400,
    ]);
    expect([6, 7, 8].map((level) => trapStats('giantbomb', level)!.radius)).toEqual([4, 4, 4]);
    expect([7, 8, 9, 10].map((level) => trapStats('airbomb', level)!.damage)).toEqual([
      252, 280, 325, 350,
    ]);
    expect(BUILDINGS.goldstorage.maxLevel).toBe(19);
    expect(BUILDINGS.elixirstorage.maxLevel).toBe(19);
    expect(BUILDINGS.goldmine.maxLevel).toBe(17);
    expect(BUILDINGS.collector.maxLevel).toBe(17);
  });

  it('accepts added levels only in version 44 recordings', () => {
    // `added` is the version 44-45 ceiling; the home catalog reaches further from version 46.
    for (const [kind, previous, added] of [
      ['wall', 12, 16],
      ['airdefense', 10, 13],
      ['bomb', 8, 11],
    ] as const) {
      expect(validateReplay(replay(kind, previous, 43))).toBe(true);
      expect(validateReplay(replay(kind, previous + 1, 43))).toBe(false);
      expect(validateReplay(replay(kind, added, 45))).toBe(true);
      expect(validateReplay(replay(kind, added + 1, 45))).toBe(false);
      expect(validateReplay(replay(kind, added + 1))).toBe(true);
      expect(validateReplay(replay(kind, BUILDINGS[kind].maxLevel + 1))).toBe(false);
    }
  });
});
