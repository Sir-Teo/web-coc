import { describe, it, expect } from 'vitest';
import heroes from '../reference/heroes/catalog.json' with { type: 'json' };
import townhall from '../reference/townhall/catalog.json' with { type: 'json' };
import {
  HERO_KEYS,
  HERO_SOURCE,
  heroAbility,
  heroCeiling,
  heroRequirement,
  heroSourceCeiling,
  heroUnlock,
  type HeroKey,
} from '../src/game/hero-roster';
import { KING_LEVELS } from '../src/game/king-progression';

describe('native hero roster', () => {
  it('carries all six home heroes with the level counts the source defines', () => {
    expect(HERO_KEYS).toEqual([
      'barbarianKing',
      'archerQueen',
      'grandWarden',
      'royalChampion',
      'minionPrince',
      'dragonDuke',
    ]);
    expect(Object.fromEntries(HERO_KEYS.map((k) => [k, heroSourceCeiling(k)]))).toEqual({
      barbarianKing: 110,
      archerQueen: 110,
      grandWarden: 85,
      royalChampion: 55,
      minionPrince: 95,
      dragonDuke: 25,
    });
    // The two Builder Base heroes share the source table and must stay out of the roster.
    expect(Object.values(HERO_SOURCE).map((h) => h.name)).not.toContain('BB Battle Machine');
  });

  it('derives the King identically to the Town Hall importer, cell for cell', () => {
    const own = heroes.heroes.barbarianKing.levels;
    expect(own).toHaveLength(townhall.heroes.barbarianKing.length);
    for (const [index, row] of own.entries()) {
      const other = townhall.heroes.barbarianKing[index];
      for (const key of ['level', 'hp', 'dps', 'recovery', 'cost', 'seconds', 'townhall', 'hall'])
        expect([key, row[key as keyof typeof row]]).toEqual([
          key,
          other[key as keyof typeof other],
        ]);
    }
    // And the module the game already reads is the same table.
    expect(KING_LEVELS).toHaveLength(own.length);
    expect(KING_LEVELS[29].hp).toBe(own[29].hp);
  });

  it('never lets a hero curve, gate or ability tier fall as it levels', () => {
    for (const key of HERO_KEYS) {
      const levels = HERO_SOURCE[key].levels;
      expect(levels.map((r) => r.level)).toEqual(levels.map((_, i) => i + 1));
      for (const [index, row] of levels.slice(1).entries()) {
        const previous = levels[index];
        for (const column of ['hp', 'dps', 'townhall', 'hall', 'tier'] as const)
          expect(`${key} ${column} ${row[column] >= previous[column]}`).toBe(
            `${key} ${column} true`,
          );
      }
      expect(levels[0].cost).toBe(0);
      expect(levels[0].seconds).toBe(0);
    }
  });

  it('gates every hero behind the Town Hall and Hero Hall its first row names', () => {
    expect(HERO_KEYS.map((k) => heroUnlock(k))).toEqual([
      { townhall: 4, hall: 1 },
      { townhall: 8, hall: 2 },
      { townhall: 11, hall: 5 },
      { townhall: 13, hall: 7 },
      { townhall: 9, hall: 3 },
      { townhall: 15, hall: 9 },
    ]);
    // Below its own unlock a hero has no level at all, and both gates bind.
    expect(heroCeiling('archerQueen', 7, 12)).toBe(0);
    expect(heroCeiling('archerQueen', 12, 1)).toBe(0);
    expect(heroCeiling('barbarianKing', 18, 12)).toBe(110);
    const capped = heroCeiling('barbarianKing', 9, 3);
    expect(capped).toBeGreaterThan(0);
    expect(capped).toBeLessThan(110);
    expect(heroRequirement('barbarianKing', capped)!.townhall).toBeGreaterThan(9);
    expect(heroRequirement('dragonDuke', 25)).toBeUndefined();
  });

  it('reads each hero ability from its own tier table', () => {
    for (const key of HERO_KEYS) {
      const source = HERO_SOURCE[key];
      expect(source.ability.name.endsWith('AbilityHeal')).toBe(true);
      expect(source.slots).toBe(2);
      expect(source.defaultItems).toHaveLength(2);
      const top = heroAbility(key, heroSourceCeiling(key));
      expect(top.seconds).toBeGreaterThan(0);
      expect(top.activations).toBeGreaterThan(0);
      expect(top.heal).toBe(source.levels[heroSourceCeiling(key) - 1].recovery);
    }
    // Only the Dragon Duke carries a passive alongside its activated ability.
    expect(HERO_KEYS.filter((k) => HERO_SOURCE[k].passives.length)).toEqual(['dragonDuke']);
    expect(HERO_SOURCE.dragonDuke.passives).toEqual(['DragonDukeRageWhenAlone']);
  });

  it('lists the equipment the source allows each hero, placeholders marked not dropped', () => {
    const all = HERO_KEYS.flatMap((k) => HERO_SOURCE[k].equipment.map((e) => e.name));
    expect(all).toHaveLength(61);
    expect(new Set(all).size).toBe(61);
    for (const key of HERO_KEYS)
      for (const item of HERO_SOURCE[key].equipment)
        expect(item.unused).toBe(item.name.startsWith('UNUSED'));
    // Every hero's default items are real records it is allowed to carry.
    for (const key of HERO_KEYS) {
      const owned = new Set(HERO_SOURCE[key].equipment.map((e) => e.name));
      for (const item of HERO_SOURCE[key].defaultItems) expect(owned.has(item)).toBe(true);
    }
    expect(HERO_SOURCE.barbarianKing.defaultItems).toEqual(['Barbarian Puppet', 'Rage Vial']);
    expect(HERO_SOURCE.archerQueen.defaultItems).toEqual(['Archer Puppet', 'Invisibility Vial']);
  });

  it('records how each hero moves and what it can hit', () => {
    const shape = (k: HeroKey) => {
      const h = HERO_SOURCE[k];
      return [h.flying, h.airTargets, h.groundTargets, h.resource];
    };
    expect(shape('barbarianKing')).toEqual([false, false, true, 'dark']);
    expect(shape('archerQueen')).toEqual([false, true, true, 'dark']);
    // The Warden's own row is his ground stance; the original toggles him into the air.
    expect(shape('grandWarden')).toEqual([false, true, true, 'elixir']);
    expect(shape('minionPrince')).toEqual([true, true, true, 'dark']);
    expect(shape('dragonDuke')).toEqual([true, true, true, 'dark']);
    for (const key of HERO_KEYS) {
      expect(HERO_SOURCE[key].housing).toBe(25);
      expect(HERO_SOURCE[key].speed).toBeGreaterThan(0);
      expect(HERO_SOURCE[key].range).toBeGreaterThan(0);
    }
  });
});
