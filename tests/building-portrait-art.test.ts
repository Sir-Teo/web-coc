import { expect, it } from 'vitest';
import catalog from '../reference/full-client/catalog.json';
import barracks from '../public/assets/village-native/barracks/graph.json';
import laboratory from '../public/assets/village-native/laboratory/graph.json';
import spellFactory from '../public/assets/village-native/spellfactory/graph.json';
import { buildingPortrait } from '../src/ui/building-portrait-art';

it('binds resource and Army facility cards to the pinned body and base of each level', () => {
  let portraits = 0;
  for (const [kind, name] of [
    ['goldmine', 'Gold Mine'],
    ['collector', 'Elixir Collector'],
    ['goldstorage', 'Gold Storage'],
    ['elixirstorage', 'Elixir Storage'],
    ['barracks', 'Barracks'],
    ['laboratory', 'Laboratory'],
    ['spellfactory', 'Spell Factory'],
  ]) {
    for (const row of catalog.portraits.filter((row) => row.name === name)) {
      expect(row.artReferences).toMatchObject({
        ExportName: expect.any(String),
        ExportNameBase: expect.any(String),
      });
      expect(buildingPortrait(kind, row.level)).toBe(`/${row.path}`);
      portraits++;
    }
  }
  expect(portraits).toBe(116);
});

it('matches the body and base selected by the village renderer for every Army facility tier', () => {
  const facilities = [
    ['Barracks', barracks],
    ['Laboratory', laboratory],
    ['Spell Factory', spellFactory],
  ] as const;
  for (const [name, pack] of facilities) {
    const rows = catalog.portraits.filter((row) => row.name === name);
    expect(rows).toHaveLength(pack.levels.length);
    for (const row of rows) {
      const refs = pack.levels.find(({ level }) => level === row.level)?.refs;
      expect(refs, row.id).toBeDefined();
      expect(row.artReferences.ExportName, row.id).toBe(refs?.ExportName.export);
      expect(row.artReferences.ExportNameBase, row.id).toBe(refs?.ExportNameBase.export);
    }
  }
});

it('binds Town Hall, core support, Air Defense, traps, and low-tier Builder Huts to native catalog portraits', () => {
  for (const [kind, name] of [
    ['townhall', 'Town Hall'],
    ['herohall', 'Hero Hall'],
    ['blacksmith', 'Blacksmith'],
    ['airdefense', 'Air Defense'],
    ['bomb', 'Bomb'],
    ['giantbomb', 'Giant Bomb'],
    ['airbomb', 'Air Bomb'],
    ['springtrap', 'Spring Trap'],
  ]) {
    const rows = catalog.portraits.filter((row) => row.name === name);
    expect(rows.length, kind).toBeGreaterThan(0);
    for (const row of rows) expect(buildingPortrait(kind, row.level)).toBe(`/${row.path}`);
  }
  for (const level of [1, 2, 3, 4])
    expect(buildingPortrait('builder', level)).toBe(
      `/assets/catalog-native/builders-hut/level-${level}.png`,
    );
  for (const level of [5, 6, 7, 8]) expect(buildingPortrait('builder', level)).toBeUndefined();
});
