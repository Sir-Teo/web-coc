import { expect, it } from 'vitest';
import catalog from '../reference/full-client/catalog.json';
import { resourceBuildingPortrait } from '../src/ui/resource-building-art';

it('binds resource-building cards to the pinned body and base of each level', () => {
  let portraits = 0;
  for (const [kind, name] of [
    ['goldmine', 'Gold Mine'],
    ['collector', 'Elixir Collector'],
    ['goldstorage', 'Gold Storage'],
    ['elixirstorage', 'Elixir Storage'],
  ]) {
    for (const row of catalog.portraits.filter((row) => row.name === name)) {
      expect(row.artReferences).toMatchObject({
        ExportName: expect.any(String),
        ExportNameBase: expect.any(String),
      });
      expect(resourceBuildingPortrait(kind, row.level)).toBe(`/${row.path}`);
      portraits++;
    }
  }
  expect(portraits).toBe(72);
});
